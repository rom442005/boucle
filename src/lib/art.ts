import type { LngLat, Sport } from './types';
import { latToY, loadTile, lonToX, xToLon, yToLat } from './environment';
import { haversine, localProjector } from './geo';
import { eleAt } from './elevation';
import { applyCuts, removeSpurs } from './spurs';
import { deadEnds, findRetraces } from './retrace';
import { chainSize, ELEV_STEP, MAX_LOCATIONS, routeJobs, RoutingError, traceRoute, type Costing, type Job, type RouteResult } from './valhalla';
import { cumulativePts, cycleOf, densify, diameterOf, distancesTo, pointAlong, rotateCycle, tipsOf, type Drawing, type Pt } from './drawing';

/*
 * Mode Dessin : un parcours qui reproduit un dessin (« GPS art »).
 *
 * 1. Les rues autour du départ sont lues dans les tuiles vectorielles de la carte et transformées en carte
 *    des distances : en chaque point, à combien de mètres passe le chemin praticable le plus proche.
 * 2. Le dessin est posé sur cette carte de milliers de façons, sur l'appareil, sans requête : soit il passe
 *    par le départ (n'importe quel point du trait), soit il va chercher le meilleur endroit dans un rayon
 *    choisi (« c'est l'aventure »), avec une légère rotation. On garde les poses où le trait longe le plus
 *    de rues, affinées ensuite avec des tuiles plus détaillées.
 * 3. Pour les meilleures poses, le service d'itinéraires cherche le chemin qui colle le mieux au trait
 *    (« map matching »). Là où il se coupe (fleuve sans pont, grand terrain fermé), les morceaux sont reliés
 *    par des points posés sur le trait lui-même : la liaison suit le dessin au lieu de couper au plus court.
 *    Les petits allers-retours parasites sont retirés (jamais les pointes du dessin).
 * 4. La taille est corrigée jusqu'à tenir la distance ; la ressemblance est mesurée (couverture × précision).
 *    Le rapport longueur du parcours / longueur du trait n'est appris que sur des tracés fidèles.
 */

/* ------------------------------- Carte des distances aux rues ------------------------------- */

export interface RoadField {
  size: number;
  /** mètres par pixel */
  mpp: number;
  /** demi-côté de la zone couverte (m) */
  half: number;
  /** centre de la zone (m depuis l'origine, x vers l'est, y vers le nord) ; l'origine par défaut */
  cx?: number;
  cy?: number;
  dist: Float32Array;
  /** distance (m) au chemin praticable le plus proche ; x vers l'est, y vers le nord, en mètres depuis l'origine */
  at(x: number, y: number): number;
}

const BLOCKED = new Set(['motorway', 'trunk', 'rail', 'transit', 'ferry', 'aerialway', 'raceway', 'bus_guideway', 'busway']);

/** Voie praticable pour ce sport (classes du schéma OpenMapTiles). */
export function usableWay(props: Record<string, unknown>, sport: Sport): boolean {
  const cls = String(props.class ?? '');
  if (!cls || BLOCKED.has(cls) || cls.endsWith('_construction')) return false;
  const sub = String(props.subclass ?? '');
  // Les tunnels routiers ne se courent pas ; un passage souterrain piéton, si.
  if (props.brunnel === 'tunnel' && cls !== 'path') return false;
  if (sport === 'road') {
    if (cls === 'track') return false;
    if (cls === 'path' && sub !== 'cycleway') return false;
  }
  if ((sport === 'road' || sport === 'gravel') && sub === 'steps') return false;
  if (sub === 'platform') return false;
  return true;
}

/** Distance exacte au pixel allumé le plus proche (Felzenszwalb-Huttenlocher), en pixels. */
export function distanceTransform(grid: Uint8Array, n: number): Float32Array {
  const INF = 1e20;
  const tmp = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) tmp[i] = grid[i] ? 0 : INF;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = () => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      d[q] = dq * dq + f[v[k]];
    }
  };
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = tmp[y * n + x];
    pass();
    for (let y = 0; y < n; y++) tmp[y * n + x] = d[y];
  }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = tmp[y * n + x];
    pass();
    for (let x = 0; x < n; x++) out[y * n + x] = Math.sqrt(d[x]);
  }
  return out;
}

export interface FieldOptions {
  /** niveau de zoom des tuiles au plus (13 : toutes les rues et presque tous les chemins, sans les tuiles lourdes du 14) */
  maxZoom?: number;
  /** nombre de tuiles au plus (le niveau baisse tant qu'il en faut plus) */
  maxTiles?: number;
  /** côté de l'image au plus (px) */
  maxSize?: number;
}

/**
 * Carte des distances aux voies praticables, dans un carré de 2·half mètres centré sur `center` (mètres
 * depuis l'origine O). Toutes les coordonnées sont en mètres autour de O (projection locale).
 */
