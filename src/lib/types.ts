export type LngLat = [number, number];

export type Sport = 'run' | 'trail' | 'road' | 'gravel';
export type Shape = 'loop' | 'outback' | 'oneway';
export type EnvClass = 'forest' | 'water' | 'park' | 'fields' | 'urban';
/** Préférence de sol. Le sens dépend du sport (voir SPORTS dans sports.ts). */
export type Surface = 'a' | 'b' | 'c';

export interface Place {
  name: string;
  detail?: string;
  coord: LngLat;
  kind: 'gps' | 'search' | 'map';
}

export interface Params {
  sport: Sport;
  distanceKm: number;
  /** Dénivelé positif visé en mètres ; null = indifférent. */
  elevation: number | null;
  shape: Shape;
  envs: EnvClass[];
  surface: Surface;
  avoidBusy: boolean;
  lit: boolean;
  water: boolean;
  headwind: boolean;
}

export interface Settings {
  /** secondes par km */
  paceRun: number;
  paceTrail: number;
  /** km/h */
  speedRoad: number;
  speedGravel: number;
}

export interface Profile {
  /** pas en mètres entre deux altitudes */
  step: number;
  ele: number[];
}

export interface SurfaceSplit {
  paved: number;
  compacted: number;
  dirt: number;
}

export type EnvSplit = Partial<Record<EnvClass | 'other', number>>;

export interface Match {
  distance: number;
  elevation: number | null;
  env: number | null;
  /** ressemblance au dessin (mode Dessin), de 0 à 1 */
  art?: number;
  score: number;
}

export interface Route {
  id: string;
  name: string;
  /** points de passage imposés par l'utilisateur, dans l'ordre du parcours */
  vias?: { name: string; coord: LngLat }[];
  sport: Sport;
  shape: Shape;
  coords: LngLat[];
  profile: Profile;
  lengthM: number;
  ascent: number;
  descent: number;
  minEle: number;
  maxEle: number;
  /** pente maximale en %, lissée sur 100 m */
  maxGrade: number;
  env: EnvSplit;
  surface: SurfaceSplit | null;
  /** part sur grands axes (primaire, secondaire, nationale) */
  busy: number | null;
  /** part du tracé parcourue deux fois */
  overlap: number;
  waterPoints: LngLat[];
  durationS: number;
  match?: Match;
  /** mode Dessin : le dessin tel qu'il a été posé sur la carte, et la ressemblance (0 à 1) */
  art?: { ghost: LngLat[]; fit: number };
  tags?: string[];
  params?: Params;
  createdAt: number;
  saved?: boolean;
  /** parcours de la Communauté (identifiant publié) */
  communityId?: string;
}

export interface GenProgress {
  message: string;
  ratio: number;
}
