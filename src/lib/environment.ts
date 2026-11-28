import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { EnvClass, EnvSplit, EnvZone, LngLat } from './types';
import { localProjector, resample } from './geo';

/*
 * Lecture du milieu traversé à partir des tuiles vectorielles OpenFreeMap (schéma OpenMapTiles) :
 * on dessine forêts, eau, parcs, campagne et ville dans une petite image autour du départ,
 * puis on lit cette image le long des tracés et pour orienter les points de passage.
 */

const TILEJSON = 'https://tiles.openfreemap.org/planet';
let templatePromise: Promise<string> | null = null;
function tileTemplate(): Promise<string> {
  templatePromise ??= fetch(TILEJSON)
    .then((r) => r.json())
    .then((j: { tiles: string[] }) => j.tiles[0])
    .catch((e) => {
      templatePromise = null;
      throw e;
    });
  return templatePromise;
}

const tileCache = new Map<string, Promise<VectorTile | null>>();
export function loadTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<VectorTile | null> {
  const key = `${z}/${x}/${y}`;
  let p = tileCache.get(key);
  if (!p) {
    p = tileTemplate()
      .then((t) => fetch(t.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { signal }))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => (buf ? new VectorTile(new PbfReader(new Uint8Array(buf))) : null))
      .catch(() => {
        tileCache.delete(key);
        return null;
      });
    tileCache.set(key, p);
    if (tileCache.size > 300) tileCache.delete(tileCache.keys().next().value!);
  }
  return p;
}

export const lonToX = (lon: number) => (lon + 180) / 360;
export const latToY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
export const xToLon = (x: number) => x * 360 - 180;
export const yToLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export const ENV_PRIORITY: EnvClass[] = ['water', 'forest', 'park', 'fields', 'urban'];

export interface EnvRaster {
  size: number;
  /** mètres par pixel */
  mpp: number;
  masks: Record<EnvClass, Uint8Array>;
  /** chemins, pistes et voies non revêtues (null si les tuiles utilisées ne les contiennent pas) */
  tracks: Uint8Array | null;
  toPixel(p: LngLat): [number, number];
  fromPixel(px: number, py: number): LngLat;
}

const FOREST = new Set(['wood', 'forest']);
const PARK = new Set(['park', 'recreation_ground', 'village_green', 'garden', 'golf_course', 'dog_park', 'cemetery']);
const FIELDS = new Set(['farmland', 'farm', 'orchard', 'vineyard', 'meadow', 'grassland', 'heath', 'scrub', 'allotments', 'plant_nursery', 'fell']);
const URBAN = new Set(['residential', 'commercial', 'industrial', 'retail', 'garages', 'railway']);
const WATERWAYS = new Set(['river', 'canal', 'stream']);