export async function roadField(
  O: LngLat,
  center: [number, number],
  half: number,
  sport: Sport,
  signal?: AbortSignal,
  opts: FieldOptions = {},
): Promise<RoadField | null> {
  const maxSize = opts.maxSize ?? 1400;
  const size = Math.max(256, Math.min(maxSize, Math.round((2 * half) / 6)));
  const mpp = (2 * half) / size;
  const [cx, cy] = center;
  const kx = 111320 * Math.cos((O[1] * Math.PI) / 180);
  const ky = 110540;
  const proj = localProjector(O);
  const [w, s] = proj.from(cx - half, cy - half);
  const [e, n] = proj.from(cx + half, cy + half);
  const X0 = lonToX(w);
  const X1 = lonToX(e);
  const Y0 = latToY(n);
  const Y1 = latToY(s);
  const count = (zz: number) => {
    const k = 2 ** zz;
    return (Math.floor(X1 * k) - Math.floor(X0 * k) + 1) * (Math.floor(Y1 * k) - Math.floor(Y0 * k) + 1);
  };
  // Le niveau 13 a toutes les rues et presque tous les chemins ; une grande zone se contente d'un niveau inférieur.
  let z = opts.maxZoom ?? 13;
  while (z > 9 && count(z) > (opts.maxTiles ?? 30)) z--;
  const k = 2 ** z;
  const jobs: Promise<[number, number, Awaited<ReturnType<typeof loadTile>>]>[] = [];
  for (let x = Math.floor(X0 * k); x <= Math.floor(X1 * k); x++)
    for (let y = Math.floor(Y0 * k); y <= Math.floor(Y1 * k); y++) jobs.push(loadTile(z, x, y, signal).then((t) => [x, y, t]));
  const tiles = await Promise.all(jobs);
  if (signal?.aborted) return null;

  const grid = new Uint8Array(size * size);
  let lit = 0;
  const plot = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    if (steps > 4 * size) return;
    for (let t = 0; t <= steps; t++) {
      const x = Math.floor(x0 + (steps ? (dx * t) / steps : 0));
      const y = Math.floor(y0 + (steps ? (dy * t) / steps : 0));
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = y * size + x;
      if (!grid[i]) {
        grid[i] = 1;
        lit++;
      }
    }
  };
  for (const [tx, ty, tile] of tiles) {
    const layer = tile?.layers.transportation;
    if (!layer) continue;
    const ext = layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 2 || !usableWay(f.properties, sport)) continue;
      for (const ring of f.loadGeometry()) {
        let px = 0;
        let py = 0;
        ring.forEach((p, j) => {
          const lon = xToLon((tx + p.x / ext) / k);
          const lat = yToLat((ty + p.y / ext) / k);
          const qx = ((lon - O[0]) * kx - cx + half) / mpp;
          const qy = (half - ((lat - O[1]) * ky - cy)) / mpp;
          if (j > 0) plot(px, py, qx, qy);
          px = qx;
          py = qy;
        });
      }
    }
  }
  if (lit < 20) return null;
  const px = distanceTransform(grid, size);
  const dist = new Float32Array(size * size);
  for (let i = 0; i < dist.length; i++) dist[i] = px[i] * mpp;
  return {
    size,
    mpp,
    half,
    cx,
    cy,
    dist,
    at(x, y) {
      const i = Math.floor((x - cx + half) / mpp);
      const j = Math.floor((half - (y - cy)) / mpp);
      if (i < 0 || j < 0 || i >= size || j >= size) return 1e4;
      return dist[j * size + i];
    },
  };
}

/* ------------------------------------ Poses du dessin ------------------------------------ */

export interface Pose {
  /** dessin qui passe par l'origine : point du tour posé sur elle (0 à 1 du tour) */
  a?: number;
  /** dessin posé ailleurs : position de son centre (m depuis l'origine) */
  cx?: number;
  cy?: number;
  /** rotation (degrés, sens inverse des aiguilles d'une montre) */
  rot: number;
  /** taille relative à la taille visée */
  scale: number;
  /** écart quadratique moyen du trait aux rues (m), pénalités comprises */
  cost: number;
}

const circ = (d: number) => {
  const x = ((d % 1) + 1) % 1;
  return Math.min(x, 1 - x);
};

/** Points régulièrement espacés sur le tour, et le centre du dessin (moyenne de ces points). */
function samplesOf(cycle: Pt[], M: number): { pts: Pt[]; center: Pt } {
  const cum = cumulativePts(cycle);
  const L = cum[cum.length - 1];
  const pts: Pt[] = [];
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < M; i++) {
    const p = pointAlong(cycle, cum, (i / M) * L).p;
    pts.push(p);
    sx += p[0];
    sy += p[1];
  }
  return { pts, center: [sx / M, sy / M] };
}

