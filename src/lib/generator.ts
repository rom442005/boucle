import type { EnvClass, GenProgress, LngLat, Params, Place, Profile, Route, Settings } from './types';
import { bearing, cumulative, destination, haversine, localProjector, overlapRatio, resample, similarity, type BBox } from './geo';
import { eleAt, elevationStats } from './elevation';
import { costingFor, ELEV_STEP, heights, route, RoutingError, surfaceSplit, type Costing, type RouteResult } from './valhalla';
import { buildEnvRaster, desirability, envShare, envSplit, meanDesirability, pullToward, trackShare, type Desirability, type EnvRaster } from './environment';
import { drinkingWater, weather, type Weather } from './services';
import { routeName } from './naming';
import { estimateDuration, SPORTS } from './sports';

export interface GenerateOptions {
  start: Place;
  destination?: Place | null;
  params: Params;
  settings: Settings;
  seed: number;
  signal?: AbortSignal;
  onProgress?: (p: GenProgress) => void;
}

export interface GenerateResult {
  routes: Route[];
  /** remarque à afficher quand la demande ne peut pas être tenue (relief insuffisant, etc.) */
  note: string | null;
  weather: Weather | null;
}

export class GenerateError extends Error {}

interface Candidate {
  res: RouteResult;
  /** moitié aller d'un aller-retour (sert à l'analyse des sols) */
  half?: RouteResult;
  far: LngLat;
  windAlign: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Envie de chemins non revêtus (0 à 1) selon le sport et le sol demandés. */
export function unpavedWeight(p: Params): number {
  if (p.sport === 'trail') return p.surface === 'a' ? 0.6 : p.surface === 'b' ? 0.9 : 1;
  if (p.sport === 'gravel') return p.surface === 'a' ? 0.45 : 1;
  if (p.sport === 'run') return p.surface === 'c' ? 0.85 : 0;
  return 0;
}
const wantsPaved = (p: Params) => p.sport === 'run' && p.surface === 'a';
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

function bboxAround(c: LngLat, r: number): BBox {
  const p = localProjector(c);
  const [w, s] = p.from(-r, -r);
  const [e, n] = p.from(r, r);
  return [w, s, e, n];
}

function profileFrom(fn: (s: number) => number, length: number, step = ELEV_STEP): Profile {
  const ele: number[] = [];
  for (let s = 0; s < length; s += step) ele.push(fn(s));
  ele.push(fn(length));
  return { step, ele };
}

function lengthOf(coords: LngLat[]): number {
  const c = cumulative(coords);
  return c[c.length - 1] ?? 0;
}

/** Montée cumulée d'un cercle de points (fermé). */
function cyclicGain(h: number[]): number {
  let g = 0;
  for (let i = 0; i < h.length; i++) {
    const d = h[(i + 1) % h.length] - h[i];
    if (d > 0) g += d;
  }
  return g;
}

function pathGain(h: number[]): number {
  let g = 0;
  for (let i = 1; i < h.length; i++) g += Math.abs(h[i] - h[i - 1]);
  return g / 2;
}

/** Choisit k directions bien réparties parmi les mieux notées. */
function pickDirections(scored: { dir: number; score: number }[], k: number, minSep: number): number[] {
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const out: number[] = [];
  for (const s of sorted) {
    if (out.every((d) => angDiff(d, s.dir) >= minSep)) out.push(s.dir);
    if (out.length === k) break;
  }
  for (const s of sorted) {
    if (out.length === k) break;
    if (!out.includes(s.dir)) out.push(s.dir);
  }
  return out;
}

export async function generate(o: GenerateOptions): Promise<GenerateResult> {
  const { params: p, start, settings, signal } = o;
  const rnd = mulberry32(o.seed);
  const sport = SPORTS[p.sport];
  const D = p.distanceKm * 1000;
  const costing = costingFor(p, settings);
  const report = (message: string, ratio: number) => o.onProgress?.({ message, ratio });

  if (p.shape === 'oneway' && !o.destination) throw new GenerateError('Choisis d’abord une destination.');

  // Zone de recherche autour du départ (ou du milieu du trajet).
  let center = start.coord;
  let areaR: number;
  if (p.shape === 'oneway' && o.destination) {
    const ab = haversine(start.coord, o.destination.coord);
    center = destination(start.coord, bearing(start.coord, o.destination.coord), ab / 2);
    areaR = Math.max(ab / 2 + 1200, D / 3.2);
  } else if (p.shape === 'outback') {
    areaR = D / 2 / 1.15 + 700;
  } else {
    areaR = D / 4 + 700;
  }
  areaR = Math.min(areaR, 45000);

  report('Lecture du terrain autour du départ…', 0.06);
  const [raster, wx, water] = await Promise.all([
    buildEnvRaster(center, areaR, signal, unpavedWeight(p) > 0 || wantsPaved(p)).catch(() => null),
    p.headwind && sport.bike && p.shape !== 'oneway' ? weather(start.coord, signal) : Promise.resolve(null),
    p.water ? drinkingWater(bboxAround(center, areaR), signal).catch(() => [] as LngLat[]) : Promise.resolve([] as LngLat[]),
  ]);
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const des = raster ? desirability(raster, p.envs, unpavedWeight(p)) : null;

  let candidates: Candidate[] = [];
  const ctx: Ctx = { p, start: start.coord, D, costing, des, rnd, wx, signal, report };
  if (p.shape === 'loop') candidates = await loops(ctx);
  else if (p.shape === 'outback') candidates = await outbacks(ctx);
  else candidates = await oneways(ctx, o.destination!.coord);

  if (!candidates.length) {
    throw new GenerateError('Aucun parcours trouvé autour de ce départ. Essaie une distance plus courte ou un autre point de départ.');
  }

  report('Comparaison des propositions…', 0.86);
  const analysed = candidates.map((c) => analyse(c, ctx, raster, water, settings));
  analysed.sort((a, b) => a.route.match!.score - b.route.match!.score);
  const picked: typeof analysed = [];
  for (const a of analysed) {
    if (picked.length === 3) break;
    if (picked.every((q) => similarity(q.route.coords, a.route.coords) < 0.7)) picked.push(a);
  }
  for (const a of analysed) {
    if (picked.length === 3) break;
    if (!picked.includes(a) && picked.every((q) => similarity(q.route.coords, a.route.coords) < 0.92)) picked.push(a);
  }

  report('Analyse des sols…', 0.93);
  await Promise.all(
    picked.map(async (a) => {
      try {
        const s = await surfaceSplit((a.cand.half ?? a.cand.res).coords, costing, signal);
        if (s) {
          a.route.surface = s.surface;
          a.route.busy = s.busy;
        }
      } catch {
        /* répartition des sols indisponible : la carte reste utilisable */
      }
      a.route.name = routeName(
        (a.cand.half ?? a.cand.res).maneuvers,
        p.shape,
        start.coord,
        a.cand.far,
        o.destination?.name,
      );
    }),
  );

  const routes = picked.map((a) => a.route);
  tag(routes, p);

  let note: string | null = null;
  if (p.elevation != null && routes.length) {
    const bestAscent = Math.max(...routes.map((r) => r.ascent));
    const lowest = Math.min(...routes.map((r) => r.ascent));
    if (bestAscent < p.elevation * 0.6) note = `Le relief autour du départ est limité : au mieux ${bestAscent} m de dénivelé pour cette distance.`;
    else if (lowest > p.elevation * 1.6 && p.elevation < 60) note = `Terrain vallonné autour du départ : au moins ${lowest} m de dénivelé pour cette distance.`;
  }
  if (p.water && routes.every((r) => !r.waterPoints.length)) {
    note = (note ? note + ' ' : '') + 'Aucun point d’eau connu sur ces parcours.';
  }
  report('Terminé', 1);
  return { routes, note, weather: wx };
}

interface Ctx {
  p: Params;
  start: LngLat;
  D: number;
  costing: Costing;
  des: Desirability | null;
  rnd: () => number;
  wx: Weather | null;
  signal?: AbortSignal;
  report: (m: string, r: number) => void;
}

/* ---------------------------------- Boucles ---------------------------------- */

async function loops(c: Ctx): Promise<Candidate[]> {
  const { p, start, D } = c;
  const bike = SPORTS[p.sport].bike;
  const n = D <= 8000 ? 3 : 4;
  const poly = 2 * (n + 1) * Math.sin(Math.PI / (n + 1));
  const ratio = { v: bike ? 1.25 : 1.32 };
  const r0 = D / (ratio.v * poly);
  const K = 8;
  const offset = c.rnd() * 45;
  const dirs = Array.from({ length: K }, (_, i) => (offset + i * 45) % 360);
  const circle = (theta: number, r: number, m: number) => {
    const ctr = destination(start, theta, r);
    const back = (theta + 180) % 360;
    return Array.from({ length: m }, (_, j) => destination(ctr, back + (j * 360) / m, r));
  };

  let relief: number[] | null = null;
  if (p.elevation != null) {
    const M = 20;
    try {
      const h = await heights(dirs.flatMap((t) => circle(t, r0, M)), c.signal);
      relief = dirs.map((_, i) => cyclicGain(h.slice(i * M, i * M + M)));
    } catch {
      relief = null;
    }
  }

  const scored = dirs.map((dir, i) => ({ dir, score: directionScore(c, dir, circle(dir, r0, 24), relief?.[i] ?? null, 1.7) }));
  const chosen = pickDirections(scored, 4, 60);

  let done = 0;
  const results = await Promise.all(
    chosen.map(async (theta): Promise<Candidate | null> => {
      const cw = c.rnd() < 0.5;
      let r = D / (ratio.v * poly);
      let best: { res: RouteResult; err: number } | null = null;
      for (let it = 0; it < 3; it++) {
        const ctr = destination(start, theta, r);
        const back = (theta + 180) % 360;
        const wps: LngLat[] = [];
        for (let j = 1; j <= n; j++) {
          let w = destination(ctr, back + (cw ? 1 : -1) * ((j * 360) / (n + 1)), r);
          if (c.des) w = pullToward(c.des, w, Math.max(250, r * 0.38));
          wps.push(w);
        }
        const res = await routeWithFallback(c, [start, ...wps, start]);
        if (!res) break;
        const L = lengthOf(res.coords);
        ratio.v = ratio.v * 0.6 + (L / (poly * r)) * 0.4;
        const err = Math.abs(L - D) / D;
        if (!best || err < best.err) best = { res, err };
        if (err <= 0.04) break;
        r *= clamp(Math.pow(D / L, 0.95), 0.6, 1.6);
      }
      done++;
      c.report('Recherche des chemins…', 0.15 + (0.68 * done) / chosen.length);
      if (!best || best.err > 0.25) return null;
      return { res: best.res, far: destination(start, theta, r * 2), windAlign: windAlign(c.wx, theta) };
    }),
  );
  return results.filter((x): x is Candidate => !!x);
}

/* ------------------------------- Allers-retours ------------------------------ */

async function outbacks(c: Ctx): Promise<Candidate[]> {
  const { p, start, D } = c;
  const bike = SPORTS[p.sport].bike;
  const half = D / 2;
  const ratio = { v: bike ? 1.22 : 1.28 };
  const d0 = half / ratio.v;
  const K = 8;
  const offset = c.rnd() * 45;
  const dirs = Array.from({ length: K }, (_, i) => (offset + i * 45) % 360);
  const ray = (theta: number, d: number, m: number) => Array.from({ length: m }, (_, j) => destination(start, theta, (d * (j + 1)) / m));

  let relief: number[] | null = null;
  if (p.elevation != null) {
    const M = 14;
    try {
      const h = await heights(dirs.flatMap((t) => [start, ...ray(t, d0, M - 1)]), c.signal);
      relief = dirs.map((_, i) => pathGain(h.slice(i * M, i * M + M)) * 2);
    } catch {
      relief = null;
    }
  }
  const scored = dirs.map((dir, i) => ({ dir, score: directionScore(c, dir, ray(dir, d0, 16), relief?.[i] ?? null, 1.5) }));
  const chosen = pickDirections(scored, 4, 70);

  let done = 0;
  const results = await Promise.all(
    chosen.map(async (theta): Promise<Candidate | null> => {
      let d = half / ratio.v;
      let best: { res: RouteResult; err: number; turn: LngLat } | null = null;
      for (let it = 0; it < 3; it++) {
        let turn = destination(start, theta, d);
        if (c.des) turn = pullToward(c.des, turn, Math.max(250, d * 0.3));
        const res = await routeWithFallback(c, [start, turn]);
        if (!res) break;
        const L = lengthOf(res.coords);
        ratio.v = ratio.v * 0.6 + (L / d) * 0.4;
        const err = Math.abs(L - half) / half;
        if (!best || err < best.err) best = { res, err, turn };
        if (err <= 0.04) break;
        d *= clamp(Math.pow(half / L, 0.95), 0.6, 1.6);
      }
      done++;
      c.report('Recherche des chemins…', 0.15 + (0.68 * done) / chosen.length);
      if (!best || best.err > 0.25) return null;
      return { res: mirror(best.res), half: best.res, far: best.turn, windAlign: windAlign(c.wx, theta) };
    }),
  );
  return results.filter((x): x is Candidate => !!x);
}

function mirror(res: RouteResult): RouteResult {
  const L = lengthOf(res.coords);
  const coords = [...res.coords, ...res.coords.slice(0, -1).reverse()];
  const profile = profileFrom((s) => eleAt(res.profile, s <= L ? s : 2 * L - s), 2 * L);
  return { coords, profile, lengthM: 2 * L, maneuvers: res.maneuvers };
}

/* ------------------------------ Vers un lieu (A vers B) ------------------------------ */

async function oneways(c: Ctx, B: LngLat): Promise<Candidate[]> {
  const { start: A, D } = c;
  const out: Candidate[] = [];
  let direct: RouteResult[] = [];
  try {
    direct = await route([{ coord: A }, { coord: B }], c.costing, c.signal, 2);
  } catch (e) {
    if (e instanceof RoutingError) throw new GenerateError(routingMessage(e));
    throw e;
  }
  c.report('Recherche des chemins…', 0.4);
  const L0 = lengthOf(direct[0].coords);
  for (const d of direct) out.push({ res: d, far: B, windAlign: 0 });
  if (D <= L0 * 1.1) return out;

  const ab = haversine(A, B);
  const brg = bearing(A, B);
  const mid = destination(A, brg, ab / 2);
  const ratio = clamp(L0 / Math.max(ab, 1), 1.05, 1.8);
  let done = 0;
  const detours = await Promise.all(
    [90, -90].map(async (side): Promise<Candidate | null> => {
      let h = Math.sqrt(Math.max(0, (D / (2 * ratio)) ** 2 - (ab / 2) ** 2));
      let best: { res: RouteResult; err: number } | null = null;
      for (let it = 0; it < 3; it++) {
        let w = destination(mid, brg + side, h);
        if (c.des) w = pullToward(c.des, w, Math.max(250, h * 0.3));
        const res = await routeWithFallback(c, [A, w, B]);
        if (!res) break;
        const L = lengthOf(res.coords);
        const err = Math.abs(L - D) / D;
        if (!best || err < best.err) best = { res, err };
        if (err <= 0.05) break;
        h *= clamp(Math.pow(D / L, 1.3), 0.5, 1.8);
      }
      done++;
      c.report('Recherche des chemins…', 0.4 + (0.45 * done) / 2);
      return best && best.err < 0.3 ? ({ res: best.res, far: B, windAlign: 0 }) : null;
    }),
  );
  return [...detours.filter((x): x is Candidate => !!x), ...out];
}

/* ------------------------------------ Outils ------------------------------------ */

async function routeWithFallback(c: Ctx, pts: LngLat[]): Promise<RouteResult | null> {
  const through = pts.map((coord, i) => ({ coord, through: i > 0 && i < pts.length - 1 }));
  try {
    return (await route(through, c.costing, c.signal))[0];
  } catch (e) {
    if (c.signal?.aborted) throw e;
    if (!(e instanceof RoutingError)) return null;
    if (e.code === 171 && pts.length === 2) throw new GenerateError(routingMessage(e));
    try {
      return (await route(pts.map((coord) => ({ coord })), c.costing, c.signal))[0];
    } catch (e2) {
      if (c.signal?.aborted) throw e2;
      return null;
    }
  }
}

function routingMessage(e: RoutingError): string {
  if (e.code === 171) return 'Le point de départ ou d’arrivée est trop loin d’un chemin praticable.';
  if (e.code === 442 || e.code === 443) return 'Aucun chemin praticable ne relie ces points pour ce sport.';
  if (e.code === 154) return 'Trajet trop long pour le service d’itinéraires.';
  if (e.status === 0) return 'Le service d’itinéraires ne répond pas. Vérifie ta connexion.';
  return 'Le service d’itinéraires a renvoyé une erreur. Réessaie dans un instant.';
}

function windAlign(wx: Weather | null, theta: number): number {
  if (!wx || wx.windKmh < 6) return 0;
  // 0 : on part face au vent (direction d'où il vient), 1 : vent dans le dos à l'aller.
  return angDiff(theta, wx.windFrom) / 180;
}

function directionScore(c: Ctx, dir: number, pts: LngLat[], relief: number | null, gainFactor: number): number {
  let s = c.rnd() * 0.12;
  if (c.des) s += 1 - Math.min(1, meanDesirability(c.des, pts) * 1.6);
  if (relief != null && c.p.elevation != null) {
    const expected = relief * gainFactor;
    s += (0.9 * Math.abs(expected - c.p.elevation)) / Math.max(c.p.elevation, 50);
  }
  if (c.wx && c.p.headwind && c.wx.windKmh >= 6) s += 0.5 * windAlign(c.wx, dir) * Math.min(1, c.wx.windKmh / 20);
  return s;
}

function nearRoute(coords: LngLat[], pts: LngLat[], maxDist: number): LngLat[] {
  if (!pts.length) return [];
  const proj = localProjector(coords[0]);
  const cell = maxDist;
  const grid = new Set<string>();
  for (const q of resample(coords, maxDist / 2)) {
    const [x, y] = proj.to(q);
    grid.add(`${Math.floor(x / cell)}:${Math.floor(y / cell)}`);
  }
  return pts.filter((w) => {
    const [x, y] = proj.to(w);
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (grid.has(`${cx + dx}:${cy + dy}`)) return true;
    return false;
  });
}

function analyse(cand: Candidate, c: Ctx, raster: EnvRaster | null, water: LngLat[], settings: Settings) {
  const { p, D } = c;
  const res = cand.res;
  const lengthM = lengthOf(res.coords);
  const st = elevationStats(res.profile);
  const overlap = p.shape === 'loop' ? overlapRatio(res.coords) : 0;
  const env = envSplit(raster, res.coords);
  const share = p.envs.length ? envShare(env, p.envs) : null;
  const waterPoints = p.water ? nearRoute(res.coords, water, 40) : [];
  const tracks = trackShare(raster, res.coords);
  const unpaved = unpavedWeight(p);
  const distErr = Math.abs(lengthM - D) / D;
  const elevErr = p.elevation != null ? Math.abs(st.ascent - p.elevation) / Math.max(p.elevation, 50) : 0;
  const score =
    3 * distErr +
    1.2 * Math.min(1.5, elevErr) +
    (share != null ? 1.1 * (1 - Math.min(1, share * 1.25)) : 0) +
    1.6 * Math.max(0, overlap - 0.05) +
    (p.water && !waterPoints.length ? 0.4 : 0) +
    (tracks != null && unpaved > 0 ? 0.9 * unpaved * (1 - Math.min(1, tracks * 1.6)) : 0) +
    (tracks != null && wantsPaved(p) ? 0.6 * tracks : 0) +
    (p.headwind ? 0.3 * cand.windAlign : 0);
  const route: Route = {
    id: `${Date.now().toString(36)}-${Math.floor(c.rnd() * 1e6).toString(36)}`,
    name: '',
    sport: p.sport,
    shape: p.shape,
    coords: res.coords,
    profile: res.profile,
    lengthM,
    ascent: st.ascent,
    descent: st.descent,
    minEle: st.minEle,
    maxEle: st.maxEle,
    maxGrade: st.maxGrade,
    env,
    surface: null,
    busy: null,
    overlap,
    waterPoints,
    durationS: estimateDuration(p.sport, lengthM, st.ascent, settings),
    match: {
      distance: 1 - distErr,
      elevation: p.elevation != null ? Math.max(0, 1 - elevErr) : null,
      env: share,
      score,
    },
    params: { ...p, envs: [...p.envs] },
    createdAt: Date.now(),
  };
  return { cand, route };
}

const ENV_TAG: Record<EnvClass, string> = {
  forest: 'Le plus boisé',
  water: 'Le plus au bord de l’eau',
  park: 'Le plus de parcs',
  fields: 'Le plus champêtre',
  urban: 'Le plus urbain',
};

/** Étiquettes qui distinguent les propositions entre elles (calculées, jamais inventées). */
function tag(routes: Route[], p: Params) {
  if (!routes.length) return;
  routes.forEach((r) => (r.tags = []));
  if (routes.length > 1) routes[0].tags!.push('Meilleur accord');
  const free = () => routes.filter((r) => r.tags!.length === 0);
  const give = (pickFn: (rs: Route[]) => Route | undefined, label: string, ok: (best: Route, others: Route[]) => boolean) => {
    const pool = free();
    if (!pool.length) return;
    const best = pickFn(pool);
    if (best && ok(best, routes.filter((r) => r !== best))) best.tags!.push(label);
  };
  if (p.envs.length === 1) {
    const e = p.envs[0];
    give(
      (rs) => [...rs].sort((a, b) => (b.env[e] ?? 0) - (a.env[e] ?? 0))[0],
      ENV_TAG[e],
      (b, o) => o.every((r) => (b.env[e] ?? 0) >= (r.env[e] ?? 0) + 0.08),
    );
  }
  give(
    (rs) => [...rs].sort((a, b) => a.ascent - b.ascent)[0],
    'Le plus plat',
    (b, o) => o.every((r) => b.ascent <= r.ascent * 0.8 - 5),
  );
  give(
    (rs) => [...rs].sort((a, b) => b.ascent - a.ascent)[0],
    'Le plus vallonné',
    (b, o) => o.every((r) => b.ascent >= r.ascent * 1.2 + 5),
  );
  const nature = (r: Route) => (r.env.forest ?? 0) + (r.env.park ?? 0) + (r.env.water ?? 0) + (r.env.fields ?? 0);
  give(
    (rs) => [...rs].sort((a, b) => nature(b) - nature(a))[0],
    'Le plus nature',
    (b, o) => o.every((r) => nature(b) >= nature(r) + 0.1),
  );
  give(
    (rs) => [...rs].sort((a, b) => a.overlap - b.overlap)[0],
    'Sans repasser',
    (b, o) => p.shape === 'loop' && b.overlap < 0.03 && o.every((r) => r.overlap > 0.08),
  );
}
