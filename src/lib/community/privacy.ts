import type { LngLat, Profile } from '../types';
import { cumulative, haversine, pointAt } from '../geo';
import { eleAt } from '../elevation';

/*
 * Zone privée, comme sur Strava : un parcours créé depuis chez soi commence et finit devant sa porte.
 * Avant de le publier, on retire ce qui se trouve dans un cercle autour du départ, au début et à la fin : la
 * communauté voit le parcours à partir du moment où il quitte ce cercle.
 *
 * Le cercle n'est pas centré sur la porte et n'a pas un rayon fixe : centre tiré au hasard à moins de 0,4 × `radius`
 * du départ, rayon tiré entre 1,4 et 2 × `radius`, à chaque publication. Les bouts publiés restent toujours à au
 * moins `radius` de la porte, mais ne sont plus à une distance connue : croiser les cercles de plusieurs parcours ne
 * retrouve plus l'adresse (le défaut des premières zones privées de Strava).
 */

export interface Trimmed {
  coords: LngLat[];
  profile: Profile;
  /** longueur retirée au début et à la fin (m) */
  removed: number;
  /** faux si le départ ne peut pas être masqué (parcours trop court ou qui ne quitte pas la zone) : ne pas publier */
  ok: boolean;
}

export function hidePrivateZone(coords: LngLat[], profile: Profile, radius = 300, rand: () => number = Math.random): Trimmed {
  const fail = { coords, profile, removed: 0, ok: false };
  if (coords.length < 3 || radius <= 0) return fail;
  const home = coords[0];
  const r = radius * (1.4 + rand() * 0.6);
  const angle = rand() * 2 * Math.PI;
  const off = rand() * radius * 0.4;
  const kx = 111320 * Math.cos((home[1] * Math.PI) / 180);
  const center: LngLat = [home[0] + (Math.cos(angle) * off) / kx, home[1] + (Math.sin(angle) * off) / 110540];
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  // Première sortie du cercle, dernière entrée.
  let i = 0;
  while (i < coords.length && haversine(coords[i], center) < r) i++;
  let j = coords.length - 1;
  while (j > i && haversine(coords[j], center) < r) j--;
  if (i >= j) return fail;
  const from = cum[i];
  const to = cum[j];
  // Garder au moins la moitié du parcours : sinon le cercle avale tout (parcours très court).
  if (to - from < total / 2) return fail;
  const out = coords.slice(i, j + 1);
  const length = to - from;
  const step = profile.step;
  const ele: number[] = [];
  for (let s = 0; s < length; s += step) ele.push(eleAt(profile, from + s));
  ele.push(eleAt(profile, to));
  return { coords: out, profile: { step, ele }, removed: from + (total - to), ok: true };
}

/** Le premier point visible : là où commence le parcours publié. */
export function visibleStart(coords: LngLat[]): LngLat {
  return pointAt(coords, cumulative(coords), 0).coord;
}