/**
 * Les meilleures poses d'un dessin qui passe par l'origine, différentes entre elles. `k` : mètres par unité
 * du carnet. Le dessin reste à peu près droit (au plus 15°) : un cœur penché se lit encore, un cœur couché non.
 */
export function bestPoses(cycle: Pt[], field: RoadField | null, k: number, want: number, avoid: Pose[] = []): Pose[] {
  if (!field) return [{ a: 0, rot: 0, scale: 1, cost: 0 }];
  const cum = cumulativePts(cycle);
  const L = cum[cum.length - 1];
  const M = 160;
  const { pts: samples } = samplesOf(cycle, M);
  const cap = Math.max(160, 0.06 * diameterOf(cycle) * k);
  const all: Pose[] = [];
  const ANCHORS = 36;
  for (let ai = 0; ai < ANCHORS; ai++) {
    const a = ai / ANCHORS;
    const A = pointAlong(cycle, cum, a * L).p;
    for (const rot of [-15, -10, -5, 0, 5, 10, 15]) {
      const c = Math.cos((rot * Math.PI) / 180);
      const s = Math.sin((rot * Math.PI) / 180);
      for (const scale of [0.94, 1, 1.06]) {
        const kk = k * scale;
        let sum = 0;
        for (const q of samples) {
          const u = q[0] - A[0];
          const v = A[1] - q[1];
          const d = Math.min(cap, field.at(kk * (u * c - v * s), kk * (u * s + v * c)));
          sum += d * d;
        }
        const cost = Math.sqrt(sum / M) * (1 + 0.006 * Math.abs(rot)) * (1 + 0.8 * Math.abs(scale - 1));
        all.push({ a, rot, scale, cost });
      }
    }
  }
  all.sort((x, y) => x.cost - y.cost);
  const distinct = (p: Pose, q: Pose) => circ((p.a ?? 0) - (q.a ?? 0)) >= 0.12 || Math.abs(p.rot - q.rot) >= 10;
  const out: Pose[] = [];
  for (const p of all) {
    if (out.length >= want) break;
    if (out.every((q) => distinct(p, q)) && avoid.every((q) => q.a == null || distinct(p, q))) out.push(p);
  }
  return out;
}

/**
 * Le meilleur endroit dans un rayon `reach` (m) autour de l'origine : le dessin y est posé de milliers de
 * façons (centre sur une grille, légère rotation), le point du trait le plus proche de l'origine devant être
 * à moins de `reach`. À écart égal, le plus proche l'emporte de peu.
 */
export function placesAround(cycle: Pt[], field: RoadField, k: number, reach: number, want: number, avoid: Pose[] = []): Pose[] {
  const M = 96;
  const { pts, center } = samplesOf(cycle, M);
  const U = pts.map((p) => p[0] - center[0]);
  const V = pts.map((p) => center[1] - p[1]);
  let rd = 0;
  for (let i = 0; i < M; i++) rd = Math.max(rd, k * Math.hypot(U[i], V[i]));
  const cap = Math.max(160, 0.12 * rd);
  const step = Math.max(field.mpp * 1.5, rd / 9);
  const R = reach + rd;
  const rots = [-12, -6, 0, 6, 12].map((r) => [r, Math.cos((r * Math.PI) / 180), Math.sin((r * Math.PI) / 180)] as const);
  const all: Pose[] = [];
  for (let gx = -R; gx <= R; gx += step)
    for (let gy = -R; gy <= R; gy += step) {
      if (gx * gx + gy * gy > R * R) continue;
      for (const [rot, c, s] of rots) {
        let near = Infinity;
        for (let i = 0; i < M; i += 4) {
          const x = k * (U[i] * c - V[i] * s) + gx;
          const y = k * (U[i] * s + V[i] * c) + gy;
          near = Math.min(near, x * x + y * y);
        }
        if (Math.sqrt(near) > reach + step) continue;
        let sum = 0;
        for (let i = 0; i < M; i++) {
          const d = Math.min(cap, field.at(k * (U[i] * c - V[i] * s) + gx, k * (U[i] * s + V[i] * c) + gy));
          sum += d * d;
        }
        const cost = Math.sqrt(sum / M) * (1 + 0.004 * Math.abs(rot)) * (1 + (0.06 * Math.sqrt(near)) / Math.max(reach, 1));
        all.push({ cx: gx, cy: gy, rot, scale: 1, cost });
      }
    }
  all.sort((x, y) => x.cost - y.cost);
  const distinct = (p: Pose, q: Pose) => q.cx == null || Math.hypot((p.cx ?? 0) - q.cx, (p.cy ?? 0) - (q.cy ?? 0)) >= rd * 0.5 || Math.abs(p.rot - q.rot) >= 10;
  const out: Pose[] = [];
  for (const p of all) {
    if (out.length >= want) break;
    if (out.every((q) => distinct(p, q)) && avoid.every((q) => distinct(p, q))) out.push(p);
  }
  return out;
}

