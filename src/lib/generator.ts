import type { EnvClass, GenProgress, LngLat, Params, Place, Profile, Route, Settings } from './types';
import { bearing, cumulative, destination, haversine, localProjector, resample, similarity, type BBox } from './geo';
import { eleAt, elevationStats } from './elevation';
import {
  chainSize,
  costingFor,
  ELEV_STEP,
  heights,
  MAX_LOCATIONS,
  nextSlotDelay,
  route,
  routeJobs,
  RoutingError,
  surfaceSplit,
  type Costing,
  type Job,
  type RouteResult,
  type Waypoint,
} from './valhalla';
import { buildEnvRaster, desirability, envShare, envSplit, meanDesirability, pullToward, trackShare, type Desirability, type EnvRaster } from './environment';
import { drinkingWater, weather, type Weather } from './services';
import { routeName } from './naming';
import { applyCuts, removeSpurs } from './spurs';
import { avoidPoints, closureTrim, deadEnds, departureBearing, findRetraces, type Retrace } from './retrace';
import { loadTerrain, type Terrain } from './terrain';
import { estimateDuration, SPORTS } from './sports';

/*
 * Création des parcours.
 *
 * Le service d'itinéraires public n'accepte qu'une requête par seconde : tout l'enjeu est d'en faire
 * peu, et de les remplir. Chaque requête calcule plusieurs propositions à la fois (deux boucles, cinq
 * allers…), la suivante corrige la taille de celles qui sont trop longues ou trop courtes, et la
 * recherche s'arrête dès que trois bonnes propositions sont trouvées. La première est montrée tout de
 * suite, les autres la rejoignent.
 *
 * Une boucle ne repasse jamais au même endroit : chaque tracé est examiné (voir retrace.ts), et une
 * boucle qui repasse est recalculée en partant d'un côté de la rue et en revenant par l'autre, en
 * évitant les tronçons déjà faits, quitte à faire un peu plus long (jusqu'à 1 km).
 */

export interface GenerateOptions {
  start: Place;
  destination?: Place | null;
  /** points de passage imposés : des endroits à visiter forcément (l'ordre de passage est optimisé) */
  vias?: Place[];
  params: Params;
  settings: Settings;
  seed: number;
  signal?: AbortSignal;
  onProgress?: (p: GenProgress) => void;
  /** première proposition, dès qu'elle est prête ; le résultat final la garde en tête, avec le même identifiant */
  onPartial?: (res: GenerateResult) => void;
  /** propositions complétées après coup (répartition des sols), dans le même ordre */
  onDetails?: (routes: Route[]) => void;
}

export interface GenerateResult {
  routes: Route[];
  /** remarque à afficher quand la demande ne peut pas être tenue (relief insuffisant, etc.) */
  note: string | null;
  weather: Weather | null;
}

export class GenerateError extends Error {}

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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** La promesse, ou `fallback` si elle tarde plus de `ms`. */
const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
const aborted = () => new DOMException('aborted', 'AbortError');
/** Journal de mise au point (tests) : globalThis.__boucleDebug = console.log */
const debug = (msg: string) => (globalThis as { __boucleDebug?: (m: string) => void }).__boucleDebug?.(msg);

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

/** Ordonne les directions : les mieux notées d'abord, bien réparties autour du départ. */
function pickDirections(scored: { dir: number; score: number }[], minSep: number): number[] {
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const out: number[] = [];
  for (const s of sorted) if (out.every((d) => angDiff(d, s.dir) >= minSep)) out.push(s.dir);
  for (const s of sorted) if (!out.includes(s.dir)) out.push(s.dir);
  return out;
}

/* ------------------------- Rapport longueur réelle / figure, appris ------------------------- */

/*
 * Un itinéraire est plus long que la figure tracée à vol d'oiseau (rues, rivières, détours). Ce
 * rapport dépend du quartier : il est appris à chaque création et gardé sur l'appareil, par zone
 * d'environ 5 km, pour viser juste dès la première requête la fois suivante.
 */
const RATIO_KEY = 'boucle.ratios';
const ratioKey = (p: LngLat, kind: string) => `${kind}:${Math.round(p[1] * 20) / 20}:${Math.round(p[0] * 20) / 20}`;
function loadRatio(key: string, def: number): number {
  try {
    const v = JSON.parse(localStorage.getItem(RATIO_KEY) ?? '{}')[key];
    return typeof v === 'number' && v > 1 && v < 3 ? v : def;
  } catch {
    return def;
  }
}
function saveRatio(key: string, v: number) {
  try {
    const m = JSON.parse(localStorage.getItem(RATIO_KEY) ?? '{}') as Record<string, number>;
    delete m[key];
    m[key] = Math.round(v * 1000) / 1000;
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - 80))) delete m[k];
    localStorage.setItem(RATIO_KEY, JSON.stringify(m));
  } catch {
    /* sans mémoire : on repart du rapport par défaut */
  }
}

/* ------------------------------------ Contexte ------------------------------------ */

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
  /** point de passage imposé, quand il y en a un seul */
  via: LngLat | null;
  /** lieux à ne jamais couper ni rendre inaccessibles (points de passage) */
  keep: LngLat[];
  /** altitudes de points (relief de la carte 3D, sinon service d'itinéraires) */
  heightsOf: (pts: LngLat[]) => Promise<number[] | null>;
  /** rapport longueur réelle / figure, appris au fil des requêtes */
  ratio: number;
  /** une boucle au moins part et revient par des chemins différents : le départ n'est pas une impasse */
  cleanStart: boolean;
  /** plus court bout commun au départ et au retour vu jusqu'ici (m), et essais avec sens imposé */
  minStem: number;
  headingTries: number;
  /** une proposition jugée bonne vient d'être trouvée */
  onGood?: (c: Cand) => void;
  /** heure limite de la recherche */
  deadline: number;
  /** dernière erreur du service, pour l'expliquer si rien n'est trouvé */
  lastError: RoutingError | null;
}

/* ------------------------------ Recherche par lots ------------------------------ */

/** Corrections d'une figure entre deux essais. */
interface Fix {
  /** tronçons à éviter (déjà parcourus par un essai précédent) */
  avoid: LngLat[];
  /** rotation de la figure (degrés) */
  turn: number;
  /** points de passage simples (sans interdiction de demi-tour), après un échec */
  plain: boolean;
  /** boucle : partir dans ce sens et revenir en marchant dans le même sens, donc par l'autre côté */
  heading: number | null;
  headingTried: boolean;
  /** éviter des tronçons a coupé un passage obligé : on n'en évite plus */
  noAvoid: boolean;
}

interface Built {
  job: Job;
  size: number;
  far: LngLat;
  /** points de la figure (on n'évite aucun tronçon tout près) */
  anchors: LngLat[];
  /** sens de départ imposé à cet essai */
  heading?: number | null;
}

/** Une proposition en cours de mise au point : une direction, un côté, une forme. */
interface Plan {
  rank: number;
  /** taille de la figure (rayon, distance du demi-tour…) ; calculée au premier envoi */
  size: number | null;
  initSize: () => number;
  build: (size: number, fix: Fix) => Built;
  /** longueur visée pour le trajet calculé (m) */
  target: number;
  /** le trajet calculé est l'aller d'un aller-retour */
  mirror?: boolean;
  /** longueur fixe du trajet, que la taille ne change pas (jusqu'au point de passage) */
  offset?: number;
  samples: [number, number][];
  tries: number;
  maxTries: number;
  fix: Fix;
  solo: boolean;
  status: 'reserve' | 'wait' | 'busy' | 'done' | 'dead';
  best: Cand | null;
  windAlign: number;
  /** apprend du résultat (rapport longueur / figure) */
  observe?: (size: number, part: number) => void;
}

