import type { StyleSpecification, ExpressionSpecification, LayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import { earthTiles, globeLabels, graticule } from './earth';

/*
 * Fond de carte maison, volontairement calme : terres gris chaud, forêts sauge, eau bleu pâle,
 * champs blé clair. Les couleurs des milieux reprennent la même teinte que les puces et barres
 * de l'interface (en plus clair), pour que la carte et les chiffres parlent la même langue.
 */

export type Theme = 'light' | 'dark';
/** Fond de carte : le plan maison, ou les photos aériennes (avec les noms de lieux par-dessus). */
export type MapType = 'plan' | 'satellite';

/*
 * Vu de loin, la carte est un globe (comme dans Plans) : la Terre vue de l'espace, avec son atmosphère.
 * En Plan, la Terre est dessinée (images NASA recolorées, voir earth.ts) avec continents, océans, grandes
 * villes, équateur et tropiques ; en Satellite, c'est la photo Blue Marble. Le plan prend le relais en approchant.
 */
const NASA = '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">Terre NASA GIBS</a>';
/** Photos aériennes de l'IGN (Géoplateforme, licence ouverte Etalab) : jusqu'à 20 cm par pixel en France. */
export const ORTHO_TILES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
/** Emprise des photos IGN (métropole) : aucune demande de tuile en dehors. */
const ORTHO_BOUNDS: [number, number, number, number] = [-5.8, 41.2, 9.9, 51.3];
/** Zoom au-dessous duquel on voit l'espace autour du globe. */
export const SPACE_ZOOM = 7;

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
  /** Bâtiments en volume, par hauteur : maison, immeuble, tour. */
  b3d: [string, string, string];
  sky: string;
  horizon: string;
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
  // Maisons sable chaud, immeubles gris, tours ardoise : des teintes de matériaux, jamais le rose des actions.
  b3d: ['#E4D6BD', '#D2CEC7', '#AFB8C9'],
  sky: '#C9DDF0',
  horizon: '#EEF0F0',
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
  // De nuit, plus c'est haut, plus c'est clair.
  b3d: ['#423D35', '#4B4C53', '#5C6782'],
  sky: '#101216',
  horizon: '#25272C',
};

/** Écritures du globe, comme dans Plans : continents espacés en capitales, océans en italique bleu, villes en blanc. */
interface GlobeInk {
  continent: string;
  ocean: string;
  sea: string;
  waterHalo: string;
  city: string;
  cityHalo: string;
  country: string;
  countryHalo: string;
  border: string;
  grat: string;
  gratLabel: string;
}
const GLOBE: Record<Theme, GlobeInk> = {
  dark: {
    continent: 'rgba(235,235,245,0.62)',
    ocean: '#7E9BE2',
    sea: '#6F8BCF',
    waterHalo: 'rgba(0,8,30,0.5)',
    city: '#FFFFFF',
    cityHalo: 'rgba(0,0,0,0.55)',
    country: 'rgba(255,255,255,0.86)',
    countryHalo: 'rgba(0,0,0,0.45)',
    border: 'rgba(255,255,255,0.3)',
    grat: 'rgba(255,255,255,0.32)',
    gratLabel: 'rgba(255,255,255,0.55)',
  },
  light: {
    continent: 'rgba(28,32,40,0.72)',
    ocean: '#103A78',
    sea: '#174788',
    waterHalo: 'rgba(255,255,255,0.5)',
    city: '#1C1C1E',
    cityHalo: 'rgba(255,255,255,0.85)',
    country: '#45443F',
    countryHalo: 'rgba(255,255,255,0.6)',
    border: 'rgba(60,60,72,0.32)',
    grat: 'rgba(28,44,80,0.32)',
    gratLabel: 'rgba(28,44,80,0.6)',
  },
};

