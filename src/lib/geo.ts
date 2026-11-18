import type { LngLat } from './types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LngLat, b: LngLat): number {
  const dp = rad(b[1] - a[1]);
  const dl = rad(b[0] - a[0]);
  const x = Math.sin(dp / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function destination(p: LngLat, bearingDeg: number, dist: number): LngLat {
  const d = dist / R;
  const b = rad(bearingDeg);
  const p1 = rad(p[1]);
  const l1 = rad(p[0]);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [((deg(l2) + 540) % 360) - 180, deg(p2)];
}

export function bearing(a: LngLat, b: LngLat): number {
  const p1 = rad(a[1]);
  const p2 = rad(b[1]);
  const dl = rad(b[0] - a[0]);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Distances cumulées (m) pour chaque point. */
export function cumulative(coords: LngLat[]): Float64Array {
  const out = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) out[i] = out[i - 1] + haversine(coords[i - 1], coords[i]);
  return out;
}

/** Point situé à la distance s (m) le long du tracé. */
export function pointAt(coords: LngLat[], cum: Float64Array, s: number): { coord: LngLat; index: number; bearing: number } {
  const n = coords.length;
  if (n === 0) return { coord: [0, 0], index: 0, bearing: 0 };
  if (s <= 0 || n === 1) return { coord: coords[0], index: 0, bearing: n > 1 ? bearing(coords[0], coords[1]) : 0 };
  const total = cum[n - 1];
  if (s >= total) return { coord: coords[n - 1], index: n - 1, bearing: bearing(coords[n - 2], coords[n - 1]) };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (s - cum[lo]) / seg : 0;
  const a = coords[lo];
  const b = coords[hi];
  return { coord: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: lo, bearing: bearing(a, b) };
}

/** Points régulièrement espacés (pas en m). */
export function resample(coords: LngLat[], step: number): LngLat[] {
  if (coords.length < 2) return coords.slice();
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  const out: LngLat[] = [];
  for (let s = 0; s <= total; s += step) out.push(pointAt(coords, cum, s).coord);
  out.push(coords[coords.length - 1]);
  return out;
}

export function decodePolyline(str: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const out: LngLat[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < str.length) {
    for (let k = 0; k < 2; k++) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 31) << shift;
        shift += 5;
      } while (b >= 32);
      const v = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += v;
      else lon += v;
    }
    out.push([lon / factor, lat / factor]);
  }
  return out;
}

export function encodePolyline(coords: LngLat[], precision = 6): string {
  const factor = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (x >= 0x20) {
      s += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
      x >>= 5;
    }
    return s + String.fromCharCode(x + 63);
  };
  for (const [lon, lat] of coords) {
    const iLat = Math.round(lat * factor);
    const iLon = Math.round(lon * factor);
    out += enc(iLat - pLat) + enc(iLon - pLon);
    pLat = iLat;
    pLon = iLon;
  }
  return out;
}

export type BBox = [number, number, number, number];

export function bbox(coords: LngLat[]): BBox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** Projection locale en mètres autour d'une origine (équirectangulaire, suffisante à l'échelle d'un parcours). */
export function localProjector(origin: LngLat) {
  const kx = 111320 * Math.cos(rad(origin[1]));
  const ky = 110540;
  return {
    to: (p: LngLat): [number, number] => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky],
    from: (x: number, y: number): LngLat => [origin[0] + x / kx, origin[1] + y / ky],
  };
}

/** Projection d'un point sur le tracé : distance le long du tracé et écart latéral. */
export function nearestOnRoute(
  coords: LngLat[],
  cum: Float64Array,
  p: LngLat,
  from = 0,
  to = coords.length - 1,
): { s: number; dist: number; index: number } {
  const proj = localProjector(p);
  let best = { s: 0, dist: Infinity, index: 0 };
  const a0 = Math.max(0, from);
  const b0 = Math.min(coords.length - 1, to);
  for (let i = a0; i < b0; i++) {
    const [ax, ay] = proj.to(coords[i]);
    const [bx, by] = proj.to(coords[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const d = Math.hypot(qx, qy);
    if (d < best.dist) best = { s: cum[i] + (cum[i + 1] - cum[i]) * t, dist: d, index: i };
  }
  return best;
}

/** Simplification Douglas-Peucker (tolérance en mètres). */
export function simplify(coords: LngLat[], tolerance: number): LngLat[] {
  if (coords.length < 3) return coords.slice();
  const proj = localProjector(coords[0]);
  const pts = coords.map((c) => proj.to(c));
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = len > 0 ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > 0 && maxD > tolerance) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/**
 * Part du tracé qui repasse par un endroit déjà parcouru (plus de 250 m avant).
 * Sert à repérer les allers-retours parasites dans une boucle.
 */
export function overlapRatio(coords: LngLat[]): number {
  if (coords.length < 2) return 0;
  const proj = localProjector(coords[0]);
  const cell = 16;
  const grid = new Map<string, number>();
  let total = 0;
  let repeated = 0;
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = proj.to(coords[i - 1]);
    const [bx, by] = proj.to(coords[i]);
    const seg = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(seg / 20));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const s = acc + seg * t;
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      let hit = false;
      for (let dx = -1; dx <= 1 && !hit; dx++) {
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          const first = grid.get(`${cx + dx}:${cy + dy}`);
          if (first !== undefined && s - first > 250) hit = true;
        }
      }
      total++;
      if (hit) repeated++;
      const key = `${cx}:${cy}`;
      if (!grid.has(key)) grid.set(key, s);
    }
    acc += seg;
  }
  return total ? repeated / total : 0;
}

/** Ressemblance entre deux tracés (part des cellules communes), de 0 à 1. */
export function similarity(a: LngLat[], b: LngLat[]): number {
  if (!a.length || !b.length) return 0;
  const proj = localProjector(a[0]);
  const cells = (cs: LngLat[]) => {
    const set = new Set<string>();
    for (const p of resample(cs, 40)) {
      const [x, y] = proj.to(p);
      set.add(`${Math.floor(x / 60)}:${Math.floor(y / 60)}`);
    }
    return set;
  };
  const sa = cells(a);
  const sb = cells(b);
  let common = 0;
  for (const k of sa) if (sb.has(k)) common++;
  return common / Math.min(sa.size, sb.size);
}

const CARDINALS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
export function cardinal(bearingDeg: number): string {
  return CARDINALS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8];
}