function makeCanvas(size: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

export async function buildEnvRaster(center: LngLat, radiusM: number, signal?: AbortSignal, detail = false): Promise<EnvRaster | null> {
  const size = radiusM > 6000 ? 768 : 512;
  const lat = center[1];
  // Étendue carrée en Mercator autour du centre.
  const metersPerWorld = 40075016.686 * Math.cos((lat * Math.PI) / 180);
  const half = radiusM / metersPerWorld;
  const cx = lonToX(center[0]);
  const cy = latToY(lat);
  const X0 = cx - half;
  const Y0 = cy - half;
  const span = half * 2;
  // Niveau de zoom : environ trois tuiles de large, entre 10 et 13. Quand on cherche les chemins,
  // on monte au plus haut niveau qui tient en 20 tuiles (les chemins n'existent qu'à partir du niveau 12).
  const count = (zz: number) => {
    const nn = 2 ** zz;
    return (Math.floor((X0 + span) * nn) - Math.floor(X0 * nn) + 1) * (Math.floor((Y0 + span) * nn) - Math.floor(Y0 * nn) + 1);
  };
  let z = Math.max(10, Math.min(13, Math.floor(Math.log2(3 / span))));
  if (detail) {
    for (let zz = 13; zz > z; zz--) {
      if (count(zz) <= 20) {
        z = zz;
        break;
      }
    }
  }
  const n = 2 ** z;
  const tx0 = Math.floor(X0 * n);
  const tx1 = Math.floor((X0 + span) * n);
  const ty0 = Math.floor(Y0 * n);
  const ty1 = Math.floor((Y0 + span) * n);
  const jobs: Promise<[number, number, VectorTile | null]>[] = [];
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) jobs.push(loadTile(z, x, y, signal).then((t) => [x, y, t]));
  const tiles = await Promise.all(jobs);
  if (!tiles.some(([, , t]) => t)) return null;

  const canvasA = makeCanvas(size);
  const canvasB = makeCanvas(size);
  const a = canvasA.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  const b = canvasB.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!a || !b) return null;
  for (const ctx of [a, b]) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }
  const mpp = (span * metersPerWorld) / size;
  const shoreBuffer = Math.max(2, 45 / mpp);
  const trackWidth = Math.max(1.6, 24 / mpp);
  const hasTracks = z >= 12;

  for (const [x, y, tile] of tiles) {
    if (!tile) continue;
    const toCanvas = (extent: number) => (px: number, py: number): [number, number] => [
      (((x + px / extent) / n - X0) / span) * size,
      (((y + py / extent) / n - Y0) / span) * size,
    ];
    const pathOf = (ctx: CanvasRenderingContext2D, rings: { x: number; y: number }[][], tr: (a: number, b: number) => [number, number]) => {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach((p, i) => {
          const [u, v] = tr(p.x, p.y);
          if (i === 0) ctx.moveTo(u, v);
          else ctx.lineTo(u, v);
        });
      }
    };
    const each = (layerName: string, fn: (props: Record<string, unknown>, rings: { x: number; y: number }[][], type: number, tr: (a: number, b: number) => [number, number]) => void) => {
      const layer = tile.layers[layerName];
      if (!layer) return;
      const tr = toCanvas(layer.extent);
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        fn(f.properties, f.loadGeometry(), f.type, tr);
      }
    };

    each('landcover', (props, rings, type, tr) => {
      if (type !== 3) return;
      const cls = String(props.class ?? '');
      const sub = String(props.subclass ?? '');
      if (cls === 'wood' || FOREST.has(sub)) {
        a.fillStyle = '#ff0000';
      } else if (PARK.has(sub)) {
        a.fillStyle = '#0000ff';
      } else if (cls === 'farmland' || FIELDS.has(sub)) {
        pathOf(b, rings, tr);
        b.fillStyle = '#ff0000';
        b.fill('evenodd');
        return;
      } else return;
      pathOf(a, rings, tr);
      a.fill('evenodd');
    });
    each('landuse', (props, rings, type, tr) => {
      if (type !== 3) return;
      const cls = String(props.class ?? '');
      if (cls === 'cemetery') {
        pathOf(a, rings, tr);
        a.fillStyle = '#0000ff';
        a.fill('evenodd');
      } else if (URBAN.has(cls)) {
        pathOf(b, rings, tr);
        b.fillStyle = '#00ff00';
        b.fill('evenodd');
      }
    });
    each('building', (_props, rings, type, tr) => {
      if (type !== 3) return;
      pathOf(b, rings, tr);
      b.fillStyle = '#00ff00';
      b.fill('evenodd');
    });
    each('water', (props, rings, type, tr) => {
      if (type !== 3 || props.class === 'swimming_pool' || props.brunnel === 'tunnel') return;
      pathOf(a, rings, tr);
      a.fillStyle = '#00ff00';
      a.fill('evenodd');
      a.strokeStyle = '#00ff00';
      a.lineWidth = shoreBuffer * 2;
      a.stroke();
    });
    if (hasTracks) {
      each('transportation', (props, rings, type, tr) => {
        if (type !== 2 || props.brunnel === 'tunnel') return;
        const cls = String(props.class ?? '');
        const unpaved = props.surface === 'unpaved';
        if (!(cls === 'track' || (cls === 'path' && props.surface !== 'paved') || (unpaved && cls !== 'motorway'))) return;
        if (props.subclass === 'steps') return;
        pathOf(b, rings, tr);
        b.strokeStyle = '#0000ff';
        b.lineWidth = trackWidth;
        b.stroke();
      });
    }
    each('waterway', (props, rings, type, tr) => {
      if (type !== 2 || !WATERWAYS.has(String(props.class ?? '')) || props.brunnel === 'tunnel') return;
      pathOf(a, rings, tr);
      a.strokeStyle = '#00ff00';
      a.lineWidth = shoreBuffer * 2 * (props.class === 'stream' ? 0.6 : 1);
      a.stroke();
    });
  }

  const da = a.getImageData(0, 0, size, size).data;
  const db = b.getImageData(0, 0, size, size).data;
  const N = size * size;
  const masks: Record<EnvClass, Uint8Array> = {
    forest: new Uint8Array(N),
    water: new Uint8Array(N),
    park: new Uint8Array(N),
    fields: new Uint8Array(N),
    urban: new Uint8Array(N),
  };
  const tracks = hasTracks ? new Uint8Array(N) : null;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    masks.forest[i] = da[o] > 110 ? 1 : 0;
    masks.water[i] = da[o + 1] > 110 ? 1 : 0;
    masks.park[i] = da[o + 2] > 110 ? 1 : 0;
    masks.fields[i] = db[o] > 110 ? 1 : 0;
    masks.urban[i] = db[o + 1] > 110 ? 1 : 0;
    if (tracks) tracks[i] = db[o + 2] > 90 ? 1 : 0;
  }
  return {
    size,
    mpp,
    masks,
    tracks,
    toPixel: (p) => [((lonToX(p[0]) - X0) / span) * size, ((latToY(p[1]) - Y0) / span) * size],
    fromPixel: (px, py) => [xToLon(X0 + (px / size) * span), yToLat(Y0 + (py / size) * span)],
  };
}

