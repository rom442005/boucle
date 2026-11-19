import type { LngLat, Profile } from './types';
import { bearing, cumulative, haversine, pointAt } from './geo';
import { eleAt } from './elevation';

/*
 * Petits allers-retours (« éperons ») : quand un point de passage tombe dans une impasse ou une
 * petite rue, l'itinéraire y entre puis ressort par le même chemin. Ces détours n'apportent rien :
 * on les repère (demi-tour + trajet qui se superpose à lui-même) et on les retire du tracé.
 */

export interface Cut {
  from: number;
  to: number;
}

const STEP = 5;

function angDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Repère les allers-retours d'au plus `maxHalf` m de chaque côté (donc 2 x maxHalf en tout).
 * `tol` : écart maximal entre l'aller et le retour pour les considérer superposés.
 */
export function findSpurs(coords: LngLat[], maxHalf = 450, tol = 7, keep: LngLat[] = []): Cut[] {
  if (coords.length < 3) return [];
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  if (total < 60) return [];
  const n = Math.floor(total / STEP);
  const pts: LngLat[] = [];
  for (let k = 0; k <= n; k++) pts.push(pointAt(coords, cum, k * STEP).coord);
  const arm = 3;
  const cuts: Cut[] = [];
  let k = arm;
  while (k < pts.length - arm) {
    const a = pts[k - arm];
    const b = pts[k];
    const c = pts[k + arm];
    if (haversine(a, b) < 2 || haversine(b, c) < 2 || angDiff(bearing(a, b), bearing(b, c)) < 150) {
      k++;
      continue;
    }
    // Demi-tour en k : on mesure jusqu'où l'aller et le retour se superposent.
    let m = 0;
    while (k - m - 1 >= 0 && k + m + 1 < pts.length && haversine(pts[k - m - 1], pts[k + m + 1]) <= tol) m++;
    const half = m * STEP;
    // Un aller-retour qui mène à un point de passage imposé est voulu : on le garde.
    const reachesKeep = keep.some((q) => {
      for (let j = k - m; j <= k + m; j++) if (haversine(pts[j], q) <= 35) return true;
      return false;
    });
    if (half >= 15 && half <= maxHalf && !reachesKeep) {
      cuts.push({ from: (k - m) * STEP, to: Math.min(total, (k + m) * STEP) });
      k += m + 1;
    } else k++;
  }
  // Fusion des coupes qui se chevauchent.
  cuts.sort((x, y) => x.from - y.from);
  const merged: Cut[] = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c.from <= last.to) last.to = Math.max(last.to, c.to);
    else merged.push({ ...c });
  }
  return merged;
}

/** Retire des portions du tracé et recolle le profil d'altitude en conséquence. */
export function applyCuts(coords: LngLat[], profile: Profile, cuts: Cut[]): { coords: LngLat[]; profile: Profile } {
  if (!cuts.length) return { coords, profile };
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  const out: LngLat[] = [];
  let ci = 0;
  for (let i = 0; i < coords.length; i++) {
    const s = cum[i];
    while (ci < cuts.length && s > cuts[ci].to) ci++;
    const c = cuts[ci];
    if (c && s >= c.from && s <= c.to) {
      // Entrée dans une coupe : on garde le point de départ de la coupe une seule fois.
      const start = pointAt(coords, cum, c.from).coord;
      const last = out[out.length - 1];
      if (!last || haversine(last, start) > 0.5) out.push(start);
      continue;
    }
    out.push(coords[i]);
  }
  const removed = cuts.reduce((acc, c) => acc + (c.to - c.from), 0);
  const length = Math.max(0, total - removed);
  // Distance d'origine correspondant à une distance du tracé raccourci.
  const original = (s: number) => {
    let x = s;
    for (const c of cuts) {
      if (x >= c.from) x += c.to - c.from;
      else break;
    }
    return Math.min(x, total);
  };
  const ele: number[] = [];
  for (let s = 0; s < length; s += profile.step) ele.push(eleAt(profile, original(s)));
  ele.push(eleAt(profile, original(length)));
  return { coords: out, profile: { step: profile.step, ele } };
}

/**
 * Plusieurs passes : retirer un aller-retour peut en révéler un autre au même carrefour.
 * `keep` : points de passage imposés, jamais coupés.
 */
export function removeSpurs(coords: LngLat[], profile: Profile, maxHalf = 450, keep: LngLat[] = []) {
  let cur = { coords, profile };
  for (let pass = 0; pass < 4; pass++) {
    const cuts = findSpurs(cur.coords, maxHalf, 7, keep);
    if (!cuts.length) break;
    cur = applyCuts(cur.coords, cur.profile, cuts);
  }
  return cur;
}
