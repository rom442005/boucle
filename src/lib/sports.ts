import type { EnvClass, Params, Settings, Shape, Sport, Surface } from './types';

export interface SportDef {
  label: string;
  /** libellé long pour les lecteurs d'écran et le GPX */
  long: string;
  distance: { min: number; max: number; step: number; def: number };
  elevation: { max: number; step: number };
  /** null : pas de choix de sol (vélo de route, toujours goudronné) */
  surfaces: Record<Surface, string> | null;
  surfaceHint: Record<Surface, string> | null;
  defaultSurface: Surface;
  bike: boolean;
  /** espacement des repères kilométriques sur la carte */
  kmMark: number;
  gpxType: string;
}

export const SPORTS: Record<Sport, SportDef> = {
  run: {
    label: 'Course',
    long: 'Course sur route',
    distance: { min: 1, max: 42, step: 0.5, def: 10 },
    elevation: { max: 800, step: 10 },
    surfaces: { a: 'Bitume', b: 'Mixte', c: 'Chemins' },
    surfaceHint: {
      a: 'Rues et trottoirs, le moins de chemins possible.',
      b: 'Ce qui passe le mieux, chemins compris.',
      c: 'Parcs, berges et chemins dès que possible.',
    },
    defaultSurface: 'b',
    bike: false,
    kmMark: 1,
    gpxType: 'running',
  },
  trail: {
    label: 'Trail',
    long: 'Trail',
    distance: { min: 3, max: 60, step: 1, def: 15 },
    elevation: { max: 3000, step: 25 },
    surfaces: { a: 'Roulant', b: 'Sentiers', c: 'Technique' },
    surfaceHint: {
      a: 'Chemins larges et pistes, faciles à courir.',
      b: 'Sentiers de randonnée balisés.',
      c: 'Sentiers de montagne exigeants (jusqu’à T4).',
    },
    defaultSurface: 'b',
    bike: false,
    kmMark: 1,
    gpxType: 'trail_running',
  },
  road: {
    label: 'Vélo',
    long: 'Vélo de route',
    distance: { min: 10, max: 200, step: 5, def: 50 },
    elevation: { max: 3000, step: 50 },
    surfaces: null,
    surfaceHint: null,
    defaultSurface: 'a',
    bike: true,
    kmMark: 5,
    gpxType: 'cycling',
  },
  gravel: {
    label: 'Gravel',
    long: 'Gravel et VTT',
    distance: { min: 10, max: 150, step: 5, def: 40 },
    elevation: { max: 2500, step: 50 },
    surfaces: { a: 'Mixte', b: 'Chemins', c: 'VTT' },
    surfaceHint: {
      a: 'Petites routes et chemins roulants.',
      b: 'Chemins et pistes en priorité.',
      c: 'Sentiers de VTT, plus engagés.',
    },
    defaultSurface: 'b',
    bike: true,
    kmMark: 5,
    gpxType: 'gravel_cycling',
  },
};

export const SPORT_ORDER: Sport[] = ['run', 'trail', 'road', 'gravel'];

export const SHAPES: Record<Shape, { label: string; cta: string }> = {
  loop: { label: 'Boucle', cta: 'Créer la boucle' },
  outback: { label: 'Aller-retour', cta: 'Créer l’aller-retour' },
  oneway: { label: 'Vers un lieu', cta: 'Créer l’itinéraire' },
};

export const ENVS: Record<EnvClass, { label: string; short: string }> = {
  forest: { label: 'Forêt', short: 'forêt' },
  water: { label: 'Bord de l’eau', short: 'bord de l’eau' },
  park: { label: 'Parcs', short: 'parcs' },
  fields: { label: 'Campagne', short: 'campagne' },
  urban: { label: 'Ville', short: 'ville' },
};

export const ENV_ORDER: EnvClass[] = ['forest', 'water', 'park', 'fields', 'urban'];

export function defaultParams(sport: Sport = 'run'): Params {
  const def = SPORTS[sport];
  return {
    sport,
    distanceKm: def.distance.def,
    elevation: null,
    shape: 'loop',
    envs: [],
    surface: def.defaultSurface,
    avoidBusy: true,
    lit: false,
    water: false,
    headwind: def.bike,
  };
}

export const DEFAULT_SETTINGS: Settings = {
  paceRun: 330,
  paceTrail: 450,
  speedRoad: 26,
  speedGravel: 19,
};

/** Niveau de dénivelé lisible, d'après le rapport m/km. */
export function elevationLevel(dplus: number, km: number): string {
  const r = dplus / Math.max(km, 0.1);
  if (r < 5) return 'Plat';
  if (r < 12) return 'Vallonné';
  if (r < 25) return 'Exigeant';
  return 'Montagneux';
}

/** Durée estimée en secondes. Course : allure x km-effort (1 km par 100 m de D+). Vélo : vitesse à plat + 6 à 8 min par 100 m de D+. */
export function estimateDuration(sport: Sport, lengthM: number, ascent: number, s: Settings): number {
  const km = lengthM / 1000;
  switch (sport) {
    case 'run':
      return s.paceRun * (km + ascent / 100);
    case 'trail':
      return s.paceTrail * (km + ascent / 100);
    case 'road':
      return (km / s.speedRoad) * 3600 + ascent * 3.6;
    case 'gravel':
      return (km / s.speedGravel) * 3600 + ascent * 4.8;
  }
}
