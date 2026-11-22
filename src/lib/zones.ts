import type { FilterSpecification } from 'maplibre-gl';
import type { IconName } from './icons';

/*
 * Lieux à mettre en valeur sur la carte, depuis le petit bloc sous la météo : pistes d'athlétisme, parcs,
 * eau, forêts, fontaines. Ils sont déjà dans les tuiles de la carte (OpenFreeMap, schéma OpenMapTiles) :
 * rien à télécharger de plus, le surlignage est immédiat. Les petits lieux (pistes, fontaines) reçoivent en
 * plus un repère rond, visible même de loin.
 */
export type ZoneKind = 'track' | 'park' | 'water' | 'wood' | 'fountain';

export interface ZoneDef {
  label: string;
  /** nom pour les lecteurs d'écran */
  long: string;
  emoji: string;
  /** icône de la barre des lieux (et sa version pleine quand le lieu est montré) */
  icon: IconName;
  color: string;
  /** zoom à partir duquel les tuiles les contiennent */
  minZoom: number;
  /** repère rond sur chaque lieu (petits lieux) */
  pin: boolean;
  /** couches des tuiles et filtre */
  layer: 'landuse' | 'landcover' | 'water' | 'poi';
  filter: FilterSpecification;
}

const PARKS = ['park', 'garden', 'recreation_ground', 'village_green', 'dog_park'];

export const ZONES: Record<ZoneKind, ZoneDef> = {
  track: {
    label: 'Pistes',
    long: 'Pistes d’athlétisme',
    emoji: '🏟️',
    icon: 'track',
    color: '#FF6A3D',
    minZoom: 12,
    pin: true,
    layer: 'landuse',
    filter: ['==', ['get', 'class'], 'track'],
  },
  park: {
    label: 'Parcs',
    long: 'Parcs et jardins',
    emoji: '🌳',
    icon: 'park',
    color: '#34C759',
    minZoom: 0,
    pin: false,
    layer: 'landcover',
    filter: ['all', ['==', ['get', 'class'], 'grass'], ['in', ['get', 'subclass'], ['literal', PARKS]]],
  },
  water: {
    label: 'Eau',
    long: 'Lacs, étangs et rivières',
    emoji: '💧',
    icon: 'waves',
    color: '#0A84FF',
    minZoom: 0,
    pin: false,
    layer: 'water',
    filter: ['all', ['!=', ['get', 'class'], 'swimming_pool'], ['!=', ['get', 'brunnel'], 'tunnel']],
  },
  wood: {
    label: 'Forêts',
    long: 'Bois et forêts',
    emoji: '🌲',
    icon: 'tree',
    color: '#1FA463',
    minZoom: 0,
    pin: false,
    layer: 'landcover',
    filter: ['==', ['get', 'class'], 'wood'],
  },
  fountain: {
    label: 'Fontaines',
    long: 'Fontaines d’eau potable',
    emoji: '🚰',
    icon: 'drop',
    color: '#5AC8FA',
    minZoom: 14,
    pin: true,
    layer: 'poi',
    filter: ['==', ['get', 'class'], 'drinking_water'],
  },
};

export const ZONE_ORDER: ZoneKind[] = ['track', 'park', 'water', 'wood', 'fountain'];

/** Centre approché d'une géométrie (milieu de son emprise) : de quoi poser un repère sur un petit lieu. */
export function centerOf(g: GeoJSON.Geometry): [number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      const [x, y] = c as [number, number];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      return;
    }
    for (const k of c) visit(k);
  };
  if (g.type === 'GeometryCollection') g.geometries.forEach((x) => visit((x as GeoJSON.Point).coordinates));
  else visit(g.coordinates);
  return Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : null;
}

/** Un même lieu, coupé entre plusieurs tuiles, ne compte qu'une fois (grille d'une cinquantaine de mètres). */
export const zoneKey = (kind: ZoneKind, c: [number, number]) => `${kind}:${Math.round(c[0] * 1600)}:${Math.round(c[1] * 2200)}`;
