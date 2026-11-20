import type { LngLat, Profile } from '../types';
import { cumulative, haversine, pointAt } from '../geo';
import { eleAt } from '../elevation';

/*
 * Zone privée, comme sur Strava : un parcours créé depuis chez soi commence et finit devant sa porte.
 * Avant de le publier, on retire ce qui se trouve à moins de `radius` m du départ, au début et à la fin :
 * la communauté voit le parcours à partir du moment où il quitte ce cercle.
 */

export interface Trimmed {
  coords: LngLat[];
  profile: Profile;
  /** longueur retirée au début et à la fin (m) */
  removed: number;
}

export function hidePrivateZone(coords: LngLat[], profile: Profile, radius = 300): Trimmed {
  const none = { coords, profile, removed: 0 };
  if (coords.length < 3 || radius <= 0) return none;
  const home = coords[0];
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  // Première sortie du cercle, dernière entrée.
  let i = 0;
  while (i < coords.length && haversine(coords[i], home) < radius) i++;
  let j = coords.length - 1;
  while (j > i && haversine(coords[j], home) < radius) j--;
  if (i >= j) return none;
  const from = cum[i];
  const to = cum[j];
  // Garder au moins la moitié du parcours : sinon le cercle avale tout (parcours très court).
  if (to - from < total / 2) return none;
  const out = coords.slice(i, j + 1);
  const length = to - from;
  const step = profile.step;
  const ele: number[] = [];
  for (let s = 0; s < length; s += step) ele.push(eleAt(profile, from + s));
  ele.push(eleAt(profile, to));
  return { coords: out, profile: { step, ele }, removed: from + (total - to) };
}

/** Le premier point visible : là où commence le parcours publié. */
export function visibleStart(coords: LngLat[]): LngLat {
  return pointAt(coords, cumulative(coords), 0).coord;
}