interface Cand {
  res: RouteResult;
  /** moitié aller d'un aller-retour (sert à l'analyse des sols) */
  half?: RouteResult;
  far: LngLat;
  windAlign: number;
  /** longueur totale (m) */
  L: number;
  /** écart relatif à la distance demandée (signé) */
  err: number;
  rt: Retrace | null;
  plan: Plan;
  built: Built;
  heading: number | null;
}

interface SearchOpts {
  /** nombre de bonnes propositions voulues */
  want: number;
  maxRequests: number;
  good: (c: Cand) => boolean;
  /**
   * Assez bonne pour être montrée tout de suite, en première (sans attendre une distance au plus juste) ;
   * elle compte alors parmi les propositions.
   */
  usable?: (c: Cand) => boolean;
  /** réparations après un essai (tronçons à éviter, sens de départ) */
  repair?: (plan: Plan, cand: Cand) => void;
  /** progression affichée de `from` à `to` */
  from: number;
  to: number;
}

const newFix = (): Fix => ({ avoid: [], turn: 0, plain: false, heading: null, headingTried: false, noAvoid: false });

function makePlan(o: Omit<Plan, 'samples' | 'tries' | 'fix' | 'solo' | 'status' | 'best' | 'size' | 'maxTries'> & { maxTries?: number; status?: Plan['status'] }): Plan {
  return { samples: [], tries: 0, fix: newFix(), solo: false, best: null, size: null, maxTries: 3, status: 'wait', ...o };
}

/**
 * Taille suivante : sécante sur les deux derniers essais (longueur ≈ a·taille^b). Quand la longueur ne
 * suit pas la taille (une figure plus grande a pris un autre chemin, plus court), on repart de l'essai
 * le plus proche de la cible, par petits pas.
 */
function nextSize(plan: Plan): number {
  const s = plan.samples;
  const target = Math.max(1, plan.target - (plan.offset ?? 0));
  const [s2, l2] = s[s.length - 1];
  if (s.length >= 2) {
    const [s1, l1] = s[s.length - 2];
    const b = Math.abs(s2 / s1 - 1) < 0.03 || l1 <= 0 || l2 <= 0 ? 1 : Math.log(l2 / l1) / Math.log(s2 / s1);
    if (Number.isFinite(b) && b > 0.3) return s2 * clamp(Math.pow(target / Math.max(1, l2), 1 / clamp(b, 0.5, 1.6)), 0.6, 1.6);
    const [sb, lb] = s.reduce((a, x) => (Math.abs(x[1] - target) < Math.abs(a[1] - target) ? x : a));
    return sb * clamp(Math.pow(target / Math.max(1, lb), 0.95), 0.75, 1.3);
  }
  return s2 * clamp(Math.pow(target / Math.max(1, l2), 0.95), 0.6, 1.6);
}

/**
 * Ce qui repasse au même endroit. L'aller-retour qui mène au point de passage imposé est voulu
 * (il est souvent au fond d'un parc ou d'une impasse) : il ne compte pas.
 */
function retracesOf(c: Ctx, coords: LngLat[]): Retrace | null {
  if (c.p.shape === 'outback') return null;
  const rt = findRetraces(coords);
  if (!c.keep.length || !rt.stretches.length) return rt;
  const radii = c.keep.map((v) => viaRadius(coords, v));
  const stretches = rt.stretches.filter((s) => !c.keep.some((v, i) => nearPoint(coords, s, v, radii[i])));
  if (stretches.length === rt.stretches.length) return rt;
  const length = stretches.reduce((a, s) => a + (s.to - s.from), 0);
  const total = lengthOf(coords);
  const stem = stretches.reduce((m, s) => (s.to >= total - 40 && s.firstFrom <= 40 ? Math.max(m, s.to - s.from) : m), 0);
  return { stretches, length, stem };
}

/**
 * Retire les détours en cul-de-sac : un point de passage tombé dans une impasse, un demi-tour au bout
 * d'une petite rue ou d'un rond de parking. Ceux qui mènent au point de passage imposé restent.
 */
function clean(res: RouteResult, keep: LngLat[] = [], loop = false): RouteResult {
  let cur = removeSpurs(res.coords, res.profile, 5000, keep);
  for (let pass = 0; pass < 3; pass++) {
    // Une boucle perd aussi les grands détours qui reviennent sur eux-mêmes ; un trajet vers un lieu,
    // seulement les petits culs-de-sac (son détour est voulu pour allonger, il sera recalculé s'il repasse).
    const cuts = deadEnds(cur.coords, findRetraces(cur.coords), keep, loop ? 0.35 : 0, keep.length ? Math.max(...keep.map((v) => viaRadius(cur.coords, v))) : 60);
    if (!cuts.length) break;
    cur = applyCuts(cur.coords, cur.profile, cuts);
  }
  // Boucle : sans crochet au départ ni à l'arrivée ; elle part et revient au même point.
  const trim = loop ? closureTrim(cur.coords) : null;
  if (trim) {
    const S = cur.coords[0];
    const total = lengthOf(cur.coords);
    const cuts = [...(trim.from > 1 ? [{ from: 0, to: trim.from }] : []), ...(trim.to < total - 1 ? [{ from: trim.to, to: total }] : [])];
    cur = applyCuts(cur.coords, cur.profile, cuts);
    const last = cur.coords[cur.coords.length - 1];
    if (last[0] !== S[0] || last[1] !== S[1]) cur = { ...cur, coords: [...cur.coords, S] };
  }
  if (cur.coords === res.coords) return res;
  return { ...res, coords: cur.coords, profile: cur.profile, lengthM: lengthOf(cur.coords) };
}

function mirror(res: RouteResult): RouteResult {
  const L = lengthOf(res.coords);
  const coords = [...res.coords, ...res.coords.slice(0, -1).reverse()];
  const profile = profileFrom((s) => eleAt(res.profile, s <= L ? s : 2 * L - s), 2 * L);
  return { coords, profile, lengthM: 2 * L, maneuvers: res.maneuvers };
}

/**
 * Bout commun au départ et au retour qu'on ne peut pas éviter : le départ est au fond d'une impasse.
 * On le sait quand aucune boucle, même partie dans un sens et revenue en marchant dans le même sens
 * (donc par l'autre côté), n'a pu partir et revenir par des chemins différents.
 */
function stemFloor(c: Ctx): number {
  return c.cleanStart || c.headingTries === 0 || c.minStem === Infinity ? 0 : c.minStem;
}

/** Longueur qui repasse au même endroit, sans compter le départ au fond d'une impasse (inévitable). */
function retraceOf(c: Ctx, cand: Cand): number {
  if (!cand.rt) return 0;
  return Math.max(0, cand.rt.length - Math.min(cand.rt.stem, stemFloor(c)));
}

/** Rang d'un essai au sein de sa figure : sans repasser d'abord, puis la distance. */
const candRank = (c: Ctx, x: Cand) => Math.abs(x.err) + (retraceOf(c, x) / Math.max(1, x.L)) * 20;

/**
 * Met au point plusieurs figures en même temps : à chaque créneau (une requête par seconde), les
 * figures qui attendent sont regroupées dans une requête d'au plus 10 points, construites avec ce que
 * l'on sait à cet instant (rapport appris, corrections). S'arrête dès qu'il y a assez de bonnes
 * propositions, différentes entre elles.
 */
