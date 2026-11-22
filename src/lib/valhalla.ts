import type { LngLat, Params, Profile, Settings, SurfaceSplit } from './types';
import { decodePolyline, encodePolyline, haversine, simplify } from './geo';
import { cleanElevation } from './elevation';

const BASE = 'https://valhalla1.openstreetmap.de';
export const ELEV_STEP = 30;

export class RoutingError extends Error {
  constructor(
    message: string,
    public code: number | null,
    public status: number,
  ) {
    super(message);
  }
}

/*
 * Serveur public partagé (FOSSGIS) : au plus une requête par seconde, comme le demandent ses conditions
 * d'utilisation. Chaque requête attend son tour ; une requête abandonnée libère le sien.
 * Limites du serveur : 10 points par itinéraire, 50 points à éviter.
 */
export const MAX_LOCATIONS = 10;
export const MAX_AVOID = 50;
const MIN_GAP = 1000;
let lastStart = -Infinity;
interface Waiter {
  go: () => void;
  fail: (e: unknown) => void;
  signal?: AbortSignal;
}
const waiting: Waiter[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function pump() {
  timer = null;
  if (!waiting.length) return;
  const wait = lastStart + MIN_GAP - Date.now();
  if (wait > 0) {
    timer = setTimeout(pump, wait);
    return;
  }
  lastStart = Date.now();
  waiting.shift()!.go();
  if (waiting.length) timer = setTimeout(pump, MIN_GAP);
}

/** Attente avant le prochain créneau libre (ms). */
export function nextSlotDelay(): number {
  return Math.max(0, lastStart + MIN_GAP - Date.now()) + waiting.length * MIN_GAP;
}

function slot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
  return new Promise<void>((go, fail) => {
    const w: Waiter = { go, fail, signal };
    waiting.push(w);
    signal?.addEventListener(
      'abort',
      () => {
        const i = waiting.indexOf(w);
        if (i >= 0) {
          waiting.splice(i, 1);
          fail(new DOMException('aborted', 'AbortError'));
        }
      },
      { once: true },
    );
    if (!timer) pump();
  });
}

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        rej(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let attempt = 0;
  for (;;) {
    await slot(signal);
    let res: Response;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      if (attempt++ < 2) {
        await pause(700 * 2 ** attempt, signal);
        continue;
      }
      throw new RoutingError('Le service d’itinéraires ne répond pas.', null, 0);
    }
    if (res.ok) return (await res.json()) as T;
    if ([429, 502, 503, 504].includes(res.status) && attempt++ < 2) {
      await pause(900 * 2 ** attempt, signal);
      continue;
    }
    let code: number | null = null;
    let msg = `Erreur ${res.status}`;
    try {
      const j = await res.json();
      code = j.error_code ?? null;
      msg = j.error ?? msg;
    } catch {
      /* corps illisible */
    }
    throw new RoutingError(msg, code, res.status);
  }
}

export interface Costing {
  costing: 'pedestrian' | 'bicycle';
  options: Record<string, number | string | boolean>;
}

/** Envie de relief (0 à 1) déduite du dénivelé visé par km. */
export function hillPreference(p: Params): number {
  if (p.elevation == null) return p.sport === 'trail' ? 0.65 : 0.5;
  const r = p.elevation / Math.max(1, p.distanceKm);
  if (r < 3) return 0;
  if (r < 7) return 0.2;
  if (r < 13) return 0.5;
  if (r < 22) return 0.8;
  return 1;
}

