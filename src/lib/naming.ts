import type { Maneuver } from './valhalla';
import type { LngLat, Shape } from './types';
import { bearing, cardinal } from './geo';

const NATURE = /\b(parc|bois|for[eê]t|quai|bord|berges?|rives?|canal|lac|[ée]tang|halage|coul[ée]e|promenade|voie verte|sentier|plage|vall[ée]e|[iî]le|jardin|square|mail|cours|chemin|corniche|digue|lande|mont|col|c[ôo]te|pointe|vignes?)\b/i;
const GENERIC = /^(rond-point|giratoire|passage|parking|acc[eè]s|bretelle|sortie|entr[ée]e)\b/i;

function cleanName(n: string): string {
  return n.replace(/\s+/g, ' ').trim();
}

/** Nom lisible tiré des voies les plus parcourues, avec un bonus pour les noms de nature. */
export function routeName(maneuvers: Maneuver[], shape: Shape, start: LngLat, far: LngLat, destinationName?: string): string {
  const totals = new Map<string, number>();
  for (const m of maneuvers) {
    const name = m.names.map(cleanName).find((n) => n.length > 2 && !GENERIC.test(n));
    if (!name) continue;
    totals.set(name, (totals.get(name) ?? 0) + m.length * (NATURE.test(name) ? 1.6 : 1));
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (shape === 'oneway' && destinationName) {
    return ranked[0] ? `Vers ${destinationName} par ${lowerFirst(ranked[0])}` : `Vers ${destinationName}`;
  }
  const [a, b] = ranked;
  if (a && b && a.length + b.length <= 44) return `${a} et ${lowerFirst(b)}`;
  if (a) return a;
  const dir = cardinal(bearing(start, far));
  return shape === 'outback' ? `Aller-retour vers le ${dir}` : `Boucle par le ${dir}`;
}

/* Les types de voie s'écrivent en minuscule au milieu d'un titre : « Quai de Versailles et parc de Procé ». */
const TYPES = /^(Rue|Avenue|Boulevard|Quai|Parc|Chemin|All[ée]e|Promenade|Place|Pont|Route|Impasse|Square|Cours|Mail|Esplanade|Sentier|Voie|Passage|Jardin|Bois|For[eê]t|Rond-point|Berge|Rive|Corniche|Digue|Sente|Venelle|Ruelle)\b/;
function lowerFirst(n: string): string {
  return TYPES.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
}