async function runSearch(c: Ctx, plans: Plan[], o: SearchOpts): Promise<Cand[]> {
  const all: Cand[] = [];
  const goods: Cand[] = [];
  let requests = 0;
  /** une proposition a déjà été montrée */
  let shown = false;
  const inflight = new Set<Promise<void>>();
  const local = new AbortController();
  const onAbort = () => local.abort();
  c.signal?.addEventListener('abort', onAbort, { once: true });

  const distinct = () => {
    const kept: Cand[] = [];
    for (const g of goods) if (kept.every((k) => similarity(k.res.coords, g.res.coords) < 0.7)) kept.push(g);
    return kept.length;
  };
  // Assez : toutes les propositions voulues ; ou une de moins passé 3,5 s, et au moins une passé 5,5 s
  // (mieux vaut deux parcours impeccables tout de suite que trois dont un qui repasse, plus tard).
  const t0 = Date.now();
  const enough = () => {
    const d = distinct();
    const t = Date.now() - t0;
    return d >= o.want || (d >= o.want - 1 && t > 3500) || (d >= 1 && t > 5500);
  };
  const progress = () => c.report('Recherche des chemins…', o.from + (o.to - o.from) * Math.min(1, distinct() / o.want));

  const handle = (plan: Plan, built: Built, raw: RouteResult) => {
    const cleaned = clean(raw, c.keep, c.p.shape === 'loop');
    const part = lengthOf(cleaned.coords);
    const full = plan.mirror ? mirror(cleaned) : cleaned;
    const L = plan.mirror ? 2 * part : part;
    plan.samples.push([built.size, part - (plan.offset ?? 0)]);
    plan.observe?.(built.size, part);
    const cand: Cand = {
      res: full,
      half: plan.mirror ? cleaned : undefined,
      far: built.far,
      windAlign: plan.windAlign,
      L,
      err: (L - c.D) / c.D,
      rt: retracesOf(c, full.coords),
      plan,
      built,
      heading: built.heading ?? null,
    };
    all.push(cand);
    if (!plan.best || candRank(c, cand) < candRank(c, plan.best)) plan.best = cand;
    o.repair?.(plan, cand);
    debug?.(
      `#${plan.rank} essai ${plan.tries} taille ${Math.round(built.size)} → ${(L / 1000).toFixed(2)} km (${(cand.err * 100).toFixed(1)} %) repasse ${Math.round(cand.rt?.length ?? 0)} m tronc ${Math.round(cand.rt?.stem ?? 0)} cap ${cand.heading ?? '-'} évite ${built.job.avoid?.length ?? 0}${o.good(cand) ? ' BON' : ''}`,
    );
    const s = plan.samples;
    // La taille ne change plus rien (figure à sa taille minimale, point de passage lointain) : inutile d'insister.
    const stuck = s.length >= 2 && Math.abs(s[s.length - 1][1] - s[s.length - 2][1]) < 0.01 * plan.target && !plan.fix.avoid.length;
    const good = o.good(cand);
    const first = !shown && !good && !!o.usable?.(cand);
    if (good || first) {
      shown = true;
      plan.status = 'done';
      goods.push(cand);
      c.onGood?.(cand);
    } else if (plan.tries >= plan.maxTries || stuck) plan.status = 'done';
    else {
      plan.size = nextSize(plan);
      plan.status = 'wait';
    }
    progress();
  };

  const failed = (batch: { plan: Plan; built: Built }[], e: unknown) => {
    if (e instanceof RoutingError) c.lastError = e;
    // Pas de réseau, ou service saturé (déjà réessayé) : inutile d'insister, on s'arrête là.
    if (e instanceof RoutingError && (e.status === 0 || e.status === 429)) {
      for (const p of plans) if (p.status !== 'done') p.status = 'dead';
      return;
    }
    const avoided = batch.some((x) => x.built.job.avoid?.length);
    for (const { plan } of batch) {
      if (avoided) {
        // Des tronçons évités ont coupé un passage obligé (seul pont, seule rue du départ) : on les
        // oublie, sans perdre d'essai, et on n'en évite plus pour ces figures.
        plan.fix.avoid = [];
        plan.fix.noAvoid = true;
        plan.tries--;
        plan.status = 'wait';
      } else if (batch.length > 1) {
        // Une figure du lot a fait échouer la requête : chacune repart seule, sans perdre d'essai.
        plan.solo = true;
        plan.tries--;
        plan.status = 'wait';
      } else if (!plan.fix.plain && e instanceof RoutingError && e.code !== 171) {
        plan.fix.plain = true;
        plan.status = 'wait';
      } else plan.status = 'dead';
    }
  };

  const pick = (): { plan: Plan; built: Built }[] => {
    let ready = plans.filter((p) => p.status === 'wait');
    const busy = plans.filter((p) => p.status === 'busy').length;
    if (!ready.length && distinct() + busy < o.want) {
      // Les premières figures n'ont pas suffi : on en essaie d'autres.
      const reserve = plans.filter((p) => p.status === 'reserve').slice(0, 2);
      for (const p of reserve) p.status = 'wait';
      ready = reserve;
    }
    ready.sort((a, b) => a.tries - b.tries || a.rank - b.rank);
    const batch: { plan: Plan; built: Built }[] = [];
    for (const plan of ready) {
      if (batch.length && (plan.solo || batch[0].plan.solo)) continue;
      const size = plan.size ?? plan.initSize();
      const built = plan.build(size, plan.fix);
      if (chainSize([...batch.map((x) => x.built.job), built.job]) > MAX_LOCATIONS) continue;
      batch.push({ plan, built });
      if (plan.solo) break;
    }
    return batch;
  };

  const send = (batch: { plan: Plan; built: Built }[]) => {
    requests++;
    for (const x of batch) {
      x.plan.status = 'busy';
      x.plan.tries++;
    }
    const pr: Promise<void> = routeJobs(
      batch.map((x) => x.built.job),
      c.costing,
      local.signal,
    )
      .then((results) => results.forEach((res, i) => handle(batch[i].plan, batch[i].built, res)))
      .catch((e) => {
        if (local.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          for (const x of batch) if (x.plan.status === 'busy') x.plan.status = 'dead';
          return;
        }
        failed(batch, e);
      })
      .finally(() => inflight.delete(pr));
    inflight.add(pr);
  };

  try {
    for (;;) {
      if (c.signal?.aborted) throw aborted();
      if (enough()) break;
      const waitAny = () => (inflight.size ? Promise.race(inflight) : Promise.resolve());
      if (requests >= o.maxRequests || Date.now() > c.deadline) {
        if (!inflight.size) break;
        await waitAny();
        continue;
      }
      const delay = nextSlotDelay();
      if (delay > 15) {
        await Promise.race([sleep(delay), ...inflight]);
        continue;
      }
      const batch = pick();
      if (!batch.length) {
        if (!inflight.size) break;
        await waitAny();
        continue;
      }
      send(batch);
    }
  } finally {
    // Assez de propositions : les requêtes encore en route sont abandonnées.
    local.abort();
    c.signal?.removeEventListener('abort', onAbort);
  }
  if (c.signal?.aborted) throw aborted();
  return all;
}

/* ----------------------------------- Point d'entrée ----------------------------------- */