export function costingFor(p: Params, s: Settings): Costing {
  const use_hills = hillPreference(p);
  switch (p.sport) {
    case 'run':
      return {
        costing: 'pedestrian',
        options: {
          use_hills,
          use_tracks: p.surface === 'a' ? 0 : p.surface === 'b' ? 0.5 : 1,
          walkway_factor: p.surface === 'a' ? 1.1 : p.surface === 'c' ? 0.55 : p.avoidBusy ? 0.8 : 1,
          sidewalk_factor: p.avoidBusy ? 0.95 : 1,
          use_living_streets: 0.8,
          use_lit: p.lit ? 1 : 0,
          step_penalty: 25,
          max_hiking_difficulty: 1,
          use_ferry: 0,
        },
      };
    case 'trail':
      return {
        costing: 'pedestrian',
        options: {
          use_hills,
          use_tracks: 1,
          walkway_factor: p.surface === 'a' ? 0.8 : 0.5,
          sidewalk_factor: 1.3,
          use_living_streets: 0.2,
          step_penalty: 0,
          max_hiking_difficulty: p.surface === 'a' ? 1 : p.surface === 'b' ? 2 : 4,
          use_ferry: 0,
        },
      };
    case 'road':
      return {
        costing: 'bicycle',
        options: {
          bicycle_type: 'Road',
          cycling_speed: s.speedRoad,
          use_roads: p.avoidBusy ? 0.25 : 0.6,
          use_hills,
          avoid_bad_surfaces: 1,
          use_living_streets: 0.3,
          use_ferry: 0,
        },
      };
    case 'gravel':
      return {
        costing: 'bicycle',
        options: {
          bicycle_type: p.surface === 'c' ? 'Mountain' : 'Cross',
          cycling_speed: s.speedGravel,
          use_roads: p.surface === 'a' ? 0.35 : p.surface === 'b' ? 0.1 : 0.05,
          use_hills,
          avoid_bad_surfaces: p.surface === 'a' ? 0.2 : 0,
          use_living_streets: 0.4,
          use_ferry: 0,
        },
      };
  }
}

export interface Waypoint {
  coord: LngLat;
  /** passage sans demi-tour (évite les allers-retours parasites) */
  through?: boolean;
  /**
   * Sens de marche imposé à cet endroit (cap en degrés, ±45°). Au départ, le sens dans lequel on part ;
   * à l'arrivée, celui dans lequel on arrive : la même valeur aux deux bouts d'une boucle la fait partir
   * d'un côté de la rue et revenir par l'autre.
   */
  heading?: number;
}

export interface Maneuver {
  names: string[];
  length: number;
}

export interface RouteResult {
  coords: LngLat[];
  profile: Profile;
  lengthM: number;
  maneuvers: Maneuver[];
}

interface VLeg {
  shape: string;
  elevation?: (number | null)[];
  maneuvers?: { street_names?: string[]; length?: number }[];
  summary: { length: number };
}
interface VTrip {
  legs: VLeg[];
  summary: { length: number };
}
interface VResponse {
  trip: VTrip;
  alternates?: { trip: VTrip }[];
}

function parseLegs(legs: VLeg[]): RouteResult {
  const coords: LngLat[] = [];
  const raw: (number | null)[] = [];
  const maneuvers: Maneuver[] = [];
  let length = 0;
  for (const leg of legs) {
    const pts = decodePolyline(leg.shape, 6);
    coords.push(...(coords.length ? pts.slice(1) : pts));
    const e = leg.elevation ?? [];
    raw.push(...(raw.length ? e.slice(1) : e));
    for (const m of leg.maneuvers ?? []) {
      maneuvers.push({ names: m.street_names ?? [], length: (m.length ?? 0) * 1000 });
    }
    length += leg.summary.length * 1000;
  }
  return {
    coords,
    profile: { step: ELEV_STEP, ele: cleanElevation(raw) },
    lengthM: length,
    maneuvers,
  };
}

const parseTrip = (trip: VTrip): RouteResult => parseLegs(trip.legs);

function location(p: Waypoint, type: string) {
  const loc: Record<string, unknown> = { lon: p.coord[0], lat: p.coord[1], type };
  if (p.heading != null) {
    loc.heading = Math.round(((p.heading % 360) + 360) % 360);
    loc.heading_tolerance = 45;
  }
  return loc;
}

