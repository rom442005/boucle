import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { LngLat, Route } from './types';
import { cumulative, destination, pointAt } from './geo';
import { gradeClass, grades, RAMP, reverseProfile } from './elevation';
import { SPORTS } from './sports';

export const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface Seg {
  coords: LngLat[];
  color: string;
  /** distance de départ du tronçon (m) */
  from: number;
  to: number;
}

export interface SlopeRun {
  /** classe de pente (indice dans RAMP) */
  c: number;
  a: number;
  b: number;
}

/**
 * Tronçons de même classe de pente (montées seulement), les tronçons de moins de 80 m étant fusionnés.
 * Partagé par la carte et le profil pour que les deux montrent exactement les mêmes couleurs.
 */
export function slopeRuns(r: Pick<Route, 'profile' | 'lengthM'>): SlopeRun[] {
  const g = grades(r.profile);
  const step = r.profile.step;
  const n = g.length;
  const runs: SlopeRun[] = [];
  for (let k = 0; k < n; k++) {
    const c = gradeClass(Math.max(0, g[k]));
    const last = runs[runs.length - 1];
    if (last && last.c === c) last.b = (k + 1) * step;
    else runs.push({ c, a: k * step, b: (k + 1) * step });
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < runs.length; i++) {
      const rr = runs[i];
      if (rr.b - rr.a < 80 && runs.length > 1) {
        const prev = runs[i - 1];
        const next = runs[i + 1];
        const target = prev && next ? (prev.b - prev.a >= next.b - next.a ? prev : next) : (prev ?? next);
        target.a = Math.min(target.a, rr.a);
        target.b = Math.max(target.b, rr.b);
        runs.splice(i, 1);
        i--;
      }
    }
    for (let i = 1; i < runs.length; i++) {
      if (runs[i].c === runs[i - 1].c) {
        runs[i - 1].b = runs[i].b;
        runs.splice(i, 1);
        i--;
      }
    }
  }
  if (!runs.length) runs.push({ c: 0, a: 0, b: r.lengthM });
  runs[runs.length - 1].b = Math.max(runs[runs.length - 1].b, r.lengthM);
  for (const rr of runs) rr.b = Math.min(rr.b, r.lengthM);
  return runs;
}

/** Découpe le tracé en tronçons colorés selon la pente. */
export function slopeSegments(r: Route): Seg[] {
  const cum = cumulative(r.coords);
  const total = cum[cum.length - 1];
  const runs = slopeRuns({ profile: r.profile, lengthM: total });
  const segs: Seg[] = [];
  let i = 0;
  for (const rr of runs) {
    const pts: LngLat[] = [pointAt(r.coords, cum, rr.a).coord];
    while (i < r.coords.length && cum[i] <= rr.a) i++;
    let j = i;
    while (j < r.coords.length && cum[j] < rr.b) pts.push(r.coords[j++]);
    pts.push(pointAt(r.coords, cum, Math.min(rr.b, total)).coord);
    if (pts.length >= 2) segs.push({ coords: pts, color: RAMP[rr.c], from: rr.a, to: Math.min(rr.b, total) });
  }
  return segs;
}

/** Tronçons coupés à la distance `upTo` (animation du tracé qui se dessine). */
export function segmentsToGeoJSON(segs: Seg[], upTo = Infinity): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (const s of segs) {
    if (s.from >= upTo) break;
    let coords = s.coords;
    if (s.to > upTo) {
      const cum = cumulative(coords);
      const cut = upTo - s.from;
      const end = pointAt(coords, cum, cut);
      coords = [...coords.slice(0, end.index + 1), end.coord];
    }
    if (coords.length >= 2) features.push({ type: 'Feature', properties: { color: s.color }, geometry: { type: 'LineString', coordinates: coords } });
  }
  return { type: 'FeatureCollection', features };
}

export function lineFeature(coords: LngLat[], props: Record<string, unknown> = {}): Feature<LineString> {
  return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } };
}

/** Partie du tracé entre 0 et `upTo` m. */
export function sliceRoute(coords: LngLat[], upTo: number): LngLat[] {
  const cum = cumulative(coords);
  if (upTo <= 0) return [];
  const end = pointAt(coords, cum, upTo);
  return [...coords.slice(0, end.index + 1), end.coord];
}

/** Repères kilométriques. */
export function kmMarks(r: Route): FeatureCollection<Point> {
  const every = SPORTS[r.sport].kmMark * 1000;
  const cum = cumulative(r.coords);
  const total = cum[cum.length - 1];
  const features: Feature<Point>[] = [];
  for (let s = every; s < total - every * 0.3; s += every) {
    features.push({
      type: 'Feature',
      properties: { label: String(Math.round(s / 1000)) },
      geometry: { type: 'Point', coordinates: pointAt(r.coords, cum, s).coord },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function pointsFC(pts: LngLat[]): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })) };
}

/** Cercle (polygone) pour l'aperçu de la zone couverte par la future boucle. */
export function circlePolygon(center: LngLat, radius: number, steps = 72): FeatureCollection {
  const ring = Array.from({ length: steps + 1 }, (_, i) => destination(center, (i * 360) / steps, radius));
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
}

/** Même parcours, dans l'autre sens. */
export function reverseRoute(r: Route): Route {
  return {
    ...r,
    id: r.id + '-r',
    coords: [...r.coords].reverse(),
    profile: reverseProfile(r.profile, r.lengthM),
    ascent: r.descent,
    descent: r.ascent,
    saved: false,
  };
}