function classify(r: EnvRaster, p: LngLat): EnvClass | 'other' {
  const [x, y] = r.toPixel(p);
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= r.size || iy >= r.size) return 'other';
  const i = iy * r.size + ix;
  for (const c of ENV_PRIORITY) if (r.masks[c][i]) return c;
  return 'other';
}

/** Répartition du tracé par milieu (parts de 0 à 1). */
export function envSplit(r: EnvRaster | null, coords: LngLat[]): EnvSplit {
  if (!r || coords.length < 2) return {};
  const pts = resample(coords, 25);
  const out: EnvSplit = {};
  for (const p of pts) {
    const c = classify(r, p);
    out[c] = (out[c] ?? 0) + 1;
  }
  for (const k of Object.keys(out) as (EnvClass | 'other')[]) out[k] = out[k]! / pts.length;
  return out;
}

/** Part du tracé sur chemins et voies non revêtues, ou null si inconnue. */
export function trackShare(r: EnvRaster | null, coords: LngLat[]): number | null {
  if (!r?.tracks || coords.length < 2) return null;
  const pts = resample(coords, 25);
  let on = 0;
  for (const p of pts) {
    const [x, y] = r.toPixel(p);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix >= 0 && iy >= 0 && ix < r.size && iy < r.size && r.tracks[iy * r.size + ix]) on++;
  }
  return on / pts.length;
}

/**
 * Les tronçons du tracé dans les milieux demandés, en mètres depuis le départ. Les petites coupures (moins de
 * 60 m, une rue à traverser) sont recousues ; les bouts de moins de 150 m sont laissés de côté.
 */