/** Seuils de hauteur (m) des classes de bâtiments : en dessous de 10 m, une maison (1 à 2 étages) ; à partir de 30 m, une tour. */
export const BUILDING_STEPS = [10, 30] as const;
export const BUILDING_COLORS: Record<Theme, [string, string, string]> = { light: LIGHT.b3d, dark: DARK.b3d };

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
  const g = GLOBE[theme];
  const globeCity: Pick<SymbolLayerSpecification, 'type' | 'layout' | 'paint'> = {
    type: 'symbol',
    layout: {
      'icon-image': 'city-dot',
      'text-field': NAME,
      'text-font': BOLD,
      'text-size': zw([[1.2, 10], [3, 11.5], [5, 12.5]], 1),
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 0.62,
      'text-justify': 'auto',
      'text-max-width': 8,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: { 'text-color': g.city, 'text-halo-color': g.cityHalo, 'text-halo-width': 1.1, 'text-halo-blur': 0.4 },
  };
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
    // La Terre vue de loin, dessinée comme dans Plans : elle s'efface devant le plan entre les zooms 4,2 et 5,4.
    {
      id: 'earth',
      type: 'raster',
      source: 'earth-plan',
      maxzoom: 5.6,
      paint: {
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4.2, 1, 5.4, 0],
        'raster-fade-duration': 250,
        'raster-resampling': 'linear',
      },
    },
    // Satellite : la Terre de jour sert de fond partout où les photos IGN n'arrivent pas.
    {
      id: 'earth-sat',
      type: 'raster',
      source: 'earth-day',
      maxzoom: 12,
      layout: { visibility: 'none' },
      paint: {
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 9, 1, 11.5, 0],
        'raster-fade-duration': 250,
        'raster-resampling': 'linear',
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
    // Photos aériennes (mode Satellite) : au-dessus des aplats du plan, sous les chemins et les noms.
    {
      id: 'ortho',
      type: 'raster',
      source: 'ortho',
      minzoom: 6,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7.5, 1], 'raster-fade-duration': 200 },
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
    // Frontières des pays : discrètes sur le globe, grises sur le plan.
    {
      id: 'boundary',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      minzoom: 1,
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['interpolate', ['linear'], ['zoom'], 4.6, g.border, 5.6, c.labelSoft],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 8, 0.4],
        'line-width': zw([[2, 0.5], [8, 1.1], [14, 1.8]], 1),
      },
    },
    // Équateur, tropiques et cercles polaires, comme dans Plans : ils s'effacent en approchant.
    {
      id: 'graticule',
      type: 'line',
      source: 'globe-lines',
      maxzoom: 5.6,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': g.grat,
        'line-width': ['match', ['get', 'kind'], 'equator', 0.9, 1.15],
        'line-dasharray': ['match', ['get', 'kind'], 'equator', ['literal', [1, 0]], ['literal', [0.1, 3.2]]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4.2, 1, 5.4, 0],
      },
    },
    {
      id: 'graticule-label',
      type: 'symbol',
      source: 'globe-lines',
      minzoom: 1.2,
      maxzoom: 5.6,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 520,
        'text-field': ['get', 'name'],
        'text-font': ITAL,
        'text-size': zw([[1.2, 9], [3, 10.5], [5, 11.5]], 1),
        'text-letter-spacing': 0.03,
        'text-offset': [0, -0.65],
      },
      paint: {
        'text-color': g.gratLabel,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 4.2, 1, 5.2, 0],
      },
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
    // Mers, golfes et baies (noms des tuiles) ; les océans viennent de la couche globe-ocean.
    {
      id: 'globe-sea',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'water_name',
      minzoom: 2.6,
      maxzoom: 8,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['sea', 'bay', 'strait']]], ['!', ['in', 'Océan', NAME]]],
      layout: {
        'text-field': NAME,
        'text-font': ITAL,
        'text-size': zw([[2.6, 10], [4, 11.5], [7, 13]], 1),
        'text-max-width': 6,
        'text-letter-spacing': 0.04,
        'text-line-height': 1.1,
      },
      paint: {
        'text-color': ['interpolate', ['linear'], ['zoom'], 4.6, g.sea, 5.4, c.waterLabel],
        'text-halo-color': ['interpolate', ['linear'], ['zoom'], 4.6, g.waterHalo, 5.4, c.halo],
        'text-halo-width': 1,
      },
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
      minzoom: 5.4,
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
    // Noms des pays : ils prennent le relais des continents en approchant, puis passent aux couleurs du plan.
    {
      id: 'place-country',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 2.6,
      maxzoom: 7.5,
      filter: ['==', ['get', 'class'], 'country'],
      layout: {
        'text-field': NAME,
        'text-font': REG,
        'text-size': zw([[2.6, 10.5], [4, 12], [6, 14]], 1),
        'text-max-width': 7,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: {
        'text-color': ['interpolate', ['linear'], ['zoom'], 4.6, g.country, 5.4, c.labelSoft],
        'text-halo-color': ['interpolate', ['linear'], ['zoom'], 4.6, g.countryHalo, 5.4, c.halo],
        'text-halo-width': 1.2,
        'text-halo-blur': 0.6,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 2.6, 0, 3.2, 1],
      },
    },
    // Océans en italique bleu, sur plusieurs lignes, comme dans Plans.
    {
      id: 'globe-ocean',
      type: 'symbol',
      source: 'globe-labels',
      maxzoom: 5.6,
      filter: ['==', ['get', 'kind'], 'ocean'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ITAL,
        'text-size': zw([[0.5, 9.5], [2, 12.5], [4, 14]], 1),
        'text-letter-spacing': 0.08,
        'text-line-height': 1.12,
        'text-max-width': 12,
      },
      paint: {
        'text-color': g.ocean,
        'text-halo-color': g.waterHalo,
        'text-halo-width': 1,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 4.4, ['coalesce', ['feature-state', 'vis'], 1], 5.4, 0],
      },
    },
    // Grandes villes du globe : un anneau et le nom. Les tuiles n'en ont pas sous le niveau 2 : une liste
    // des plus grandes sert pour la Terre entière, les tuiles ensuite ; le plan prend le relais au zoom 5,4.
    {
      ...globeCity,
      id: 'globe-city-far',
      source: 'globe-labels',
      minzoom: 1.2,
      maxzoom: 3,
      filter: ['==', ['get', 'kind'], 'city'],
      paint: { ...globeCity.paint, 'text-opacity': ['coalesce', ['feature-state', 'vis'], 1], 'icon-opacity': ['coalesce', ['feature-state', 'vis'], 1] },
    },
    {
      ...globeCity,
      id: 'globe-city',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 3,
      maxzoom: 5.4,
      filter: ['all', ['==', ['get', 'class'], 'city'], ['<=', ['get', 'rank'], 3]],
    },
    // Continents : capitales espacées, en gris, comme dans Plans ; ils s'effacent quand les pays arrivent.
    {
      id: 'globe-continent',
      type: 'symbol',
      source: 'globe-labels',
      maxzoom: 3.8,
      filter: ['==', ['get', 'kind'], 'continent'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': REG,
        'text-transform': 'uppercase',
        'text-size': zw([[0.5, 10], [2, 14], [3.2, 16]], 1),
        'text-letter-spacing': 0.32,
        'text-line-height': 1.15,
        'text-max-width': 14,
      },
      paint: {
        'text-color': g.continent,
        'text-halo-color': theme === 'dark' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.4)',
        'text-halo-width': 1,
        'text-halo-blur': 1,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 2.8, ['coalesce', ['feature-state', 'vis'], 1], 3.6, 0],
      },
    },
  ];

  // Bâtiments en volume (mode 3D) : hauteur réelle (étages), couleur selon la classe, sous les noms de lieux.
  // Les volumes montent avec le zoom entre 13 et 13,8 : en activant la 3D, la ville se lève ; ils restent
  // visibles sur la vue d'ensemble d'un parcours de 10 km.
  const height: ExpressionSpecification = ['max', ['coalesce', ['get', 'render_height'], 0], 3];
  const building3d: LayerSpecification = {
    id: 'building-3d',
    type: 'fill-extrusion',
    source: 'omt',
    'source-layer': 'building',
    minzoom: 13,
    filter: ['!=', ['get', 'hide_3d'], true],
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': ['step', height, c.b3d[0], BUILDING_STEPS[0], c.b3d[1], BUILDING_STEPS[1], c.b3d[2]],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.8, height],
      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.8, ['coalesce', ['get', 'render_min_height'], 0]],
      'fill-extrusion-opacity': 0,
      'fill-extrusion-opacity-transition': { duration: 650, delay: 0 },
      'fill-extrusion-vertical-gradient': true,
    },
  };
  const firstLabel = layers.findIndex((l) => l.type === 'symbol');
  layers.splice(firstLabel < 0 ? layers.length : firstLabel, 0, building3d);

  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    // Globe vu de loin, carte à plat dès le zoom 12 (préréglage MapLibre).
    projection: { type: 'globe' },
    // Lumière douce venue du sud-ouest : les façades se distinguent des toits. Vu de l'espace, le soleil est
    // derrière nous : l'atmosphère fait un liseré régulier tout autour du globe, comme dans Plans.
    light: {
      anchor: 'viewport',
      color: '#ffffff',
      intensity: theme === 'dark' ? 0.32 : 0.42,
      position: ['interpolate', ['linear'], ['zoom'], 5, ['literal', [1.15, 210, 0]], 9, ['literal', [1.3, 210, 35]]] as unknown as [number, number, number],
    },
    // Ciel et brume à l'horizon quand la carte est inclinée ; atmosphère autour du globe vu de loin.
    sky: {
      'sky-color': c.sky,
      'horizon-color': c.horizon,
      'fog-color': c.bg,
      'sky-horizon-blend': 0.55,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.72,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, SPACE_ZOOM, 0],
    },
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      // Le globe dessiné (Plan) et la photo de la Terre (Satellite).
      'earth-plan': { type: 'raster', tiles: [earthTiles(theme)], tileSize: 256, maxzoom: 8, attribution: NASA },
      'earth-day': { type: 'raster', tiles: [earthTiles('photo')], tileSize: 256, maxzoom: 8, attribution: NASA },
      'globe-lines': { type: 'geojson', data: graticule() },
      'globe-labels': { type: 'geojson', data: globeLabels() },
      ortho: {
        type: 'raster',
        tiles: [ORTHO_TILES],
        tileSize: 256,
        maxzoom: 19,
        bounds: ORTHO_BOUNDS,
        attribution: '<a href="https://geoservices.ign.fr" target="_blank" rel="noopener">Photos aériennes © IGN</a>',
      },
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

