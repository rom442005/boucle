import type { LngLat, Sport } from './types';
import { latToY, loadTile, lonToX, xToLon, yToLat } from './environment';
import { haversine, localProjector } from './geo';
import { eleAt } from './elevation';
import { applyCuts, removeSpurs } from './spurs';
import { deadEnds, findRetraces } from './retrace';
import { ELEV_STEP, MAX_LOCATIONS, routeJobs, RoutingError, traceRoute, type Costing, type Job, type RouteResult } from './valhalla';
import { cumulativePts, cycleOf, densify, diameterOf, distancesTo, pointAlong, rotateCycle, tipsOf, type Drawing, type Pt } from './drawing';

/*
 * Mode Dessin : un parcours qui reproduit un dessin (« GPS art »).
 *
 * 1. Les rues autour du départ sont lues dans les tuiles vectorielles de la carte et transformées en carte
 *    des distances : en chaque point, à combien de mètres passe le chemin praticable le plus proche.
 * 2. Le dessin est posé sur cette carte de centaines de façons (le départ en un point du tour, une légère
 *    rotation, une taille un peu plus grande ou plus petite) : on garde les poses où le trait passe au plus
 *    près des rues. Tout cela se calcule sur l'appareil, sans requête.
 * 3. Pour les meilleures poses, le service d'itinéraires cherche le chemin qui colle le mieux au trait
 *    (« map matching »), une requête par pose ; les morceaux éventuels sont reliés, les petits
 *    allers-retours parasites retirés (pas les pointes du dessin).
 * 4. La taille du dessin est corrigée jusqu'à tenir la distance demandée ; la ressemblance est mesurée
 *    (écart moyen entre le trait et le parcours, rapporté à la taille du dessin).
 */

/* ------------------------------- Carte des distances aux rues ------------------------------- */

export interface RoadField {
  size: number;
  /** mètres par pixel */
  mpp: number;
  /** demi-côté de la zone couverte (m), centrée sur le départ */
  half: number;
  dist: Float32Array;
  /** distance (m) au chemin praticable le plus proche ; x vers l'est, y vers le nord, en mètres depuis le départ */
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

/** Carte des distances aux voies praticables, dans un carré de 2·half mètres centré sur le départ. */
export async function roadField(S: LngLat, half: number, sport: Sport, signal?: AbortSignal): Promise<RoadField | null> {
  const size = Math.max(256, Math.min(1024, Math.round((2 * half) / 7)));
  const mpp = (2 * half) / size;
  const kx = 111320 * Math.cos((S[1] * Math.PI) / 180);
  const ky = 110540;
  const proj = localProjector(S);
  const [w, s] = proj.from(-half, -half);
  const [e, n] = proj.from(half, half);
  const X0 = lonToX(w);
  const X1 = lonToX(e);
  const Y0 = latToY(n);
  const Y1 = latToY(s);
  const count = (zz: number) => {
    const k = 2 ** zz;
    return (Math.floor(X1 * k) - Math.floor(X0 * k) + 1) * (Math.floor(Y1 * k) - Math.floor(Y0 * k) + 1);
  };
  // Le niveau 14 a toutes les rues et tous les chemins ; plus loin, on se contente des niveaux inférieurs.
  let z = 14;
  while (z > 11 && count(z) > 36) z--;
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
          const qx = ((lon - S[0]) * kx + half) / mpp;
          const qy = (half - (lat - S[1]) * ky) / mpp;
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
    dist,
    at(x, y) {
      const i = Math.floor((x + half) / mpp);
      const j = Math.floor((half - y) / mpp);
      if (i < 0 || j < 0 || i >= size || j >= size) return 400;
      return dist[j * size + i];
    },
  };
}

/* ------------------------------------ Poses du dessin ------------------------------------ */