export function envZones(r: EnvRaster | null, coords: LngLat[], wanted: EnvClass[], step = 25): EnvZone[] {
  if (!r || coords.length < 2 || !wanted.length) return [];
  const pts = resample(coords, step);
  const out: EnvZone[] = [];
  let cur: EnvZone | null = null;
  for (let i = 0; i < pts.length; i++) {
    const c = classify(r, pts[i]);
    const s = i * step;
    if (c !== 'other' && wanted.includes(c)) {
      if (cur && cur.c === c && s - cur.b <= 60) cur.b = s;
      else {
        if (cur) out.push(cur);
        cur = { c, a: s, b: s };
      }
    }
  }
  if (cur) out.push(cur);
  return out.filter((z) => z.b - z.a >= 150);
}

export function envShare(split: EnvSplit, wanted: EnvClass[]): number {
  return wanted.reduce((s, c) => s + (split[c] ?? 0), 0);
}

/** Carte d'attrait (0 à 1) pour les milieux demandés, floutée pour donner une densité. */
export interface Desirability {
  raster: EnvRaster;
  values: Float32Array;
}

export function desirability(r: EnvRaster, wanted: EnvClass[], tracksWeight = 0): Desirability | null {
  const useTracks = tracksWeight > 0 && !!r.tracks;
  if (!wanted.length && !useTracks) return null;
  const N = r.size * r.size;
  let v: Float32Array = new Float32Array(N);
  for (const c of wanted) {
    const m = r.masks[c];
    for (let i = 0; i < N; i++) if (m[i]) v[i] = 1;
  }
  if (useTracks) {
    const t = r.tracks!;
    // Sur un chemin : 1 si aucun milieu n'est demandé, sinon un attrait partiel hors du milieu demandé.
    for (let i = 0; i < N; i++) if (t[i]) v[i] = wanted.length ? Math.max(v[i], tracksWeight * 0.7) : 1;
  }
  const radius = Math.max(1, Math.round(110 / r.mpp));
  v = boxBlur(v, r.size, radius);
  v = boxBlur(v, r.size, radius);
  return { raster: r, values: v };
}

function boxBlur(src: Float32Array, size: number, rad: number): Float32Array {
  const tmp: Float32Array = new Float32Array(src.length);
  const out: Float32Array = new Float32Array(src.length);
  const w = rad * 2 + 1;
  for (let y = 0; y < size; y++) {
    let acc = 0;
    const row = y * size;
    for (let x = -rad; x <= rad; x++) acc += src[row + Math.min(size - 1, Math.max(0, x))];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc / w;
      acc += src[row + Math.min(size - 1, x + rad + 1)] - src[row + Math.max(0, x - rad)];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(size - 1, Math.max(0, y)) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc / w;
      acc += tmp[Math.min(size - 1, y + rad + 1) * size + x] - tmp[Math.max(0, y - rad) * size + x];
    }
  }
  return out;
}

export function desirabilityAt(d: Desirability, p: LngLat): number {
  const [x, y] = d.raster.toPixel(p);
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const s = d.raster.size;
  if (ix < 0 || iy < 0 || ix >= s || iy >= s) return 0;
  return d.values[iy * s + ix];
}

export function meanDesirability(d: Desirability, pts: LngLat[]): number {
  if (!pts.length) return 0;
  return pts.reduce((s, p) => s + desirabilityAt(d, p), 0) / pts.length;
}

/** Déplace un point de passage vers le milieu demandé le plus proche (au plus maxShift m). */
export function pullToward(d: Desirability, p: LngLat, maxShift: number): LngLat {
  const proj = localProjector(p);
  let best = p;
  let bestScore = desirabilityAt(d, p);
  if (bestScore > 0.6) return p;
  for (let ring = 1; ring <= 5; ring++) {
    const rr = (maxShift * ring) / 5;
    const steps = 8 + ring * 4;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const q = proj.from(Math.cos(a) * rr, Math.sin(a) * rr);
      const score = desirabilityAt(d, q) - 0.22 * (rr / maxShift);
      if (score > bestScore + 0.04) {
        bestScore = score;
        best = q;
      }
    }
  }
  return best;
}