function body(points: Waypoint[], breaks: Set<number>, c: Costing, avoid: LngLat[] = []): Record<string, unknown> {
  const b: Record<string, unknown> = {
    locations: points.map((p, i) => location(p, breaks.has(i) ? 'break' : p.through ? 'through' : 'via')),
    costing: c.costing,
    costing_options: { [c.costing]: c.options },
    elevation_interval: ELEV_STEP,
    directions_options: { units: 'kilometers', language: 'fr-FR', directions_type: 'maneuvers' },
  };
  if (avoid.length) b.exclude_locations = avoid.map(([lon, lat]) => ({ lon, lat }));
  return b;
}

export async function route(
  points: Waypoint[],
  c: Costing,
  signal?: AbortSignal,
  alternates = 0,
): Promise<RouteResult[]> {
  const b = body(points, new Set([0, points.length - 1]), c);
  if (alternates > 0) b.alternates = alternates;
  const d = await post<VResponse>('route', b, signal);
  const out = [parseTrip(d.trip)];
  for (const a of d.alternates ?? []) out.push(parseTrip(a.trip));
  return out;
}

/* ------------------------- Plusieurs itinéraires en une requête ------------------------- */

/**
 * Un itinéraire à calculer : ses points (le premier et le dernier sont des arrêts, les autres des
 * passages) et des tronçons à éviter. Plusieurs se calculent en une seule requête, à la suite :
 * le serveur ne compte qu'une requête, et chacun est rendu à part.
 */
export interface Job {
  points: Waypoint[];
  avoid?: LngLat[];
}

const sameStop = (a: Waypoint, b: Waypoint) => a.coord[0] === b.coord[0] && a.coord[1] === b.coord[1] && a.heading === b.heading;

/**
 * Enchaîne des itinéraires : quand l'un finit là où le suivant part (une boucle et la suivante), l'arrêt
 * est partagé ; sinon un trajet de liaison les relie (calculé puis ignoré).
 */
export function chainJobs(jobs: Job[]): { points: Waypoint[]; breaks: Set<number>; legOf: number[] } {
  const points: Waypoint[] = [];
  const breaks = new Set<number>();
  const legOf: number[] = [];
  jobs.forEach((j, idx) => {
    const pts = j.points;
    if (points.length && sameStop(points[points.length - 1], pts[0])) {
      points.push(...pts.slice(1));
    } else {
      if (points.length) legOf.push(-1);
      breaks.add(points.length);
      points.push(...pts);
    }
    breaks.add(points.length - 1);
    legOf.push(idx);
  });
  return { points, breaks, legOf };
}

/** Nombre de points d'une requête qui enchaîne ces itinéraires. */
export const chainSize = (jobs: Job[]) => chainJobs(jobs).points.length;

/**
 * Calcule plusieurs itinéraires en une requête (au plus 10 points en tout). Les tronçons à éviter
 * trop proches d'un point de la requête sont écartés : le serveur ne trouverait plus de chemin.
 */
export async function routeJobs(jobs: Job[], c: Costing, signal?: AbortSignal): Promise<RouteResult[]> {
  const { points, breaks, legOf } = chainJobs(jobs);
  if (points.length > MAX_LOCATIONS) throw new Error(`Trop de points (${points.length})`);
  const avoid: LngLat[] = [];
  for (const j of jobs) {
    for (const q of j.avoid ?? []) {
      if (avoid.length >= MAX_AVOID) break;
      if (points.some((p) => haversine(p.coord, q) < 120)) continue;
      if (avoid.some((a) => haversine(a, q) < 8)) continue;
      avoid.push(q);
    }
  }
  const d = await post<VResponse>('route', body(points, breaks, c, avoid), signal);
  const legs = d.trip.legs;
  if (legs.length !== legOf.length) throw new RoutingError('Réponse inattendue du service d’itinéraires.', null, 200);
  const out: RouteResult[] = [];
  legOf.forEach((job, i) => {
    if (job >= 0) out[job] = parseLegs([legs[i]]);
  });
  return out;
}