export async function generate(o: GenerateOptions): Promise<GenerateResult> {
  const { params: p, start, settings, signal } = o;
  const rnd = mulberry32(o.seed);
  const sport = SPORTS[p.sport];
  const D = p.distanceKm * 1000;
  const costing = costingFor(p, settings);
  const report = (message: string, ratio: number) => o.onProgress?.({ message, ratio });

  const vias = (o.vias ?? []).map((v) => v.coord);
  const via = vias.length === 1 ? vias[0] : null;
  const dest = p.shape === 'oneway' ? (o.destination?.coord ?? null) : null;

  // Zone de recherche autour du départ (ou du milieu du trajet).
  let center = start.coord;
  let areaR: number;
  if (dest) {
    const ab = haversine(start.coord, dest);
    center = destination(start.coord, bearing(start.coord, dest), ab / 2);
    areaR = Math.max(ab / 2 + 1200, D / 3.2);
  } else if (vias.length) {
    const lng = vias.reduce((a, v) => a + v[0], start.coord[0]) / (vias.length + 1);
    const lat = vias.reduce((a, v) => a + v[1], start.coord[1]) / (vias.length + 1);
    center = [lng, lat];
    areaR = Math.max(haversine(center, start.coord) + 1500, p.shape === 'outback' ? D / 2 / 1.15 + 700 : D / 4 + 700);
  } else if (p.shape === 'oneway') {
    // Aller simple sans arrivée : on peut partir dans toutes les directions.
    areaR = D / 1.5 + 700;
  } else if (p.shape === 'outback') {
    areaR = D / 2 / 1.15 + 700;
  } else {
    areaR = D / 4 + 700;
  }
  for (const v of vias) areaR = Math.max(areaR, haversine(center, v) + 800);
  areaR = Math.min(areaR, 45000);

  // Tout ce qui ne dépend pas du service d'itinéraires part en même temps ; la recherche n'attend
  // que ce dont elle a besoin pour orienter les figures (milieux voulus, vent, relief).
  report('Lecture du terrain autour du départ…', 0.06);
  const rasterP = buildEnvRaster(center, areaR, signal, unpavedWeight(p) > 0 || wantsPaved(p)).catch(() => null);
  const wxP = p.headwind && sport.bike && p.shape !== 'oneway' ? weather(start.coord, signal) : Promise.resolve(null);
  const waterP = p.water ? drinkingWater(bboxAround(center, areaR), signal).catch(() => [] as LngLat[]) : Promise.resolve([] as LngLat[]);
  const needRelief = p.elevation != null && p.shape !== 'oneway' && !vias.length;
  const terrainP: Promise<Terrain | null> = needRelief ? loadTerrain(start.coord, p.shape === 'outback' ? D / 2 : D / 2.6, signal).catch(() => null) : Promise.resolve(null);
  const needDes = p.envs.length > 0 || unpavedWeight(p) > 0;
  const [raster0, wx, terrain] = await Promise.all([
    needDes ? within(rasterP, 3500, null) : Promise.resolve(null),
    within(wxP, 1500, null),
    within(terrainP, 2500, null),
  ]);
  if (signal?.aborted) throw aborted();
  const des = raster0 ? desirability(raster0, p.envs, unpavedWeight(p)) : null;

  const bike = sport.bike;
  const kind = `${p.shape}:${bike ? 'b' : 'f'}`;
  const rKey = ratioKey(start.coord, kind);
  const defRatio = p.shape === 'outback' ? (bike ? 1.22 : 1.28) : bike ? 1.25 : 1.32;
  const ctx: Ctx = {
    p,
    start: start.coord,
    D,
    costing,
    des,
    rnd,
    wx,
    signal,
    report,
    via,
    keep: vias,
    heightsOf: async (pts) => {
      if (terrain) {
        const h = pts.map((q) => terrain.heightAt(q));
        if (h.every((x) => x != null)) return h as number[];
      }
      try {
        return await heights(pts, signal);
      } catch {
        return null;
      }
    },
    ratio: loadRatio(rKey, defRatio),
    cleanStart: false,
    minStem: Infinity,
    headingTries: 0,
    deadline: Date.now() + 9000,
    lastError: null,
  };

  // Première bonne proposition : analysée et montrée tout de suite, elle restera en tête.
  let pinned: { cand: Cand; route: Route } | null = null;
  let partial: Promise<void> = Promise.resolve();
  if (o.onPartial) {
    ctx.onGood = (cand) => {
      if (pinned) return;
      pinned = { cand, route: null as unknown as Route };
      const pin = pinned;
      partial = (async () => {
        const raster = await within(rasterP, 400, null);
        const water = p.water ? await within(waterP, 1500, [] as LngLat[]) : [];
        if (signal?.aborted) return;
        const a = analyse(cand, ctx, raster, water, settings);
        a.route.name = routeName((cand.half ?? cand.res).maneuvers, p.shape, start.coord, cand.far, dest ? o.destination?.name : undefined);
        if (vias.length) a.route.vias = orderedVias(o.vias!, cand);
        pin.route = a.route;
        o.onPartial!({ routes: [a.route], note: null, weather: wx });
      })();
    };
  }

  let candidates: Cand[] = [];
  const S = start.coord;
  if (p.shape === 'loop') {
    if (!vias.length) candidates = await loops(ctx);
    else if (via) candidates = await viaLoops(ctx, via);
    else {
      const ord = orderVias(S, vias, S);
      candidates = await throughPoints(ctx, [S, ...ord, S], farthest(S, ord));
    }
  } else if (p.shape === 'outback') {
    candidates = vias.length ? await pathExtend(ctx, [S, ...orderVias(S, vias, null)], true) : await outbacks(ctx);
  } else if (dest) {
    candidates = vias.length ? await throughPoints(ctx, [S, ...orderVias(S, vias, dest), dest], dest) : await oneways(ctx, dest);
  } else {
    candidates = vias.length ? await pathExtend(ctx, [S, ...orderVias(S, vias, null)], false) : await freeOneways(ctx);
  }
  if (signal?.aborted) throw aborted();

  if (!candidates.length) {
    const e = ctx.lastError;
    throw new GenerateError(
      e && (e.code === 171 || e.status === 0 || e.code === 154)
        ? routingMessage(e)
        : 'Aucun parcours trouvé autour de ce départ. Essaie une distance plus courte ou un autre point de départ.',
    );
  }

  // Rapport longueur / figure de ce quartier, pour la prochaine fois.
  if (!vias.length && p.shape !== 'oneway') saveRatio(rKey, ctx.ratio);

  report('Comparaison des propositions…', 0.9);
  await partial;
  const [raster, water] = await Promise.all([within(rasterP, 2500, null), within(waterP, 2500, [] as LngLat[])]);
  if (signal?.aborted) throw aborted();
  const all = candidates.map((cand) => analyse(cand, ctx, raster, water, settings));
  all.sort((a, b) => a.route.match!.score - b.route.match!.score);
  // Jamais une proposition qui repasse au même endroit, ni très loin de la distance, s'il y a mieux.
  // Faute de deux boucles impeccables, on complète avec celles qui ne repassent que sur un bout de rue
  // (moins de 100 m, souvent la rue du départ) : elles viennent après, et le détail le signale.
  const near = (a: (typeof all)[number]) => a.cand.err >= -0.12 && a.cand.err <= Math.max(0.12, Math.min(1000, 0.15 * D) / D);
  const fine = all.filter((a) => near(a) && retraceOf(ctx, a.cand) <= retraceOk(a.cand.L));
  const almost = all.filter((a) => near(a) && !fine.includes(a) && retraceOf(ctx, a.cand) <= Math.max(100, 0.006 * a.cand.L));
  const pool = fine.length >= 2 ? fine : [...fine, ...almost];
  const analysed = pool.length ? pool : all;
  const picked: typeof analysed = [];
  const pin = pinned as { cand: Cand; route: Route | null } | null;
  if (pin?.route) {
    // La proposition déjà montrée reste en tête, quoi qu'on ait appris depuis.
    const a = all.find((x) => x.cand === pin.cand);
    if (a) {
      a.route.id = pin.route.id;
      a.route.createdAt = pin.route.createdAt;
      picked.push(a);
    }
  }
  for (const a of analysed) {
    if (picked.length === 3) break;
    if (!picked.includes(a) && picked.every((q) => similarity(q.route.coords, a.route.coords) < 0.7)) picked.push(a);
  }
  for (const a of analysed) {
    if (picked.length === 3) break;
    if (!picked.includes(a) && picked.every((q) => similarity(q.route.coords, a.route.coords) < 0.92)) picked.push(a);
  }
  for (const a of picked) {
    a.route.name =
      pin?.route && a.cand === pin.cand
        ? pin.route.name
        : routeName((a.cand.half ?? a.cand.res).maneuvers, p.shape, start.coord, a.cand.far, dest ? o.destination?.name : undefined);
  }

  const routes = picked.map((a) => a.route);
  if (vias.length) picked.forEach((a, i) => (routes[i].vias = orderedVias(o.vias!, a.cand)));
  tag(routes, p);

  let note: string | null = null;
  if ((vias.length || dest) && routes.length) {
    const shortest = Math.min(...routes.map((r) => r.lengthM));
    if (shortest > D * 1.12) {
      const by = vias.length === 1 ? `passer par ${o.vias![0].name}` : vias.length ? 'passer par ces lieux' : `aller à ${o.destination!.name}`;
      note = `Pour ${by}, le parcours fait au moins ${(shortest / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km.`;
    }
  }
  if (p.elevation != null && routes.length && !note) {
    const bestAscent = Math.max(...routes.map((r) => r.ascent));
    const lowest = Math.min(...routes.map((r) => r.ascent));
    if (bestAscent < p.elevation * 0.6) note = `Le relief autour du départ est limité : au mieux ${bestAscent} m de dénivelé pour cette distance.`;
    else if (lowest > p.elevation * 1.6 && p.elevation < 60) note = `Terrain vallonné autour du départ : au moins ${lowest} m de dénivelé pour cette distance.`;
  }
  if (p.water && routes.every((r) => !r.waterPoints.length)) {
    note = (note ? note + ' ' : '') + 'Aucun point d’eau connu sur ces parcours.';
  }

  // Répartition des sols : après coup, une proposition après l'autre, sans retarder l'affichage.
  if (o.onDetails) {
    const halves = picked.map((a) => (a.cand.half ?? a.cand.res).coords);
    void (async () => {
      let cur = routes;
      for (let i = 0; i < cur.length; i++) {
        try {
          const s = await surfaceSplit(halves[i], costing, signal);
          if (signal?.aborted) return;
          if (s) {
            cur = cur.map((r, k) => (k === i ? { ...r, surface: s.surface, busy: s.busy } : r));
            o.onDetails!(cur);
          }
        } catch {
          if (signal?.aborted) return;
          /* répartition des sols indisponible : la carte reste utilisable */
        }
      }
    })();
  } else {
    await Promise.all(
      picked.map(async (a) => {
        try {
          const s = await surfaceSplit((a.cand.half ?? a.cand.res).coords, costing, signal);
          if (s) {
            a.route.surface = s.surface;
            a.route.busy = s.busy;
          }
        } catch {
          /* répartition des sols indisponible */
        }
      }),
    );
  }

  report('Terminé', 1);
  return { routes, note, weather: wx };
}

