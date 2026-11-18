import type { StyleSpecification, ExpressionSpecification, LayerSpecification } from 'maplibre-gl';

/*
 * Fond de carte maison, volontairement calme : terres gris chaud, forêts sauge, eau bleu pâle,
 * champs blé clair. Les couleurs des milieux reprennent la même teinte que les puces et barres
 * de l'interface (en plus clair), pour que la carte et les chiffres parlent la même langue.
 */

export type Theme = 'light' | 'dark';

interface Palette {
  bg: string;
  residential: string;
  industrial: string;
  wood: string;
  park: string;
  fields: string;
  meadow: string;
  wetland: string;
  sand: string;
  water: string;
  building: string;
  buildingLine: string;
  casing: string;
  road: string;
  roadMajor: string;
  motorway: string;
  motorwayCasing: string;
  path: string;
  track: string;
  rail: string;
  label: string;
  labelSoft: string;
  halo: string;
  waterLabel: string;
  hillShadow: string;
  hillHighlight: string;
  hillAccent: string;
  routeCasing: string;
}

const LIGHT: Palette = {
  bg: '#F2F1ED',
  residential: '#ECEAE5',
  industrial: '#E9E6E1',
  wood: '#CBE2BF',
  park: '#D5EBC6',
  fields: '#F0EBDB',
  meadow: '#E6EED6',
  wetland: '#D7E9E0',
  sand: '#F1E9D2',
  water: '#A9D2F0',
  building: '#E2E0DA',
  buildingLine: '#D6D3CC',
  casing: '#D8D5CE',
  road: '#FFFFFF',
  roadMajor: '#FFFFFF',
  motorway: '#F9DFA3',
  motorwayCasing: '#E3BF73',
  path: '#A49E90',
  track: '#B3AC99',
  rail: '#C9C5BD',
  label: '#45443F',
  labelSoft: '#77746C',
  halo: 'rgba(247,246,242,0.92)',
  waterLabel: '#4A7FAE',
  hillShadow: 'rgba(70,58,40,0.30)',
  hillHighlight: 'rgba(255,255,255,0.22)',
  hillAccent: 'rgba(70,58,40,0.16)',
  routeCasing: '#FFFFFF',
};

const DARK: Palette = {
  bg: '#1E1F21',
  residential: '#232427',
  industrial: '#25262A',
  wood: '#1E3325',
  park: '#213729',
  fields: '#27261F',
  meadow: '#222920',
  wetland: '#1D2D29',
  sand: '#2B281F',
  water: '#13304A',
  building: '#2B2C30',
  buildingLine: '#323338',
  casing: '#141516',
  road: '#3A3B3F',
  roadMajor: '#47484D',
  motorway: '#5C4C2C',
  motorwayCasing: '#2A2418',
  path: '#77726A',
  track: '#6B665C',
  rail: '#3E3F43',
  label: '#D2D0C9',
  labelSoft: '#9A978F',
  halo: 'rgba(30,31,33,0.92)',
  waterLabel: '#7FB0D9',
  hillShadow: 'rgba(0,0,0,0.55)',
  hillHighlight: 'rgba(255,255,255,0.06)',
  hillAccent: 'rgba(0,0,0,0.25)',
  routeCasing: '#0E0E10',
};

export const ROUTE_CASING: Record<Theme, string> = { light: LIGHT.routeCasing, dark: DARK.routeCasing };

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:fr'], ['get', 'name_int'], ['get', 'name']];
const REG = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];
const ITAL = ['Noto Sans Italic'];

const zw = (stops: [number, number][], base = 1.45): ExpressionSpecification =>
  ['interpolate', ['exponential', base], ['zoom'], ...stops.flat()] as unknown as ExpressionSpecification;

