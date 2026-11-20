import type { LngLat } from './types';

/*
 * Relief lu directement dans les tuiles d'altitude de la carte 3D (Terrarium, AWS Open Data) :
 * gratuites, mises en cache par l'app, et lues sur l'appareil. Sert à choisir les directions qui
 * offrent le dénivelé demandé, sans requête au service d'itinéraires.
 */

export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export interface Terrain {
  /** altitude en mètres, ou null hors de la zone chargée */
  heightAt(p: LngLat): number | null;
}

const SIZE = 256;
const cache = new Map<string, Promise<Float32Array | null>>();

function decode(img: ImageData): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  const d = img.data;
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
  return out;
}

function loadTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  let p = cache.get(key);
  if (!p) {
    const url = DEM_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    p = fetch(url, { signal })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b) : null))
      .then((bmp) => {
        if (!bmp) return null;
        const canvas = new OffscreenCanvas(SIZE, SIZE);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(bmp, 0, 0);
        return decode(ctx.getImageData(0, 0, SIZE, SIZE));
      })
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, p);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return p;
}

const lonToX = (lon: number) => (lon + 180) / 360;
const latToY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

/** Le relief autour d'un point, à une résolution adaptée à la zone (au plus 9 tuiles). */
export async function loadTerrain(center: LngLat, radiusM: number, signal?: AbortSignal): Promise<Terrain | null> {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  const lat = center[1];
  const world = 40075016.686 * Math.cos((lat * Math.PI) / 180);
  const half = radiusM / world;
  const cx = lonToX(center[0]);
  const cy = latToY(lat);
  let z = 12;
  const count = (zz: number) => {
    const n = 2 ** zz;
    return (Math.floor((cx + half) * n) - Math.floor((cx - half) * n) + 1) * (Math.floor((cy + half) * n) - Math.floor((cy - half) * n) + 1);
  };
  while (z > 7 && count(z) > 9) z--;
  const n = 2 ** z;
  const x0 = Math.floor((cx - half) * n);
  const x1 = Math.floor((cx + half) * n);
  const y0 = Math.floor((cy - half) * n);
  const y1 = Math.floor((cy + half) * n);
  const tiles = new Map<string, Float32Array>();
  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push(
        loadTile(z, x, y, signal).then((t) => {
          if (t) tiles.set(`${x}/${y}`, t);
        }),
      );
    }
  }
  await Promise.all(jobs);
  if (!tiles.size) return null;
  const px = (v: number) => v * n * SIZE;
  const at = (gx: number, gy: number): number | null => {
    const tx = Math.floor(gx / SIZE);
    const ty = Math.floor(gy / SIZE);
    const t = tiles.get(`${tx}/${ty}`);
    if (!t) return null;
    const ix = Math.min(SIZE - 1, Math.max(0, Math.floor(gx - tx * SIZE)));
    const iy = Math.min(SIZE - 1, Math.max(0, Math.floor(gy - ty * SIZE)));
    return t[iy * SIZE + ix];
  };
  return {
    heightAt([lon, la]) {
      const gx = px(lonToX(lon)) - 0.5;
      const gy = px(latToY(la)) - 0.5;
      const fx = Math.floor(gx);
      const fy = Math.floor(gy);
      const a = at(fx, fy);
      const b = at(fx + 1, fy);
      const c = at(fx, fy + 1);
      const d = at(fx + 1, fy + 1);
      if (a == null || b == null || c == null || d == null) return a ?? b ?? c ?? d ?? null;
      const tx = gx - fx;
      const ty = gy - fy;
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    },
  };
}