/* ---------------------------------- Boucles ---------------------------------- */

/** Une boucle ne repasse pas au même endroit : au plus un bout de carrefour (30 m, 0,15 % d'une longue sortie). */
const RETRACE_OK = 30;
const retraceOk = (L: number) => Math.max(RETRACE_OK, 0.0015 * L);

/**
 * Distance tenue : à 5 % près du premier coup ; ensuite à 6 % près, ou jusqu'à 1 km de plus quand
 * c'est le prix pour ne pas repasser au même endroit.
 */
function distanceOk(c: Ctx, cand: Cand, relaxed: boolean): boolean {
  if (!relaxed) return Math.abs(cand.err) <= 0.05;
  return cand.err >= -0.06 && cand.err <= Math.max(0.06, Math.min(1000, 0.1 * c.D) / c.D);
}

/** Distance à 8 % près (ou jusqu'à 1 km de plus) : assez pour montrer une première proposition. */
function roughDistance(c: Ctx, cand: Cand): boolean {
  return cand.err >= -0.08 && cand.err <= Math.max(0.08, Math.min(1000, 0.1 * c.D) / c.D);
}

/**
 * Réparations d'une boucle qui repasse :
 * - départ et retour par la même rue : l'essai suivant part dans le même sens, et doit arriver en marchant
 *   dans ce sens, donc par l'autre côté du départ ; si cela ne suffit pas (impasse), la rue est évitée
 *   au-delà de 150 m ;
 * - portion reprise ailleurs : ses tronçons sont évités au prochain essai (loin des points de la figure),
 *   ou la figure tourne un peu quand c'est trop près de ses points.
 */
function repairLoop(c: Ctx, plan: Plan, cand: Cand) {
  const rt = cand.rt;
  if (!rt) return;
  const loop = c.p.shape === 'loop';
  if (loop) {
    if (cand.heading != null) c.headingTries++;
    if (rt.stem <= RETRACE_OK) c.cleanStart = true;
    else c.minStem = Math.min(c.minStem, rt.stem);
  }
  if (!rt.stretches.length) return;
  const keepAway = [c.start, ...cand.built.anchors, ...c.keep];
  const add = (pts: LngLat[]) => {
    if (!plan.fix.noAvoid) plan.fix.avoid = [...plan.fix.avoid, ...pts].slice(-24);
  };
  for (const s of rt.stretches) {
    const isStem = loop && s.to >= cand.L - 40 && s.firstFrom <= 40;
    if (isStem) {
      if (s.to - s.from <= RETRACE_OK) continue;
      // Partir dans le même sens et revenir en marchant dans ce sens, donc par l'autre côté du départ.
      // Quand une autre boucle y est arrivée (le départ n'est pas une impasse), la rue commune est aussi
      // évitée au-delà de 150 m ; dans une impasse, l'éviter couperait le départ du reste du monde.
      if (cand.heading == null && !plan.fix.headingTried) {
        plan.fix.heading = departureBearing(cand.res.coords);
        plan.fix.headingTried = true;
      }
      if (c.cleanStart) add(avoidPoints(cand.res.coords, s, keepAway));
      continue;
    }
    const pts = avoidPoints(cand.res.coords, s, keepAway);
    if (pts.length) add(pts);
    else plan.fix.turn += (c.rnd() < 0.5 ? -1 : 1) * 14;
  }
}

/**
 * Rayon autour du point de passage imposé où un aller-retour est permis : le lieu lui-même, souvent
 * au milieu d'un parc, à quelques dizaines de mètres du chemin le plus proche.
 */
function viaRadius(coords: LngLat[], v: LngLat): number {
  let d = Infinity;
  for (const q of coords) d = Math.min(d, haversine(q, v));
  return Math.max(60, Math.min(400, d + 40));
}

/** La portion passe-t-elle à moins de `d` m de ce point ? */
function nearPoint(coords: LngLat[], s: { from: number; to: number }, q: LngLat, d: number): boolean {
  const cum = cumulative(coords);
  for (let i = 0; i < coords.length; i++) {
    if (cum[i] < s.from - d || cum[i] > s.to + d) continue;
    if (haversine(coords[i], q) <= d) return true;
  }
  return false;
}

