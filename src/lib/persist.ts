import type { EnvSplit, LngLat, Params, Route, Settings, Shape, Sport, SurfaceSplit } from './types';
import { cumulative, decodePolyline, encodePolyline, simplify } from './geo';
import { decimateProfile, eleAt, elevationStats } from './elevation';
import { estimateDuration, SPORTS } from './sports';

/* ---------------- Format compact commun à la bibliothèque et aux liens de partage ---------------- */

export interface SerialRoute {
  v: 1;
  id: string;
  n: string;
  s: Sport;
  h: Shape;
  /** polyligne encodée */
  p: string;
  /** précision de la polyligne */
  q: 5 | 6;
  /** pas du profil (m) et altitudes */
  es: number;
  e: number[];
  env: EnvSplit;
  surf: SurfaceSplit | null;
  busy: number | null;
  w: LngLat[];
  t: number;
  pr?: Params;
}

export function serialize(r: Route, compact = false): SerialRoute {
  const coords = compact ? simplify(r.coords, 3) : r.coords;
  const prof = decimateProfile(r.profile, r.lengthM, compact ? 260 : 600);
  return {
    v: 1,
    id: r.id,
    n: r.name,
    s: r.sport,
    h: r.shape,
    p: encodePolyline(coords, compact ? 5 : 6),
    q: compact ? 5 : 6,
    es: Math.round(prof.step * 100) / 100,
    e: prof.ele.map((x) => Math.round(x)),
    env: round(r.env),
    surf: r.surface ? (round(r.surface as unknown as Record<string, number>) as unknown as SurfaceSplit) : null,
    busy: r.busy != null ? Math.round(r.busy * 1000) / 1000 : null,
    w: r.waterPoints.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]),
    t: r.createdAt,
    pr: compact ? undefined : r.params,
  };
}

function round<T extends Record<string, number | undefined>>(o: T): T {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'number') out[k] = Math.round(v * 1000) / 1000;
  return out as T;
}

export function deserialize(s: SerialRoute, settings: Settings): Route {
  const coords = decodePolyline(s.p, s.q);
  const cum = cumulative(coords);
  const lengthM = cum[cum.length - 1] ?? 0;
  const profile = { step: s.es, ele: s.e };
  const st = elevationStats(profile);
  return {
    id: s.id,
    name: s.n,
    sport: s.s,
    shape: s.h,
    coords,
    profile,
    lengthM,
    ascent: st.ascent,
    descent: st.descent,
    minEle: st.minEle,
    maxEle: st.maxEle,
    maxGrade: st.maxGrade,
    env: s.env ?? {},
    surface: s.surf,
    busy: s.busy,
    overlap: 0,
    waterPoints: s.w ?? [],
    durationS: estimateDuration(s.s, lengthM, st.ascent, settings),
    params: s.pr,
    createdAt: s.t,
  };
}

/* ---------------------------------- Bibliothèque ---------------------------------- */

/** Une sortie faite : suivie en direct (mesurée) ou marquée à la main. */
export interface HistoryEntry {
  id: string;
  /** début de la sortie */
  date: number;
  /** durée mesurée pendant le suivi, null si ajoutée à la main */
  durationS: number | null;
  distanceM: number;
  complete: boolean;
  source: 'follow' | 'manual';
  /** copie du parcours, gardée même s'il n'est pas en favori */
  route: SerialRoute;
}

const HIST_KEY = 'boucle.historique.v1';
export function loadHistory(): HistoryEntry[] {
  const list = readJSON<HistoryEntry[]>(HIST_KEY, []);
  return Array.isArray(list) ? list.filter((x) => x && typeof x.date === 'number' && x.route?.v === 1) : [];
}
export function saveHistory(list: HistoryEntry[]): boolean {
  return writeJSON(HIST_KEY, list);
}

const FLAG_KEY = 'boucle.indicateurs.v1';
export function loadFlags(): Record<string, boolean> {
  return readJSON<Record<string, boolean>>(FLAG_KEY, {});
}
export function saveFlag(name: string, value: boolean) {
  writeJSON(FLAG_KEY, { ...loadFlags(), [name]: value });
}