/* ------------------------- Suivre une forme dessinée ------------------------- */

/** Un morceau de chemin qui suit la forme, et la partie de la forme qu'il couvre (indices des points). */
export interface TracePiece {
  res: RouteResult;
  from: number;
  to: number;
}

interface VTraceTrip extends VTrip {
  locations?: { original_index?: number }[];
}

/**
 * Chemin praticable le plus proche d'une forme (« map matching ») : le serveur cherche, rue après rue, le
 * trajet qui colle le mieux à la suite de points. Là où rien ne passe près de la forme (un fleuve sans
 * pont, un grand terrain fermé), le chemin peut se couper en morceaux : ils sont rendus dans l'ordre de la
 * forme, à relier ensuite. Rayon de recherche au maximum permis par le serveur (100 m).
 */
export async function traceRoute(shape: LngLat[], c: Costing, signal?: AbortSignal, options: Record<string, number> = {}): Promise<TracePiece[]> {
  const d = await post<{ trip: VTraceTrip; alternates?: { trip: VTraceTrip }[] }>(
    'trace_route',
    {
      shape: shape.map(([lon, lat]) => ({ lon, lat })),
      costing: c.costing,
      costing_options: { [c.costing]: c.options },
      shape_match: 'map_snap',
      trace_options: { search_radius: 100, gps_accuracy: 50, breakage_distance: 3000, turn_penalty_factor: 300, ...options },
      elevation_interval: ELEV_STEP,
      directions_options: { units: 'kilometers', language: 'fr-FR', directions_type: 'maneuvers' },
    },
    signal,
  );
  const trips = [d.trip, ...(d.alternates ?? []).map((a) => a.trip)];
  const out: TracePiece[] = [];
  for (const t of trips) {
    const idx = (t.locations ?? []).map((l) => l.original_index).filter((x): x is number => typeof x === 'number');
    if (!idx.length || !t.legs?.length) continue;
    out.push({ res: parseTrip(t), from: Math.min(...idx), to: Math.max(...idx) });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Répartition des sols et part sur grands axes, d'après les tronçons réellement empruntés. */
export async function surfaceSplit(
  coords: LngLat[],
  c: Costing,
  signal?: AbortSignal,
): Promise<{ surface: SurfaceSplit; busy: number } | null> {
  const shape = simplify(coords, 2);
  type Edge = { surface?: string; road_class?: string; use?: string; length?: number };
  const d = await post<{ edges?: Edge[] }>(
    'trace_attributes',
    {
      encoded_polyline: encodePolyline(shape, 6),
      shape_match: 'walk_or_snap',
      costing: c.costing,
      costing_options: { [c.costing]: c.options },
      filters: { attributes: ['edge.surface', 'edge.road_class', 'edge.use', 'edge.length'], action: 'include' },
    },
    signal,
  );
  const edges = d.edges ?? [];
  let total = 0;
  const split: SurfaceSplit = { paved: 0, compacted: 0, dirt: 0 };
  let busy = 0;
  for (const e of edges) {
    const l = e.length ?? 0;
    total += l;
    const s = e.surface ?? '';
    if (s.startsWith('paved')) split.paved += l;
    else if (s === 'compacted' || s === 'gravel') split.compacted += l;
    else split.dirt += l;
    if (['motorway', 'trunk', 'primary', 'secondary'].includes(e.road_class ?? '') && (e.use ?? 'road') === 'road') busy += l;
  }
  if (total <= 0) return null;
  return {
    surface: { paved: split.paved / total, compacted: split.compacted / total, dirt: split.dirt / total },
    busy: busy / total,
  };
}

/** Altitudes de points quelconques (modèle de terrain du serveur). */
export async function heights(points: LngLat[], signal?: AbortSignal): Promise<number[]> {
  const d = await post<{ height?: (number | null)[] }>(
    'height',
    { shape: points.map(([lon, lat]) => ({ lat, lon })), range: false },
    signal,
  );
  return cleanElevation(d.height ?? []);
}