async function loops(c: Ctx): Promise<Cand[]> {
  const { p, start: S, D } = c;
  // Trois points de passage : deux boucles tiennent dans une requête (10 points au plus).
  const n = 3;
  const poly = 2 * (n + 1) * Math.sin(Math.PI / (n + 1));
  const r0 = D / (c.ratio * poly);
  const K = 8;
  const offset = c.rnd() * 45;
  const dirs = Array.from({ length: K }, (_, i) => (offset + i * 45) % 360);
  const circle = (theta: number, r: number, m: number) => {
    const ctr = destination(S, theta, r);
    const back = (theta + 180) % 360;
    return Array.from({ length: m }, (_, j) => destination(ctr, back + (j * 360) / m, r));
  };

  let relief: number[] | null = null;
  if (p.elevation != null) {
    const M = 20;
    const h = await c.heightsOf(dirs.flatMap((t) => circle(t, r0, M)));
    if (h) relief = dirs.map((_, i) => cyclicGain(h.slice(i * M, i * M + M)));
  }
  if (c.signal?.aborted) throw aborted();
  const scored = dirs.map((dir, i) => ({ dir, score: directionScore(c, dir, circle(dir, r0, 24), relief?.[i] ?? null, 1.7) }));
  const order = pickDirections(scored, 60);

  const plans = order.map((theta, rank) => {
    const cw = c.rnd() < 0.5;
    return makePlan({
      rank,
      status: rank < 4 ? 'wait' : 'reserve',
      target: D,
      windAlign: windAlign(c.wx, theta),
      initSize: () => D / (c.ratio * poly),
      observe: (size, part) => {
        c.ratio = clamp(c.ratio * 0.55 + (part / (poly * size)) * 0.45, 1.02, 2.6);
      },
      build: (r, fix) => {
        const th = theta + fix.turn;
        const ctr = destination(S, th, r);
        const back = (th + 180) % 360;
        const wps: LngLat[] = [];
        for (let j = 1; j <= n; j++) {
          let w = destination(ctr, back + (cw ? 1 : -1) * ((j * 360) / (n + 1)), r);
          if (c.des) w = pullToward(c.des, w, Math.max(250, r * 0.38));
          wps.push(w);
        }
        const h = fix.heading ?? undefined;
        const points: Waypoint[] = [{ coord: S, heading: h }, ...wps.map((coord) => ({ coord, through: !fix.plain })), { coord: S, heading: h }];
        return { job: { points, avoid: fix.avoid }, size: r, far: destination(S, th, r * 2), anchors: wps, heading: h ?? null };
      },
    });
  });

  return runSearch(c, plans, {
    want: 3,
    maxRequests: 7,
    from: 0.15,
    to: 0.85,
    good: (x) => retraceOf(c, x) <= retraceOk(x.L) && distanceOk(c, x, x.plan.tries >= 2),
    usable: (x) => retraceOf(c, x) <= retraceOk(x.L) && roughDistance(c, x),
    repair: (plan, x) => repairLoop(c, plan, x),
  });
}

/* ------------------------------- Allers-retours ------------------------------ */

async function outbacks(c: Ctx): Promise<Cand[]> {
  const { p, start, D } = c;
  const half = D / 2;
  const d0 = half / c.ratio;
  const K = 8;
  const offset = c.rnd() * 45;
  const dirs = Array.from({ length: K }, (_, i) => (offset + i * 45) % 360);
  const ray = (theta: number, d: number, m: number) => Array.from({ length: m }, (_, j) => destination(start, theta, (d * (j + 1)) / m));

  let relief: number[] | null = null;
  if (p.elevation != null) {
    const M = 14;
    const h = await c.heightsOf(dirs.flatMap((t) => [start, ...ray(t, d0, M - 1)]));
    if (h) relief = dirs.map((_, i) => pathGain(h.slice(i * M, i * M + M)) * 2);
  }
  if (c.signal?.aborted) throw aborted();
  const scored = dirs.map((dir, i) => ({ dir, score: directionScore(c, dir, ray(dir, d0, 16), relief?.[i] ?? null, 1.5) }));
  const order = pickDirections(scored, 70);

  // Un aller-retour, c'est un aller : cinq allers tiennent dans une requête.
  const plans = order.map((theta, rank) =>
    makePlan({
      rank,
      status: rank < 5 ? 'wait' : 'reserve',
      target: half,
      mirror: true,
      windAlign: windAlign(c.wx, theta),
      initSize: () => half / c.ratio,
      observe: (size, part) => {
        c.ratio = clamp(c.ratio * 0.55 + (part / size) * 0.45, 1.02, 2.6);
      },
      build: (d, fix) => {
        let turn = destination(start, theta + fix.turn, d);
        if (c.des) turn = pullToward(c.des, turn, Math.max(250, d * 0.3));
        return { job: { points: [{ coord: start }, { coord: turn }] }, size: d, far: turn, anchors: [turn] };
      },
    }),
  );
  return runSearch(c, plans, {
    want: 3,
    maxRequests: 4,
    from: 0.15,
    to: 0.85,
    good: (x) => Math.abs(x.err) <= (x.plan.tries >= 2 ? 0.06 : 0.045),
    usable: (x) => Math.abs(x.err) <= 0.08,
  });
}

/* ------------------------------ Vers un lieu (A vers B) ------------------------------ */

async function oneways(c: Ctx, B: LngLat): Promise<Cand[]> {
  const { start: A, D } = c;
  let direct: RouteResult[] = [];
  try {
    direct = (await route([{ coord: A }, { coord: B }], c.costing, c.signal, 2)).map((r) => clean(r));
  } catch (e) {
    if (e instanceof RoutingError) throw new GenerateError(routingMessage(e));
    throw e;
  }
  c.report('Recherche des chemins…', 0.4);
  const fixedPlan = makePlan({ rank: 99, status: 'done', target: D, windAlign: 0, initSize: () => 0, build: () => ({ job: { points: [] }, size: 0, far: B, anchors: [] }) });
  const out: Cand[] = direct.map((res) => fixedCand(c, res, B, fixedPlan));
  const L0 = lengthOf(direct[0].coords);
  if (D <= L0 * 1.1) return out;

  const ab = haversine(A, B);
  const ratio = clamp(L0 / Math.max(ab, 1), 1.05, 1.8);
  // Détour en arc, d'un côté ou de l'autre : deux points sur une courbe qui s'écarte de h du trajet direct
  // (un seul point au loin donnerait souvent un aller-retour vers lui).
  const proj = localProjector(A);
  const [bx, by] = proj.to(B);
  const nx = -by / Math.max(1, ab);
  const ny = bx / Math.max(1, ab);
  const plans = [1, -1].map((side, rank) =>
    makePlan({
      rank,
      target: D,
      windAlign: 0,
      initSize: () => Math.sqrt(Math.max(0, (D / (2 * ratio)) ** 2 - (ab / 2) ** 2)),
      build: (h, fix) => {
        const cx = bx / 2 + side * nx * 2 * h;
        const cy = by / 2 + side * ny * 2 * h;
        const at = (t: number) => proj.from(2 * (1 - t) * t * cx + t * t * bx, 2 * (1 - t) * t * cy + t * t * by);
        const shift = fix.turn / 360;
        const wps = [at(1 / 3 + shift), at(2 / 3 + shift)].map((w) => (c.des ? pullToward(c.des, w, Math.max(250, h * 0.3)) : w));
        return {
          job: { points: [{ coord: A }, ...wps.map((coord) => ({ coord, through: !fix.plain })), { coord: B }], avoid: fix.avoid },
          size: h,
          far: B,
          anchors: [...wps, B],
        };
      },
    }),
  );
  const found = await runSearch(c, plans, {
    want: 2,
    maxRequests: 3,
    from: 0.4,
    to: 0.85,
    good: (x) => Math.abs(x.err) <= (x.plan.tries >= 2 ? 0.07 : 0.05) && retraceOf(c, x) <= retraceOk(x.L),
    usable: (x) => Math.abs(x.err) <= 0.1 && retraceOf(c, x) <= retraceOk(x.L),
    repair: (plan, x) => repairLoop(c, plan, x),
  });
  return [...found, ...out];
}

function fixedCand(c: Ctx, res: RouteResult, far: LngLat, plan: Plan, half?: RouteResult): Cand {
  const L = lengthOf(res.coords);
  return {
    res,
    half,
    far,
    windAlign: 0,
    L,
    err: (L - c.D) / c.D,
    rt: retracesOf(c, res.coords),
    plan,
    built: { job: { points: [] }, size: 0, far, anchors: [] },
    heading: null,
  };
}

/* -------------------------- Avec un point de passage imposé -------------------------- */