export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export function buildStyle(theme: Theme): StyleSpecification {
  const c = theme === 'dark' ? DARK : LIGHT;
  const roadClass = (classes: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', classes]];

  const layers: LayerSpecification[] = [
    { id: 'bg', type: 'background', paint: { 'background-color': c.bg } },
    {
      id: 'residential',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'residential'],
      paint: { 'fill-color': c.residential, 'fill-opacity': zw([[8, 0.4], [13, 1]], 1) },
    },
    {
      id: 'industrial',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landuse',
      filter: roadClass(['commercial', 'industrial', 'retail', 'railway', 'garages']),
      paint: { 'fill-color': c.industrial },
    },
    {
      id: 'farmland',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'farmland'],
      paint: { 'fill-color': c.fields },
    },
    {
      id: 'grass',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'grass'],
      paint: {
        'fill-color': [
          'match',
          ['get', 'subclass'],
          ['park', 'recreation_ground', 'village_green', 'garden', 'golf_course', 'dog_park'],
          c.park,
          c.meadow,
        ],
      },
    },
    {
      id: 'cemetery',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'cemetery'],
      paint: { 'fill-color': c.park },
    },
    {
      id: 'wood',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': c.wood, 'fill-antialias': false },
    },
    {
      id: 'wetland',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wetland'],
      paint: { 'fill-color': c.wetland },
    },
    {
      id: 'sand',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'sand'],
      paint: { 'fill-color': c.sand },
    },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem-hs',
      paint: {
        'hillshade-exaggeration': theme === 'dark' ? 0.35 : 0.28,
        'hillshade-shadow-color': c.hillShadow,
        'hillshade-highlight-color': c.hillHighlight,
        'hillshade-accent-color': c.hillAccent,
        'hillshade-illumination-direction': 315,
      },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['all', ['!=', ['get', 'class'], 'swimming_pool'], ['!=', ['get', 'brunnel'], 'tunnel']],
      paint: { 'fill-color': c.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.water,
        'line-width': [
          'interpolate',
          ['exponential', 1.4],
          ['zoom'],
          10,
          ['match', ['get', 'class'], ['river', 'canal'], 1.2, 0.4],
          16,
          ['match', ['get', 'class'], ['river', 'canal'], 7, 2],
        ],
      },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': c.building, 'fill-outline-color': c.buildingLine, 'fill-opacity': zw([[14, 0], [15, 1]], 1) },
    },
    {
      id: 'track',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['==', ['get', 'class'], 'track'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.track, 'line-width': zw([[12, 0.6], [16, 1.8], [18, 3]]), 'line-dasharray': [2.2, 1.2] },
    },
    {
      id: 'path',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['==', ['get', 'class'], 'path'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.path, 'line-width': zw([[13, 0.5], [16, 1.4], [18, 2.4]]), 'line-dasharray': [1.6, 1.2] },
    },
    {
      id: 'road-casing',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: roadClass(['service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.casing,
        'line-width': [
          'interpolate',
          ['exponential', 1.45],
          ['zoom'],
          11,
          ['match', ['get', 'class'], ['primary', 'trunk'], 2.2, ['secondary', 'tertiary'], 1.6, 0],
          14,
          ['match', ['get', 'class'], ['primary', 'trunk'], 6, ['secondary', 'tertiary'], 5, 'minor', 3.4, 2],
          18,
          ['match', ['get', 'class'], ['primary', 'trunk'], 26, ['secondary', 'tertiary'], 22, 'minor', 18, 9],
        ],
      },
    },
    {
      id: 'road',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 8,
      filter: roadClass(['service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], ['primary', 'trunk', 'secondary'], c.roadMajor, c.road],
        'line-width': [
          'interpolate',
          ['exponential', 1.45],
          ['zoom'],
          8,
          ['match', ['get', 'class'], ['primary', 'trunk'], 0.8, 0],
          11,
          ['match', ['get', 'class'], ['primary', 'trunk'], 1.4, ['secondary', 'tertiary'], 0.9, 0.3],
          14,
          ['match', ['get', 'class'], ['primary', 'trunk'], 4.4, ['secondary', 'tertiary'], 3.6, 'minor', 2.2, 1],
          18,
          ['match', ['get', 'class'], ['primary', 'trunk'], 22, ['secondary', 'tertiary'], 19, 'minor', 15, 7],
        ],
      },
    },
    {
      id: 'motorway-casing',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 7,
      filter: ['==', ['get', 'class'], 'motorway'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.motorwayCasing, 'line-width': zw([[7, 1], [12, 3], [16, 12], [18, 26]]) },
    },
    {
      id: 'motorway',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 6,
      filter: ['==', ['get', 'class'], 'motorway'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.motorway, 'line-width': zw([[6, 0.6], [12, 1.8], [16, 9], [18, 22]]) },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', roadClass(['rail', 'transit']), ['!=', ['get', 'brunnel'], 'tunnel']],
      paint: { 'line-color': c.rail, 'line-width': zw([[11, 0.6], [16, 1.6]]) },
    },
    {
      id: 'waterway-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['river', 'canal']]],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': ITAL,
        'text-size': 12,
        'text-letter-spacing': 0.04,
      },
      paint: { 'text-color': c.waterLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'water-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'water_name',
      minzoom: 10,
      layout: { 'text-field': NAME, 'text-font': ITAL, 'text-size': 12, 'text-max-width': 8 },
      paint: { 'text-color': c.waterLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 14,
      filter: roadClass(['minor', 'tertiary', 'secondary', 'primary', 'trunk', 'path', 'track', 'service']),
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': REG,
        'text-size': zw([[14, 10], [18, 13]], 1),
        'text-rotation-alignment': 'map',
      },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'peak',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'mountain_peak',
      minzoom: 11,
      filter: ['has', 'ele'],
      layout: {
        'text-field': ['concat', ['coalesce', ['get', 'name:fr'], ['get', 'name']], '\n', ['to-string', ['get', 'ele']], ' m'],
        'text-font': REG,
        'text-size': 11,
        'text-max-width': 8,
      },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place-minor',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 11,
      filter: roadClass(['suburb', 'quarter', 'neighbourhood', 'hamlet']),
      layout: {
        'text-field': NAME,
        'text-font': REG,
        'text-size': zw([[11, 10], [15, 13]], 1),
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-max-width': 7,
      },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'place',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 5,
      filter: roadClass(['city', 'town', 'village']),
      layout: {
        'text-field': NAME,
        'text-font': ['match', ['get', 'class'], 'village', ['literal', REG], ['literal', BOLD]] as unknown as string[],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          ['match', ['get', 'class'], 'city', 13, 'town', 11, 10],
          13,
          ['match', ['get', 'class'], 'city', 20, 'town', 16, 13],
        ],
        'text-max-width': 8,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
    },
  ];

  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      'dem-hs': {
        type: 'raster-dem',
        tiles: [DEM_TILES],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 13,
        attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Relief Mapzen</a>',
      },
      'dem-3d': { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
    },
    layers,
  };
}