/** Affine une pose autour d'elle-même sur une carte plus détaillée : décalage, rotation et taille fines. */
export function refinePose(cycle: Pt[], field: RoadField, k: number, pose: Pose, reach: number, span: number): Pose {
  const M = 160;
  const { pts, center } = samplesOf(cycle, M);
  const U = pts.map((p) => p[0] - center[0]);
  const V = pts.map((p) => center[1] - p[1]);
  let rd = 0;
  for (let i = 0; i < M; i++) rd = Math.max(rd, k * Math.hypot(U[i], V[i]));
  const cap = Math.max(160, 0.12 * rd);
  let best = pose;
  let bestCost = Infinity;
  const n = 4;
  for (let ix = -n; ix <= n; ix++)
    for (let iy = -n; iy <= n; iy++)
      for (const dr of [-4, 0, 4])
        for (const scale of [0.96, 1, 1.04]) {
          const gx = (pose.cx ?? 0) + (ix / n) * span;
          const gy = (pose.cy ?? 0) + (iy / n) * span;
          const rot = pose.rot + dr;
          const c = Math.cos((rot * Math.PI) / 180);
          const s = Math.sin((rot * Math.PI) / 180);
          const kk = k * scale;
          let sum = 0;
          let near = Infinity;
          for (let i = 0; i < M; i++) {
            const x = kk * (U[i] * c - V[i] * s) + gx;
            const y = kk * (U[i] * s + V[i] * c) + gy;
            near = Math.min(near, x * x + y * y);
            const d = Math.min(cap, field.at(x, y));
            sum += d * d;
          }
          if (Math.sqrt(near) > reach + 50) continue;
          const cost = Math.sqrt(sum / M) * (1 + 0.004 * Math.abs(rot)) * (1 + 0.8 * Math.abs(scale - 1));
          if (cost < bestCost) {
            bestCost = cost;
            best = { cx: gx, cy: gy, rot, scale, cost };
          }
        }
  return best;
}

/** Passage du carnet aux mètres pour une pose (nord en haut), en mètres autour de l'origine. */
export function poseTransform(cycle: Pt[], pose: Pose, k: number): (q: Pt) => Pt {
  const cum = cumulativePts(cycle);
  const ref = pose.a != null ? pointAlong(cycle, cum, (((pose.a % 1) + 1) % 1) * cum[cum.length - 1]).p : samplesOf(cycle, 96).center;
  const tx = pose.a != null ? 0 : (pose.cx ?? 0);
  const ty = pose.a != null ? 0 : (pose.cy ?? 0);
  const c = Math.cos((pose.rot * Math.PI) / 180);
  const s = Math.sin((pose.rot * Math.PI) / 180);
  const kk = k * pose.scale;
  return (q) => {
    const u = q[0] - ref[0];
    const v = ref[1] - q[1];
    return [kk * (u * c - v * s) + tx, kk * (u * s + v * c) + ty];
  };
}

/**
 * Le dessin posé, en mètres autour de l'origine : un tour qui commence au départ du parcours. Le départ est
 * l'origine (dessin qui y passe) ou le point du trait le plus proche de l'origine (dessin posé ailleurs).
 */
export function placeCycle(cycle: Pt[], pose: Pose, k: number): Pt[] {
  const cum = cumulativePts(cycle);
  const tf = poseTransform(cycle, pose, k);
  if (pose.a != null) return rotateCycle(cycle, cum, pose.a).map(tf);
  const placed = cycle.map(tf);
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < placed.length; i++) {
    const [ax, ay] = placed[i - 1];
    const [bx, by] = placed[i];
    const dx = bx - ax;
    const dy = by - ay;
    const l = dx * dx + dy * dy;
    const t = l > 0 ? Math.max(0, Math.min(1, (-ax * dx - ay * dy) / l)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < bestD) {
      bestD = d;
      best = cum[i - 1] + t * (cum[i] - cum[i - 1]);
    }
  }
  return rotateCycle(cycle, cum, best / cum[cum.length - 1]).map(tf);
}

/* -------------------------------- Du trait au parcours -------------------------------- */

const debug = (msg: string) => (globalThis as { __boucleDebug?: (m: string) => void }).__boucleDebug?.(msg);

const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

function lengthLL(coords: LngLat[]): number {
  let l = 0;
  for (let i = 1; i < coords.length; i++) l += haversine(coords[i - 1], coords[i]);
  return l;
}