/**
 * Boucles qui passent par V : deux cercles passant par le départ et V (un de chaque côté de la ligne
 * départ–V), puis des boucles ordinaires orientées autour de V, dont le point de passage le plus proche
 * de V est remplacé par V. La taille s'ajuste à la distance.
 */
async function viaLoops(c: Ctx, V: LngLat): Promise<Cand[]> {
  const { start: S, D } = c;
  const d = Math.max(60, haversine(S, V));
  const brg = bearing(S, V);
  const M = destination(S, brg, d / 2);
  // Quatre sommets, départ et V compris : deux boucles tiennent dans une requête.
  const n = 4;
  const poly = 2 * n * Math.sin(Math.PI / n);
  const pull = (w: LngLat, r: number) => (c.des ? pullToward(c.des, w, Math.max(200, r * 0.3)) : w);

  const circle = (side: 1 | -1, r: number): LngLat[] => {
    const rr = Math.max(r, (d / 2) * 1.04);
    const hh = Math.sqrt(rr * rr - (d / 2) ** 2);
    const C = destination(M, brg + 90 * side, hh);
    const aS = bearing(C, S);
    const aV = bearing(C, V);
    const span = (aV - aS + 360) % 360;
    const k1 = Math.round(((n - 2) * span) / 360);
    const k2 = n - 2 - k1;
    const mid: LngLat[] = [];
    for (let i = 1; i <= k1; i++) mid.push(pull(destination(C, aS + (span * i) / (k1 + 1), rr), rr));
    mid.push(V);
    for (let i = 1; i <= k2; i++) mid.push(pull(destination(C, aV + ((360 - span) * i) / (k2 + 1), rr), rr));
    return mid;
  };
  const around = (theta: number, cw: boolean, r: number): LngLat[] => {
    const ctr = destination(S, theta, r);
    const back = (theta + 180) % 360;
    const wps = [1, 2, 3].map((j) => destination(ctr, back + (cw ? 1 : -1) * ((j * 360) / 4), r));
    let k = 0;
    wps.forEach((w, i) => {
      if (haversine(w, V) < haversine(wps[k], V)) k = i;
    });
    return wps.map((w, i) => (i === k ? V : pull(w, r)));
  };

  const variants: { side?: 1 | -1; theta?: number; cw?: boolean; status: Plan['status'] }[] = [
    { side: 1, status: 'wait' },
    { side: -1, status: 'wait' },
    { theta: brg + 45, cw: true, status: 'wait' },
    { theta: brg - 45, cw: false, status: 'wait' },
    { theta: brg + 100, cw: true, status: 'reserve' },
    { theta: brg - 100, cw: false, status: 'reserve' },
  ];
  const plans = variants.map((v, rank) =>
    makePlan({
      rank,
      status: v.status,
      target: D,
      windAlign: windAlign(c.wx, v.theta ?? brg),
      initSize: () => D / (c.ratio * poly),
      build: (size, fix) => {
        const mid = v.side ? circle(v.side, size) : around(v.theta! + fix.turn, v.cw!, size);
        const h = fix.heading ?? undefined;
        const points: Waypoint[] = [{ coord: S, heading: h }, ...mid.map((coord) => ({ coord, through: !fix.plain })), { coord: S, heading: h }];
        return { job: { points, avoid: fix.avoid }, size, far: V, anchors: mid, heading: h ?? null };
      },
    }),
  );
  return runSearch(c, plans, {
    want: 3,
    maxRequests: 6,
    from: 0.15,
    to: 0.85,
    // Même trop longue (point de passage loin), la boucle reste proposée : une remarque le dira.
    good: (x) => retraceOf(c, x) <= retraceOk(x.L) && distanceOk(c, x, x.plan.tries >= 2),
    usable: (x) => retraceOf(c, x) <= retraceOk(x.L) && roughDistance(c, x),
    repair: (plan, x) => repairLoop(c, plan, x),
  });
}

/* ------------------------- Plusieurs points de passage, aller simple ------------------------- */

/**
 * Ordre de passage qui fait le moins de chemin : du départ, par tous les points, jusqu'à l'arrivée (le
 * départ pour une boucle), ou sans arrivée imposée. Tous les ordres sont essayés (5 points au plus).
 */
function orderVias(S: LngLat, vias: LngLat[], end: LngLat | null): LngLat[] {
  if (vias.length < 2) return vias;
  let best = vias;
  let bestL = Infinity;
  const walk = (done: LngLat[], rest: LngLat[], L: number) => {
    if (L >= bestL) return;
    if (!rest.length) {
      const total = L + (end ? haversine(done[done.length - 1], end) : 0);
      if (total < bestL) {
        bestL = total;
        best = done;
      }
      return;
    }
    const from = done.length ? done[done.length - 1] : S;
    rest.forEach((v, i) => walk([...done, v], [...rest.slice(0, i), ...rest.slice(i + 1)], L + haversine(from, v)));
  };
  walk([], vias, 0);
  return best;
}

function farthest(S: LngLat, pts: LngLat[]): LngLat {
  return pts.reduce((a, q) => (haversine(S, q) > haversine(S, a) ? q : a), pts[0] ?? S);
}

/** Les points de passage dans l'ordre où le parcours les rencontre. */
function orderedVias(vias: Place[], cand: Cand): { name: string; coord: LngLat }[] {
  const coords = cand.half?.coords ?? cand.res.coords;
  const at = (v: LngLat) => {
    let k = 0;
    let d = Infinity;
    coords.forEach((q, i) => {
      const x = haversine(q, v);
      if (x < d) {
        d = x;
        k = i;
      }
    });
    return k;
  };
  return vias
    .map((v) => ({ v, k: at(v.coord) }))
    .sort((a, b) => a.k - b.k)
    .map(({ v }) => ({ name: v.name, coord: v.coord }));
}

/**
 * Trajet par des points imposés, dans l'ordre : départ, points de passage, arrivée (le départ pour une
 * boucle). D'abord le trajet direct, puis deux détours sur la plus longue étape si la distance le demande.
 */
async function throughPoints(c: Ctx, pts: LngLat[], far: LngLat): Promise<Cand[]> {
  const { D } = c;
  const loop = c.p.shape === 'loop';
  const asPoints = (seq: LngLat[], t: boolean, heading?: number): Waypoint[] =>
    seq.map((coord, i) => (i === 0 || i === seq.length - 1 ? { coord, heading: loop ? heading : undefined } : { coord, through: t }));
  let base: RouteResult;
  try {
    base = clean((await routeJobs([{ points: asPoints(pts, true) }], c.costing, c.signal))[0], c.keep, loop);
  } catch (e) {
    if (e instanceof RoutingError) throw new GenerateError('Aucun chemin praticable ne relie ces points pour ce sport.');
    throw e;
  }
  const basePlan = makePlan({ rank: 99, status: 'done', target: D, windAlign: 0, initSize: () => 0, build: () => ({ job: { points: [] }, size: 0, far, anchors: [] }) });
  const out: Cand[] = [fixedCand(c, base, far, basePlan)];
  const L0 = lengthOf(base.coords);
  c.report('Recherche des chemins…', 0.4);
  if (D <= L0 * 1.1) return out;
  // Le détour s'écarte de la plus longue étape, d'un côté ou de l'autre.
  let k = 0;
  for (let i = 1; i < pts.length - 1; i++) if (haversine(pts[i], pts[i + 1]) > haversine(pts[k], pts[k + 1])) k = i;
  const [P, Q] = [pts[k], pts[k + 1]];
  const pq = Math.max(60, haversine(P, Q));
  const brg = bearing(P, Q);
  const mid = destination(P, brg, pq / 2);
  const extra = (D - L0) / 1.3;
  const plans = [90, -90].map((side, rank) =>
    makePlan({
      rank,
      target: D,
      windAlign: 0,
      initSize: () => Math.sqrt(Math.max(0, ((extra + pq) / 2) ** 2 - (pq / 2) ** 2)),
      build: (h, fix) => {
        let w = destination(mid, brg + side + fix.turn, h);
        if (c.des) w = pullToward(c.des, w, Math.max(250, h * 0.3));
        const seq = [...pts.slice(0, k + 1), w, ...pts.slice(k + 1)];
        const head = fix.heading ?? undefined;
        return { job: { points: asPoints(seq, !fix.plain, head), avoid: fix.avoid }, size: h, far, anchors: seq.slice(1), heading: loop ? (head ?? null) : null };
      },
    }),
  );
  const found = await runSearch(c, plans, {
    want: 2,
    maxRequests: 3,
    from: 0.4,
    to: 0.85,
    good: (x) => Math.abs(x.err) <= (x.plan.tries >= 2 ? 0.07 : 0.05) && retraceOf(c, x) <= retraceOk(x.L),
    usable: (x) => Math.abs(x.err) <= 0.1 && retraceOf(c, x) <= retraceOk(x.L),
    repair: (plan, x) => repairLoop(c, plan, x),
  });
  return [...found, ...out];
}