export interface Pose {
  /** point du tour posé sur le départ (0 à 1 du tour) */
  a: number;
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

/**
 * Les meilleures poses du dessin sur les rues, différentes entre elles. `k` : mètres par unité du carnet.
 * Le dessin reste à peu près droit (au plus 15°) : un cœur penché se lit encore, un cœur couché non.
 */
export function bestPoses(cycle: Pt[], field: RoadField | null, k: number, want: number, avoid: Pose[] = []): Pose[] {
  if (!field) return [{ a: 0, rot: 0, scale: 1, cost: 0 }];
  const cum = cumulativePts(cycle);
  const L = cum[cum.length - 1];
  const M = 160;
  const samples: Pt[] = [];
  for (let i = 0; i < M; i++) samples.push(pointAlong(cycle, cum, (i / M) * L).p);
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
          const d = Math.min(160, field.at(kk * (u * c - v * s), kk * (u * s + v * c)));
          sum += d * d;
        }
        const cost = Math.sqrt(sum / M) * (1 + 0.006 * Math.abs(rot)) * (1 + 0.8 * Math.abs(scale - 1));
        all.push({ a, rot, scale, cost });
      }
    }
  }
  all.sort((x, y) => x.cost - y.cost);
  const distinct = (p: Pose, q: Pose) => circ(p.a - q.a) >= 0.12 || Math.abs(p.rot - q.rot) >= 10;
  const out: Pose[] = [];
  for (const p of all) {
    if (out.length >= want) break;
    if (out.every((q) => distinct(p, q)) && avoid.every((q) => distinct(p, q))) out.push(p);
  }
  return out;
}

/** Passage du carnet aux mètres pour une pose : le point `a` du tour sur le départ (0, 0), nord en haut. */
export function poseTransform(cycle: Pt[], pose: Pose, k: number): (q: Pt) => Pt {
  const cum = cumulativePts(cycle);
  const A = pointAlong(cycle, cum, (((pose.a % 1) + 1) % 1) * cum[cum.length - 1]).p;
  const c = Math.cos((pose.rot * Math.PI) / 180);
  const s = Math.sin((pose.rot * Math.PI) / 180);
  const kk = k * pose.scale;
  return (q) => {
    const u = q[0] - A[0];
    const v = A[1] - q[1];
    return [kk * (u * c - v * s), kk * (u * s + v * c)];
  };
}