/** Recolle des morceaux de trajet (et leurs profils d'altitude) bout à bout. */
export function joinResults(parts: RouteResult[]): RouteResult {
  const coords: LngLat[] = [];
  const spans: { from: number; len: number; r: RouteResult }[] = [];
  let acc = 0;
  for (const r of parts) {
    if (r.coords.length < 2) continue;
    const last = coords[coords.length - 1];
    let pts = r.coords;
    if (last) {
      const jump = haversine(last, pts[0]);
      if (jump < 1) pts = pts.slice(1);
      else acc += jump;
    }
    const len = lengthLL(r.coords);
    spans.push({ from: acc, len, r });
    coords.push(...pts);
    acc += len;
  }
  const total = lengthLL(coords);
  const ele: number[] = [];
  const at = (s: number) => {
    let sp = spans[0];
    for (const x of spans) if (s >= x.from) sp = x;
    const plen = (sp.r.profile.ele.length - 1) * sp.r.profile.step;
    const local = Math.max(0, Math.min(sp.len, s - sp.from)) * (sp.len > 0 ? plen / sp.len : 0);
    return eleAt(sp.r.profile, local);
  };
  for (let s = 0; s < total; s += ELEV_STEP) ele.push(at(s));
  ele.push(at(total));
  return { coords, profile: { step: ELEV_STEP, ele }, lengthM: total, maneuvers: parts.flatMap((p) => p.maneuvers) };
}