/**
 * Par des points de passage, puis plus loin si la distance le demande : l'aller d'un aller-retour (retour
 * par le même chemin), ou un aller simple qui s'arrête là où la distance est atteinte.
 */
async function pathExtend(c: Ctx, pts: LngLat[], back: boolean): Promise<Cand[]> {
  const goal = back ? c.D / 2 : c.D;
  const last = pts[pts.length - 1];
  const inner = (seq: LngLat[], t: boolean): Waypoint[] => seq.map((coord, i) => (i === 0 || i === seq.length - 1 ? { coord } : { coord, through: t }));
  let first: RouteResult;
  try {
    first = clean((await routeJobs([{ points: inner(pts, true) }], c.costing, c.signal))[0], c.keep);
  } catch (e) {
    if (e instanceof RoutingError) throw new GenerateError('Aucun chemin praticable ne mène à ces points de passage pour ce sport.');
    throw e;
  }
  const L1 = lengthOf(first.coords);
  const brg = bearing(pts[pts.length - 2], last);
  const basePlan = makePlan({ rank: 99, status: 'done', target: goal, windAlign: windAlign(c.wx, brg), initSize: () => 0, build: () => ({ job: { points: [] }, size: 0, far: last, anchors: [] }) });
  const only = back ? fixedCand(c, mirror(first), last, basePlan, first) : fixedCand(c, first, last, basePlan);
  if (L1 >= goal * 0.92) return [only];
  // La taille se règle sur la longueur ajoutée après le dernier point (offset : le trajet jusqu'à lui).
  const plans = [0, 55, -55].map((dev, rank) =>
    makePlan({
      rank,
      target: goal,
      offset: L1,
      mirror: back,
      windAlign: windAlign(c.wx, brg + dev),
      initSize: () => (goal - L1) / 1.3,
      build: (e, fix) => {
        let turn = destination(last, brg + dev + fix.turn, e);
        if (c.des) turn = pullToward(c.des, turn, Math.max(200, e * 0.3));
        const seq = [...pts, turn];
        return { job: { points: inner(seq, !fix.plain), avoid: back ? undefined : fix.avoid }, size: e, far: turn, anchors: seq.slice(1) };
      },
    }),
  );
  const found = await runSearch(c, plans, {
    want: 3,
    maxRequests: 3,
    from: 0.3,
    to: 0.85,
    good: (x) => Math.abs(x.err) <= (x.plan.tries >= 2 ? 0.06 : 0.045) && (back || retraceOf(c, x) <= retraceOk(x.L)),
    usable: (x) => Math.abs(x.err) <= 0.08 && (back || retraceOf(c, x) <= retraceOk(x.L)),
    repair: back ? undefined : (plan, x) => repairLoop(c, plan, x),
  });
  return found.length ? found : [only];
}

/**
 * Aller simple sans arrivée choisie : vers les directions les plus agréables (milieux voulus), jusqu'à la
 * distance demandée. Le tracé s'incurve un peu pour ne pas suivre une seule grande route.
 */
async function freeOneways(c: Ctx): Promise<Cand[]> {
  const { start: S, D } = c;
  const off = c.rnd() * 360;
  const reach = D / c.ratio;
  const dirs = Array.from({ length: 8 }, (_, i) => (off + i * 45) % 360)
    .map((th) => ({ th, s: directionScore(c, th, [1, 2, 3].map((j) => destination(S, th, (reach * j) / 3)), null, 0) }))
    .sort((a, b) => a.s - b.s);
  const plans = dirs.slice(0, 5).map(({ th }, rank) =>
    makePlan({
      rank,
      status: rank < 3 ? 'wait' : 'reserve',
      target: D,
      windAlign: 0,
      initSize: () => reach,
      build: (r, fix) => {
        const t = th + fix.turn;
        const bend = (rank % 2 ? 1 : -1) * 14;
        const wps = [destination(S, t + bend, r / 3), destination(S, t - bend / 2, (2 * r) / 3)].map((w) => (c.des ? pullToward(c.des, w, Math.max(250, r * 0.15)) : w));
        const E = destination(S, t, r);
        return {
          job: { points: [{ coord: S }, ...wps.map((coord) => ({ coord, through: !fix.plain })), { coord: E }], avoid: fix.avoid },
          size: r,
          far: E,
          anchors: [...wps, E],
        };
      },
    }),
  );
  return runSearch(c, plans, {
    want: 3,
    maxRequests: 5,
    from: 0.15,
    to: 0.85,
    good: (x) => Math.abs(x.err) <= (x.plan.tries >= 2 ? 0.07 : 0.05) && retraceOf(c, x) <= retraceOk(x.L),
    usable: (x) => Math.abs(x.err) <= 0.1 && retraceOf(c, x) <= retraceOk(x.L),
    repair: (plan, x) => repairLoop(c, plan, x),
  });
}

/* ------------------------------------ Outils ------------------------------------ */

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

function analyse(cand: Cand, c: Ctx, raster: EnvRaster | null, water: LngLat[], settings: Settings) {
  const { p, D } = c;
  const res = cand.res;
  const lengthM = lengthOf(res.coords);
  const st = elevationStats(res.profile);
  // Ce qui repasse au même endroit (hors aller-retour demandé et départ au fond d'une impasse).
  const retrace = p.shape === 'outback' ? 0 : retraceOf(c, cand);
  const overlap = lengthM > 0 ? retrace / lengthM : 0;
  const env = envSplit(raster, res.coords);
  const share = p.envs.length ? envShare(env, p.envs) : null;
  const waterPoints = p.water ? nearRoute(res.coords, water, 40) : [];
  const tracks = trackShare(raster, res.coords);
  const unpaved = unpavedWeight(p);
  const signed = (lengthM - D) / D;
  const distErr = Math.abs(signed);
  // Une boucle un peu plus longue (jusqu'à 1 km) vaut mieux qu'une boucle qui repasse.
  const allowance = Math.min(1000, 0.1 * D) / D;
  const distCost = p.shape === 'loop' && signed > 0 ? (signed <= allowance ? 1.4 * signed : 1.4 * allowance + 3 * (signed - allowance)) : 3 * distErr;
  const elevErr = p.elevation != null ? Math.abs(st.ascent - p.elevation) / Math.max(p.elevation, 50) : 0;
  const score =
    distCost +
    1.2 * Math.min(1.5, elevErr) +
    (share != null ? 1.1 * (1 - Math.min(1, share * 1.25)) : 0) +
    20 * overlap +
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
  if (routes.length > 1) {
    const best = [...routes].sort((a, b) => (a.match?.score ?? 0) - (b.match?.score ?? 0))[0];
    best.tags!.push('Meilleur accord');
  }
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
}
