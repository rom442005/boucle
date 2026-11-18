import type { LngLat, Params, Profile, Settings, SurfaceSplit } from './types';
import { decodePolyline, encodePolyline, simplify } from './geo';
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

/* Serveur public partagé : deux requêtes à la fois au plus, espacées, avec reprise sur saturation. */
let active = 0;
let lastStart = 0;
const queue: (() => void)[] = [];
const MAX_ACTIVE = 2;
const MIN_GAP = 90;

async function slot(): Promise<void> {
  if (active >= MAX_ACTIVE) await new Promise<void>((res) => queue.push(res));
  active++;
  const wait = lastStart + MIN_GAP - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastStart = Date.now();
}
function release() {
  active--;
  queue.shift()?.();
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let attempt = 0;
  for (;;) {
    await slot();
    let res: Response;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      release();
      if (signal?.aborted) throw e;
      if (attempt++ < 2) {
        await new Promise((r) => setTimeout(r, 700 * 2 ** attempt));
        continue;
      }
      throw new RoutingError('Le service d’itinéraires ne répond pas.', null, 0);
    }
    release();
    if (res.ok) return (await res.json()) as T;
    if ([429, 502, 503, 504].includes(res.status) && attempt++ < 2) {
      await new Promise((r) => setTimeout(r, 900 * 2 ** attempt));
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

function parseTrip(trip: VTrip): RouteResult {
  const coords: LngLat[] = [];
  const raw: (number | null)[] = [];
  const maneuvers: Maneuver[] = [];
  for (const leg of trip.legs) {
    const pts = decodePolyline(leg.shape, 6);
    coords.push(...(coords.length ? pts.slice(1) : pts));
    const e = leg.elevation ?? [];
    raw.push(...(raw.length ? e.slice(1) : e));
    for (const m of leg.maneuvers ?? []) {
      maneuvers.push({ names: m.street_names ?? [], length: (m.length ?? 0) * 1000 });
    }
  }
  return {
    coords,
    profile: { step: ELEV_STEP, ele: cleanElevation(raw) },
    lengthM: trip.summary.length * 1000,
    maneuvers,
  };
}

export async function route(
  points: Waypoint[],
  c: Costing,
  signal?: AbortSignal,
  alternates = 0,
): Promise<RouteResult[]> {
  const last = points.length - 1;
  const body: Record<string, unknown> = {
    locations: points.map((p, i) => ({
      lon: p.coord[0],
      lat: p.coord[1],
      type: i === 0 || i === last ? 'break' : p.through ? 'through' : 'via',
    })),
    costing: c.costing,
    costing_options: { [c.costing]: c.options },
    elevation_interval: ELEV_STEP,
    directions_options: { units: 'kilometers', language: 'fr-FR', directions_type: 'maneuvers' },
  };
  if (alternates > 0) body.alternates = alternates;
  const d = await post<VResponse>('route', body, signal);
  const out = [parseTrip(d.trip)];
  for (const a of d.alternates ?? []) out.push(parseTrip(a.trip));
  return out;
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