/** Regroupe des trajets à calculer en requêtes d'au plus 10 points (un trajet trop long est coupé en étapes). */
function packJobs(jobs: Job[]): Job[][] {
  const pieces: Job[] = [];
  for (const j of jobs) {
    const pts = j.points;
    if (pts.length <= MAX_LOCATIONS) pieces.push(j);
    else for (let i = 0; i < pts.length - 1; i += MAX_LOCATIONS - 1) pieces.push({ points: pts.slice(i, i + MAX_LOCATIONS) });
  }
  const out: Job[][] = [];
  let cur: Job[] = [];
  for (const p of pieces) {
    if (cur.length && chainSize([...cur, p]) > MAX_LOCATIONS) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Le chemin qui suit un trait posé (en mètres autour de l'origine, premier point = départ du parcours) :
 * une requête de « map matching », puis, là où le chemin s'est coupé, des liaisons qui passent par des points
 * du trait (pas le plus court chemin : le dessin reste entier). Rend aussi le nombre de requêtes faites.
 */
async function follow(
  proj: ReturnType<typeof localProjector>,
  ghost: Pt[],
  costing: Costing,
  field: RoadField | null,
  bike: boolean,
  signal?: AbortSignal,
): Promise<{ res: RouteResult | null; requests: number }> {
  let per = 0;
  for (let i = 1; i < ghost.length; i++) per += Math.hypot(ghost[i][0] - ghost[i - 1][0], ghost[i][1] - ghost[i - 1][1]);
  // Un point tous les 45 à 140 m à pied (80 à 220 m à vélo) : assez serré pour suivre le trait, assez lâche
  // pour ne pas couper le chemin. Les points à plus de 90 m de toute voie ne trouveraient rien : pas envoyés.
  const step = bike ? Math.max(80, Math.min(220, per / 110)) : Math.max(45, Math.min(140, per / 90));
  const dense = densify(ghost, step);
  const P = proj.from(...ghost[0]);
  const keptIdx: number[] = [];
  dense.forEach(([x, y], i) => {
    if (i === 0 || i === dense.length - 1 || !field || field.at(x, y) <= 90) keptIdx.push(i);
  });
  const shape = keptIdx.map((i) => proj.from(...dense[i]));
  shape[0] = P;
  shape[shape.length - 1] = P;
  let requests = 0;
  let pieces: Awaited<ReturnType<typeof traceRoute>> = [];
  try {
    requests++;
    const all = await traceRoute(shape, costing, signal);
    // Les tout petits morceaux (2 ou 3 points) se remplacent par une liaison : moins de raccords.
    pieces = all.filter((p, i) => (all.length === 1 || p.to - p.from >= 3) && (i === 0 || p.to > all[i - 1].to));
    debug(`dessin : ${shape.length} points tous les ${Math.round(step)} m → ${all.length} morceau(x), ${pieces.length} gardé(s) ${pieces.map((p) => `${p.from}-${p.to}`).join(' ')}`);
  } catch (e) {
    if (!(e instanceof RoutingError)) throw e;
    debug(`dessin : map matching impossible (${e.message}), liaisons seules`);
  }

  // Liaisons le long du trait : de la fin d'un morceau au début du suivant, par des points du dessin.
  const gapStep = Math.max(bike ? 400 : 160, Math.min(bike ? 1500 : 700, per / 30));
  const along = (d0: number, d1: number): LngLat[] => {
    const out: LngLat[] = [];
    let acc = 0;
    for (let i = d0 + 1; i < d1; i++) {
      acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
      if (acc >= gapStep) {
        acc = 0;
        // Un point loin de toute voie (fleuve, champ) n'est pas imposé : la liaison passe au mieux.
        if (!field || field.at(dense[i][0], dense[i][1]) <= (bike ? 600 : 250)) out.push(proj.from(...dense[i]));
      }
    }
    return out;
  };
  const gaps: Job[] = [];
  const order: (RouteResult | number)[] = [];
  const link = (a: LngLat, b: LngLat, d0: number, d1: number) => {
    const mid = along(d0, d1);
    if (!mid.length && haversine(a, b) <= 25) return;
    order.push(gaps.length);
    gaps.push({ points: [{ coord: a }, ...mid.map((coord) => ({ coord })), { coord: b }] });
  };
  let cursorCoord = P;
  let cursorDense = 0;
  for (const p of pieces) {
    const c = p.res.coords;
    link(cursorCoord, c[0], cursorDense, keptIdx[Math.min(p.from, keptIdx.length - 1)]);
    order.push(p.res);
    cursorCoord = c[c.length - 1];
    cursorDense = keptIdx[Math.min(p.to, keptIdx.length - 1)];
  }
  link(cursorCoord, P, cursorDense, dense.length - 1);
  const batches = packJobs(gaps);
  if (batches.length > 4) return { res: null, requests };
  const links: RouteResult[] = [];
  for (const b of batches) {
    links.push(...(await routeJobs(b, costing, signal)));
    requests++;
  }
  // Un trajet coupé en étapes (plus de 10 points) revient en plusieurs morceaux, dans l'ordre.
  const parts: RouteResult[] = [];
  let li = 0;
  for (const x of order) {
    if (typeof x !== 'number') {
      parts.push(x);
      continue;
    }
    const n = gaps[x].points.length <= MAX_LOCATIONS ? 1 : Math.ceil((gaps[x].points.length - 1) / (MAX_LOCATIONS - 1));
    for (let k = 0; k < n; k++) parts.push(links[li++]);
  }
  if (!parts.length) return { res: null, requests };
  return { res: joinResults(parts), requests };
}

/* ------------------------------------ Recherche ------------------------------------ */

export interface ArtCand {
  res: RouteResult;
  /** le dessin posé (le tour, en coordonnées), pour le montrer sous le parcours */
  ghost: LngLat[];
  /** ressemblance (0 à 1) */
  fit: number;
  /** écart moyen entre le trait et le parcours (m) */
  dev: number;
  /** point du parcours le plus loin du départ (pour le nom) */
  far: LngLat;
  /** départ du dessin (sur le trait) */
  start: LngLat;
  /** longueur du trajet d'accès depuis l'origine, compris au début du parcours (m) */
  approach: number;
  /** longueur du dessin seul (m) */
  L: number;
  err: number;
}

export interface ArtOptions {
  drawing: Drawing;
  /** lieu de départ choisi (position, maison…) */
  origin: LngLat;
  /** le dessin peut être posé jusqu'à cette distance de l'origine (m) ; 0 : il passe par elle */
  reach: number;
  /** le parcours commence à l'origine et va jusqu'au dessin */
  approach: boolean;
  /** distance visée pour le dessin (m) */
  D: number;
  sport: Sport;
  costing: Costing;
  /** rapport longueur du parcours / longueur du trait, appris dans ce quartier */
  ratio: number;
  deadline: number;
  signal?: AbortSignal;
  report: (message: string, ratio: number) => void;
  onGood?: (c: ArtCand) => void;
}

/**
 * Ressemblance (0 à 1) : la part du dessin que le parcours couvre et la part du parcours qui suit le dessin,
 * à 1,5 % de la taille du dessin près (au-delà, le point compte de moins en moins, plus du tout à 4 fois
 * cet écart), combinées comme une moyenne harmonique : il faut les deux. Rend aussi l'écart moyen (m).
 * Étalonnée sur des essais réels : 85 à 96 % pour un dessin bien rendu, 75 % quand un morceau manque.
 */
export function resemblance(route: Pt[], ghost: Pt[]): { dev: number; fit: number } {
  const diam = Math.max(1, diameterOf(ghost));
  const step = Math.max(6, diam / 200);
  const dr = distancesTo(densify(route, step), ghost);
  const dg = distancesTo(densify(ghost, step), route);
  const tol = Math.max(20, 0.015 * diam);
  const soft = (d: Float64Array) => {
    let s = 0;
    for (const x of d) s += x <= tol ? 1 : Math.max(0, 1 - (x - tol) / (3 * tol));
    return d.length ? s / d.length : 0;
  };
  const mean = (d: Float64Array) => d.reduce((a, x) => a + x, 0) / Math.max(1, d.length);
  const precision = soft(dr);
  const coverage = soft(dg);
  const fit = precision + coverage > 0 ? (2 * precision * coverage) / (precision + coverage) : 0;
  return { dev: (mean(dr) + mean(dg)) / 2, fit };
}

/** Le rapport longueur du parcours / longueur du trait reste raisonnable (un tracé raté ne l'apprend pas). */
export const clampRatio = (r: number, bike: boolean) => Math.min(bike ? 2.4 : 2.2, Math.max(1.12, Number.isFinite(r) ? r : 1.4));

/** Seuils : une proposition fidèle, une proposition montrable faute de mieux. */
export const FIT_GOOD = 0.8;
export const FIT_MIN = 0.62;

/**
 * Poses déjà proposées pour le même dessin, au même départ et à la même distance : « Autres propositions »
 * (ou un nouvel essai) pose le dessin autrement. La liste repart de zéro quand elle s'allonge trop.
 */
let lastKey = '';
const usedPoses: Pose[] = [];

export async function drawingLoops(o: ArtOptions): Promise<{ cands: ArtCand[]; ratio: number; lastError: RoutingError | null }> {
  const cycle = cycleOf(o.drawing);
  const bike = o.sport === 'road' || o.sport === 'gravel';
  const key = JSON.stringify([o.drawing.strokes.length, cycle.length, cycle[1], o.origin, o.reach, o.D, o.sport]);
  if (key !== lastKey || usedPoses.length > 16) {
    lastKey = key;
    usedPoses.length = 0;
  }
  if (cycle.length < 3) return { cands: [], ratio: o.ratio, lastError: null };
  const cum = cumulativePts(cycle);
  const Lp = cum[cum.length - 1];
  const O = o.origin;
  const proj = localProjector(O);
  let ratio = clampRatio(o.ratio, bike);
  const kOf = () => o.D / (Lp * ratio);
  const free = o.reach > 50;
  const diamM = () => diameterOf(cycle) * kOf();

  // Carte des distances aux voies : autour de l'origine (dessin qui y passe), ou sur toute la zone de recherche.
  o.report(free ? 'Recherche du meilleur endroit pour ton dessin…' : 'Lecture des rues autour du départ…', 0.06);
  const half = free ? o.reach + diamM() * 1.1 + 400 : Math.min(18000, diamM() * 1.2 + 500);
  const field = await within(
    roadField(O, [0, 0], half, o.sport, o.signal, free ? { maxTiles: 30 } : { maxTiles: 25 }).catch(() => null),
    8000,
    null,
  );
  if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  o.report(free ? 'Comparaison des endroits possibles…' : 'Placement du dessin sur les rues…', 0.2);

  /** Carte plus détaillée autour d'une pose (dessin posé ailleurs), gardée pour la suite. */
  const fine = new Map<Pose, RoadField | null>();
  const fineField = async (pose: Pose): Promise<RoadField | null> => {
    if (!free) return field;
    if (fine.has(pose)) return fine.get(pose)!;
    const f = await within(roadField(O, [pose.cx ?? 0, pose.cy ?? 0], diamM() * 0.7 + 500, o.sport, o.signal, { maxTiles: 16 }).catch(() => null), 5000, null);
    fine.set(pose, f);
    return f;
  };
  const posesFor = async (k: number, want: number, avoid: Pose[]): Promise<Pose[]> => {
    if (!free || !field) return bestPoses(cycle, field, k, want, avoid);
    // Les meilleurs endroits sur la carte d'ensemble, puis chacun affiné sur une carte détaillée.
    const coarse = placesAround(cycle, field, k, o.reach, want + 2, avoid);
    const fields = await Promise.all(coarse.map(fineField));
    const refined = coarse.map((p, i) => {
      const f = fields[i];
      const r = f ? refinePose(cycle, f, k, p, o.reach, Math.max(60, (diamM() / 9) * 0.6)) : p;
      fine.set(r, f);
      return r;
    });
    return refined.sort((a, b) => a.cost - b.cost).slice(0, want);
  };

  // Les pointes du dessin (étoile, bas d'un cœur) ne sont jamais prises pour des allers-retours parasites.
  const tips = tipsOf(cycle);
  type Item = { pose: Pose; k: number; tries: number };
  let kUsed = kOf();
  const queue: Item[] = (await posesFor(kUsed, 4, usedPoses)).map((pose) => ({ pose, k: kUsed, tries: 0 }));
  const tried: Pose[] = [];
  const cands: ArtCand[] = [];
  let goods = 0;
  let requests = 0;
  let learned = 0;
  let lastError: RoutingError | null = null;
  const MAX_REQUESTS = 11;
  let shown = false;

  /** Trajet d'accès depuis l'origine jusqu'au départ de chaque dessin, placé au début du parcours. */
  const addApproach = async (list: ArtCand[]): Promise<RoutingError | null> => {
    const far = list.filter((c) => haversine(O, c.start) > 60).slice(0, 5);
    if (!far.length) return null;
    try {
      const ways = await routeJobs(
        far.map((c) => ({ points: [{ coord: O }, { coord: c.start }] })),
        o.costing,
        o.signal,
      );
      far.forEach((c, i) => {
        const a = ways[i];
        if (!a) return;
        c.approach = a.lengthM;
        c.res = joinResults([a, c.res]);
      });
      return null;
    } catch (e) {
      if (o.signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw e;
      if (e instanceof RoutingError) return e;
      throw e;
    }
  };

  while (queue.length && requests < MAX_REQUESTS && Date.now() < o.deadline && goods < 3) {
    const item = queue.shift()!;
    if (item.tries === 0) tried.push(item.pose);
    const f = await fineField(item.pose);
    const ghostM = placeCycle(cycle, item.pose, item.k);
    const tf = poseTransform(cycle, item.pose, item.k);
    o.report(goods ? 'Autres façons de poser le dessin…' : 'Tracé du dessin, rue par rue…', Math.min(0.88, 0.3 + requests * 0.06));
    let out: { res: RouteResult | null; requests: number };
    try {
      out = await follow(proj, ghostM, o.costing, f, bike, o.signal);
    } catch (e) {
      if (o.signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw e;
      if (e instanceof RoutingError) {
        lastError = e;
        requests += 2;
        continue;
      }
      throw e;
    }
    requests += out.requests;
    if (!out.res) continue;
    const P = proj.from(...ghostM[0]);
    // Petits allers-retours parasites (une rue d'à côté prise puis quittée) : retirés, sauf vers une pointe.
    const keep = [P, ...tips.map((q) => proj.from(...tf(q)))];
    let cleaned = removeSpurs(out.res.coords, out.res.profile, 350, keep);
    for (let pass = 0; pass < 2; pass++) {
      const cuts = deadEnds(cleaned.coords, findRetraces(cleaned.coords), keep, 0, 60);
      if (!cuts.length) break;
      cleaned = applyCuts(cleaned.coords, cleaned.profile, cuts);
    }
    const res: RouteResult = { ...out.res, coords: cleaned.coords, profile: cleaned.profile, lengthM: lengthLL(cleaned.coords) };
    const L = res.lengthM;
    const routeM = res.coords.map((q) => proj.to(q) as Pt);
    const { dev, fit } = resemblance(routeM, ghostM);
    // Ce quartier allonge le trait de tant : appris seulement sur un tracé fidèle (un tracé raté, plus court
    // que son dessin, ferait grossir le suivant).
    const obs = L / (Lp * item.k * item.pose.scale);
    if (fit >= FIT_GOOD && Number.isFinite(obs)) {
      ratio = clampRatio(learned ? ratio * 0.5 + obs * 0.5 : obs, bike);
      learned++;
    }
    let far = res.coords[0];
    let farD = 0;
    for (const q of res.coords) {
      const d = haversine(P, q);
      if (d > farD) {
        farD = d;
        far = q;
      }
    }
    const err = (L - o.D) / o.D;
    debug(`dessin : pose ${item.pose.a != null ? `départ ${item.pose.a.toFixed(2)}` : `à ${Math.round(Math.hypot(item.pose.cx ?? 0, item.pose.cy ?? 0))} m`} ${item.pose.rot}° → ${(L / 1000).toFixed(1)} km, ressemblance ${Math.round(fit * 100)} %`);
    const cand: ArtCand = { res, ghost: ghostM.map(([x, y]) => proj.from(x, y)), fit, dev, far, start: P, approach: 0, L, err };
    if (!usedPoses.includes(item.pose)) usedPoses.push(item.pose);
    if (fit >= FIT_MIN) cands.push(cand);
    if (fit >= FIT_GOOD - 0.02 && Math.abs(err) <= 0.1) {
      goods++;
      // La première bonne proposition se montre tout de suite, avec son trajet d'accès s'il est demandé.
      if (!shown) {
        shown = true;
        if (o.approach && free) lastError = (await addApproach([cand])) ?? lastError;
        o.onGood?.(cand);
      }
    } else if (fit >= FIT_MIN && Math.abs(err) > 0.1 && item.tries < 2) {
      // Même pose, à la bonne taille.
      const k2 = item.k * Math.max(0.6, Math.min(1.6, (o.D / L) ** 1.05));
      queue.unshift({ pose: item.pose, k: k2, tries: item.tries + 1 });
    }
    // Taille apprise très différente : les poses qui restent sont recherchées à la nouvelle taille.
    const kNow = kOf();
    if (Math.abs(kNow / kUsed - 1) > 0.08) {
      kUsed = kNow;
      const fresh = queue.filter((q) => q.tries > 0);
      const more = (await posesFor(kNow, Math.max(1, 4 - tried.length), [...tried, ...usedPoses])).map((pose) => ({ pose, k: kNow, tries: 0 }));
      queue.length = 0;
      queue.push(...fresh, ...more);
    } else {
      for (const q of queue) if (q.tries === 0) q.k = kNow;
    }
  }

  // Le trajet d'accès des autres propositions, ajouté au début (une requête pour toutes).
  if (o.approach && free) lastError = (await addApproach(cands.filter((c) => !c.approach))) ?? lastError;
  return { cands, ratio, lastError };
}