/** Une propriété de couche que le mode Satellite remplace. */
export interface StyleOverride {
  id: string;
  kind: 'paint' | 'layout';
  prop: string;
  value: unknown;
}

/**
 * Ce que le mode Satellite change sur le plan : les photos apparaissent, les routes s'effacent (elles sont
 * sur les photos), les chemins et sentiers restent en clair, et les noms passent en blanc cerné de noir.
 */
export function satelliteOverrides(): StyleOverride[] {
  const vis = (id: string, v: 'visible' | 'none'): StyleOverride => ({ id, kind: 'layout', prop: 'visibility', value: v });
  const paint = (id: string, prop: string, value: unknown): StyleOverride => ({ id, kind: 'paint', prop, value });
  const layout = (id: string, prop: string, value: unknown): StyleOverride => ({ id, kind: 'layout', prop, value });
  return [
    vis('earth', 'none'),
    vis('earth-sat', 'visible'),
    vis('ortho', 'visible'),
    vis('road-casing', 'none'),
    vis('motorway-casing', 'none'),
    vis('rail', 'none'),
    paint('road', 'line-opacity', 0.38),
    paint('motorway', 'line-opacity', 0.45),
    paint('path', 'line-color', 'rgba(255,255,255,0.82)'),
    paint('track', 'line-color', 'rgba(255,238,206,0.82)'),
    paint('boundary', 'line-color', 'rgba(255,255,255,0.6)'),
    paint('graticule', 'line-color', 'rgba(255,255,255,0.4)'),
    paint('graticule-label', 'text-color', 'rgba(255,255,255,0.7)'),
    paint('globe-continent', 'text-color', 'rgba(255,255,255,0.78)'),
    layout('globe-city', 'icon-image', 'city-dot-night'),
    layout('globe-city-far', 'icon-image', 'city-dot-night'),
    ...['globe-ocean', 'globe-sea'].flatMap((id) => [paint(id, 'text-color', '#BFD3FF'), paint(id, 'text-halo-color', 'rgba(0,0,0,0.5)')]),
    ...['waterway-label', 'water-label', 'road-label', 'peak', 'place-minor', 'place', 'place-country', 'globe-city', 'globe-city-far'].flatMap((id) => [
      paint(id, 'text-color', '#FFFFFF'),
      paint(id, 'text-halo-color', 'rgba(0,0,0,0.62)'),
    ]),
  ];
}

/** Valeur d'origine (plan) d'une propriété remplacée, lue dans le style construit. */
export function planValue(style: StyleSpecification, o: StyleOverride): unknown {
  const layer = style.layers.find((l) => l.id === o.id) as { paint?: Record<string, unknown>; layout?: Record<string, unknown> } | undefined;
  const v = layer?.[o.kind]?.[o.prop];
  if (v !== undefined) return v;
  return o.prop === 'visibility' ? 'visible' : null;
}