const LIB_KEY = 'boucle.bibliotheque.v1';
const SETTINGS_KEY = 'boucle.reglages.v1';
const LAST_KEY = 'boucle.dernier.v1';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function loadLibrary(): SerialRoute[] {
  const list = readJSON<SerialRoute[]>(LIB_KEY, []);
  return Array.isArray(list) ? list.filter((x) => x && x.v === 1 && typeof x.p === 'string') : [];
}
export function saveLibrary(list: SerialRoute[]): boolean {
  return writeJSON(LIB_KEY, list);
}

type SavedPlace = { name: string; detail?: string; coord: LngLat; kind: 'gps' | 'search' | 'map' };
export interface LastSession {
  params?: Params;
  start?: SavedPlace;
  destination?: SavedPlace;
  view?: { center: LngLat; zoom: number };
}
export function loadLast(): LastSession {
  return readJSON<LastSession>(LAST_KEY, {});
}
export function saveLast(v: LastSession) {
  writeJSON(LAST_KEY, v);
}
export function loadSettings<T>(fallback: T): T {
  return { ...fallback, ...readJSON<Partial<T>>(SETTINGS_KEY, {}) };
}
export function saveSettings(v: unknown) {
  writeJSON(SETTINGS_KEY, v);
}

/* ------------------------------------ Partage ------------------------------------ */

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  const buf = await new Response(blob.stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buf);
}

export async function packRoute(r: Route): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(serialize(r, true)));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toBase64Url(await transform(json, new CompressionStream('deflate-raw')));
    } catch {
      /* repli sans compression */
    }
  }
  return 'u' + toBase64Url(json);
}

export async function unpackRoute(s: string, settings: Settings): Promise<Route> {
  const kind = s[0];
  let bytes = fromBase64Url(s.slice(1));
  if (kind === 'z') bytes = await transform(bytes, new DecompressionStream('deflate-raw'));
  const obj = JSON.parse(new TextDecoder().decode(bytes)) as SerialRoute;
  if (obj.v !== 1 || !SPORTS[obj.s]) throw new Error('format');
  return deserialize(obj, settings);
}

/* -------------------------------------- GPX -------------------------------------- */

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function toGPX(r: Route): string {
  const cum = cumulative(r.coords);
  const pts = r.coords
    .map((c, i) => `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}"><ele>${eleAt(r.profile, cum[i]).toFixed(1)}</ele></trkpt>`)
    .join('\n');
  const wpts = r.waterPoints
    .map((w) => `  <wpt lat="${w[1].toFixed(6)}" lon="${w[0].toFixed(6)}"><name>Point d’eau</name><sym>Drinking Water</sym></wpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Boucle" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(r.name)}</name>
    <time>${new Date(r.createdAt).toISOString()}</time>
  </metadata>
${wpts ? wpts + '\n' : ''}  <trk>
    <name>${esc(r.name)}</name>
    <type>${SPORTS[r.sport].gpxType}</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

export interface ParsedGPX {
  name: string;
  coords: LngLat[];
  ele: (number | null)[];
}

export function parseGPX(text: string): ParsedGPX | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  const nodes = [...doc.querySelectorAll('trkpt')];
  const pts = nodes.length ? nodes : [...doc.querySelectorAll('rtept')];
  if (pts.length < 2) return null;
  const coords: LngLat[] = [];
  const ele: (number | null)[] = [];
  for (const n of pts) {
    const lat = parseFloat(n.getAttribute('lat') ?? '');
    const lon = parseFloat(n.getAttribute('lon') ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    coords.push([lon, lat]);
    const e = n.querySelector('ele')?.textContent;
    ele.push(e != null && e !== '' ? parseFloat(e) : null);
  }
  const name = doc.querySelector('trk > name, rte > name, metadata > name')?.textContent?.trim() || 'Parcours importé';
  return coords.length >= 2 ? { name, coords, ele } : null;
}