/** Le dessin posé : tour qui part du départ (0, 0), en mètres (x vers l'est, y vers le nord). */
export function placeCycle(cycle: Pt[], pose: Pose, k: number): Pt[] {
  return rotateCycle(cycle, cumulativePts(cycle), pose.a).map(poseTransform(cycle, pose, k));
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

/**
 * Le chemin qui suit un trait posé (en mètres autour du départ) : une requête de « map matching », puis,
 * si le chemin s'est coupé, une ou deux requêtes pour relier les morceaux. Rend aussi le nombre de
 * requêtes faites.
 */
async function follow(
  S: LngLat,
  ghost: Pt[],
  costing: Costing,
  field: RoadField | null,
  bike: boolean,
  signal?: AbortSignal,
): Promise<{ res: RouteResult | null; requests: number }> {
  const proj = localProjector(S);
  let per = 0;
  for (let i = 1; i < ghost.length; i++) per += Math.hypot(ghost[i][0] - ghost[i - 1][0], ghost[i][1] - ghost[i - 1][1]);
  // Un point tous les 45 à 140 m à pied (80 à 220 m à vélo) : assez serré pour suivre le trait, assez lâche
  // pour ne pas couper le chemin. Les points à plus de 90 m de toute voie ne trouveraient rien : retirés.
  const step = bike ? Math.max(80, Math.min(220, per / 110)) : Math.max(45, Math.min(140, per / 90));
  const dense = densify(ghost, step);
  const kept = dense.filter(([x, y], i) => i === 0 || i === dense.length - 1 || !field || field.at(x, y) <= 90);
  const shape = kept.map(([x, y]) => proj.from(x, y));
  shape[0] = S;
  shape[shape.length - 1] = S;
  const all = await traceRoute(shape, costing, signal);
  let requests = 1;
  // Les tout petits morceaux (2 ou 3 points) se remplacent par une liaison : moins de raccords.
  const pieces = all.filter((p, i) => (all.length === 1 || p.to - p.from >= 3) && (i === 0 || p.to > all[i - 1].to));
  debug(`dessin : ${shape.length} points tous les ${Math.round(step)} m → ${all.length} morceau(x), ${pieces.length} gardé(s) ${pieces.map((p) => `${p.from}-${p.to}`).join(' ')}`);
  if (!pieces.length) return { res: null, requests };
  // Morceaux à relier : avant le premier, entre deux morceaux, après le dernier.
  const gaps: Job[] = [];
  const order: (RouteResult | number)[] = [];
  const first = pieces[0].res.coords[0];
  if (haversine(S, first) > 25) {
    order.push(gaps.length);
    gaps.push({ points: [{ coord: S }, { coord: first }] });
  }
  pieces.forEach((p, i) => {
    if (i > 0) {
      const a = pieces[i - 1].res.coords[pieces[i - 1].res.coords.length - 1];
      const b = p.res.coords[0];
      if (haversine(a, b) > 25) {
        order.push(gaps.length);
        gaps.push({ points: [{ coord: a }, { coord: b }] });
      }
    }
    order.push(p.res);
  });
  const lastPiece = pieces[pieces.length - 1];
  const end = lastPiece.res.coords[lastPiece.res.coords.length - 1];
  if (haversine(end, S) > 25) {
    order.push(gaps.length);
    gaps.push({ points: [{ coord: end }, { coord: S }] });
  }
  const perRequest = Math.floor(MAX_LOCATIONS / 2);
  if (gaps.length > perRequest * 3) return { res: null, requests };
  const links: RouteResult[] = [];
  for (let i = 0; i < gaps.length; i += perRequest) {
    links.push(...(await routeJobs(gaps.slice(i, i + perRequest), costing, signal)));
    requests++;
  }
  const parts = order.map((x) => (typeof x === 'number' ? links[x] : x));
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
  L: number;
  err: number;
}

export interface ArtOptions {
  drawing: Drawing;
  start: LngLat;
  /** distance visée (m) */
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

/**
 * Poses déjà proposées pour le même dessin, au même départ et à la même distance : « Autres propositions »
 * (ou un nouvel essai) pose le dessin autrement. La liste repart de zéro quand elle s'allonge trop.
 */
let lastKey = '';
const usedPoses: Pose[] = [];

export async function drawingLoops(o: ArtOptions): Promise<{ cands: ArtCand[]; ratio: number; lastError: RoutingError | null }> {
  const cycle = cycleOf(o.drawing);
  const key = JSON.stringify([o.drawing.strokes.length, cycle.length, cycle[1], o.start, o.D, o.sport]);
  if (key !== lastKey || usedPoses.length > 16) {
    lastKey = key;
    usedPoses.length = 0;
  }
  if (cycle.length < 3) return { cands: [], ratio: o.ratio, lastError: null };
  const cum = cumulativePts(cycle);
  const Lp = cum[cum.length - 1];
  const S = o.start;
  const proj = localProjector(S);
  let ratio = o.ratio;
  const kOf = () => o.D / (Lp * ratio);

  o.report('Lecture des rues autour du départ…', 0.08);
  const half = Math.min(18000, diameterOf(cycle) * kOf() * 1.25 + 500);
  const field = await within(
    roadField(S, half, o.sport, o.signal).catch(() => null),
    6000,
    null,
  );
  if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  o.report('Placement du dessin sur les rues…', 0.22);

  // Les pointes du dessin (étoile, bas d'un cœur) ne sont jamais prises pour des allers-retours parasites.
  const tips = tipsOf(cycle);
  type Item = { pose: Pose; k: number; tries: number; kUsed: number };
  let kUsed = kOf();
  const queue: Item[] = bestPoses(cycle, field, kUsed, 4, usedPoses).map((pose) => ({ pose, k: kUsed, tries: 0, kUsed }));
  const tried: Pose[] = [];
  const cands: ArtCand[] = [];
  let goods = 0;
  let requests = 0;
  let learned = 0;
  let lastError: RoutingError | null = null;
  const MAX_REQUESTS = 9;

  while (queue.length && requests < MAX_REQUESTS && Date.now() < o.deadline && goods < 3) {
    const item = queue.shift()!;
    if (item.tries === 0) tried.push(item.pose);
    const ghostM = placeCycle(cycle, item.pose, item.k);
    const tf = poseTransform(cycle, item.pose, item.k);
    o.report(goods ? 'Autres façons de poser le dessin…' : 'Tracé du dessin, rue par rue…', Math.min(0.88, 0.3 + requests * 0.08));
    let out: { res: RouteResult | null; requests: number };
    try {
      out = await follow(S, ghostM, o.costing, field, o.sport === 'road' || o.sport === 'gravel', o.signal);
    } catch (e) {
      if (o.signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw e;
      if (e instanceof RoutingError) {
        lastError = e;
        requests++;
        continue;
      }
      throw e;
    }
    requests += out.requests;
    if (!out.res) continue;
    // Petits allers-retours parasites (une rue d'à côté prise puis quittée) : retirés, sauf vers une pointe.
    const keep = [S, ...tips.map((q) => proj.from(...tf(q)))];
    let cleaned = removeSpurs(out.res.coords, out.res.profile, 350, keep);
    // Impasses prises puis quittées par l'autre trottoir : retirées aussi (jamais vers une pointe).
    for (let pass = 0; pass < 2; pass++) {
      const cuts = deadEnds(cleaned.coords, findRetraces(cleaned.coords), keep, 0, 60);
      if (!cuts.length) break;
      cleaned = applyCuts(cleaned.coords, cleaned.profile, cuts);
    }
    const res: RouteResult = { ...out.res, coords: cleaned.coords, profile: cleaned.profile, lengthM: lengthLL(cleaned.coords) };
    const L = res.lengthM;
    // Ce quartier allonge le trait de tant : la suite part de la bonne taille.
    const obs = L / (Lp * item.k * item.pose.scale);
    if (Number.isFinite(obs) && obs > 0.8 && obs < 3) {
      ratio = learned ? ratio * 0.5 + obs * 0.5 : obs;
      learned++;
    }
    const routeM = res.coords.map((q) => proj.to(q) as Pt);
    const { dev, fit } = resemblance(routeM, ghostM);
    let far = res.coords[0];
    let farD = 0;
    for (const q of res.coords) {
      const d = haversine(S, q);
      if (d > farD) {
        farD = d;
        far = q;
      }
    }
    const err = (L - o.D) / o.D;
    const cand: ArtCand = { res, ghost: ghostM.map(([x, y]) => proj.from(x, y)), fit, dev, far, L, err };
    cands.push(cand);
    if (!usedPoses.includes(item.pose)) usedPoses.push(item.pose);
    if (Math.abs(err) <= 0.1) {
      goods++;
      o.onGood?.(cand);
    } else if (item.tries < 2) {
      // Même pose, à la bonne taille.
      const k2 = item.k * Math.max(0.6, Math.min(1.6, (o.D / L) ** 1.05));
      queue.unshift({ pose: item.pose, k: k2, tries: item.tries + 1, kUsed: item.kUsed });
    }
    // Taille apprise très différente : les poses qui restent sont recherchées à la nouvelle taille.
    const kNow = kOf();
    if (Math.abs(kNow / kUsed - 1) > 0.08) {
      kUsed = kNow;
      const fresh = queue.filter((q) => q.tries > 0);
      const more = bestPoses(cycle, field, kNow, Math.max(0, 4 - tried.length), [...tried, ...usedPoses]).map((pose) => ({ pose, k: kNow, tries: 0, kUsed: kNow }));
      queue.length = 0;
      queue.push(...fresh, ...more);
    } else {
      for (const q of queue) if (q.tries === 0) q.k = kNow;
    }
  }
  return { cands, ratio, lastError };
}
