import type { AddProtocolAction } from 'maplibre-gl';
import type { FeatureCollection, LineString, Point } from 'geojson';

/*
 * La Terre vue de loin, dessinée comme dans Plans : océans unis, terres colorées selon la végétation,
 * glaces, sans l'aspect d'une photo. Les images NASA (Blue Marble, relief et fonds marins, domaine public)
 * sont recolorées pixel par pixel : l'eau suit la profondeur, les terres leur clarté (forêt sombre,
 * prairie, steppe, désert clair), la glace sa blancheur.
 */

export type EarthTheme = 'light' | 'dark';
/** Variante des tuiles : la Terre dessinée (clair ou sombre), ou la photo d'origine (Satellite). */
export type EarthStyle = EarthTheme | 'photo';

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8';
const gibsUrl = (z: number | string, x: number | string, y: number | string) => `${GIBS}/${z}/${y}/${x}.jpeg`;

/**
 * Prépare les images de la Terre entière avant d'y arriver (cache du navigateur, gardées 3 jours par la NASA) :
 * les tuiles du niveau qu'il faudra, sur la face visible, de la plus proche du centre à la plus lointaine.
 */
export function prefetchEarth(center: [number, number], zooms: number[], parallel = 6): void {
  const rad = Math.PI / 180;
  const list: { url: string; d: number }[] = [];
  for (const z of zooms) {
    const n = 2 ** z;
    for (let y = 0; y < n; y++) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) / rad;
      for (let x = 0; x < n; x++) {
        const lng = ((x + 0.5) / n) * 360 - 180;
        const cos =
          Math.sin(center[1] * rad) * Math.sin(lat * rad) + Math.cos(center[1] * rad) * Math.cos(lat * rad) * Math.cos((lng - center[0]) * rad);
        const d = Math.acos(Math.max(-1, Math.min(1, cos))) / rad;
        if (d < 100) list.push({ url: gibsUrl(z, x, y), d: d + z * 1000 });
      }
    }
  }
  list.sort((a, b) => a.d - b.d);
  let i = 0;
  const next = (): void => {
    const job = list[i++];
    if (job) void fetch(job.url).catch(() => undefined).finally(next);
  };
  for (let k = 0; k < parallel; k++) next();
}

/** Tuiles du globe : terre://light|dark|photo/{z}/{x}/{y}. */
export const EARTH_PROTOCOL = 'terre';
export const earthTiles = (style: EarthStyle) => `${EARTH_PROTOCOL}://${style}/{z}/{x}/{y}`;

type Stop = [number, string];
interface EarthPalette {
  /** Eau, de l'abysse (0) aux hauts-fonds (1). */
  water: Stop[];
  /** Terres selon leur clarté sur l'image d'origine : forêt dense, prairie, steppe, désert. */
  land: Stop[];
  ice: string;
}

export const EARTH_PALETTES: Record<EarthTheme, EarthPalette> = {
  // Relevé sur Plans en sombre : océans bleu nuit, terres vert d'eau, déserts olive, glaces gris bleuté.
  dark: {
    water: [
      [0, '#000A22'],
      [0.35, '#000F2D'],
      [0.55, '#04163A'],
      [0.8, '#0B1F49'],
      [1, '#1A3D62'],
    ],
    land: [
      [0.08, '#09686A'],
      [0.14, '#136B69'],
      [0.24, '#287365'],
      [0.34, '#357865'],
      [0.48, '#4B7662'],
      [0.62, '#5E6D5A'],
      [0.74, '#67685A'],
    ],
    ice: '#6C80A2',
  },
  // En clair : la même Terre, plus lumineuse ; les hauts-fonds rejoignent l'eau du plan.
  light: {
    water: [
      [0, '#3F74C2'],
      [0.35, '#4A82CE'],
      [0.55, '#5D93D8'],
      [0.8, '#86B6E8'],
      [1, '#A9D2F0'],
    ],
    land: [
      [0.08, '#74B996'],
      [0.14, '#83C29B'],
      [0.24, '#9BCDA1'],
      [0.34, '#B0D6A5'],
      [0.48, '#CADCAD'],
      [0.62, '#DFDBB7'],
      [0.74, '#E8DFC2'],
    ],
    ice: '#F2F5F9',
  },
};

/**
 * Couleurs unies de la Terre dessinée (prairie, océan profond) : le plan les prend vu de loin, le temps que les
 * images arrivent ; le globe ne s'affiche jamais en morceaux.
 */
export const EARTH_FLAT: Record<EarthTheme, { land: string; ocean: string }> = {
  dark: { land: EARTH_PALETTES.dark.land[2][1], ocean: EARTH_PALETTES.dark.water[1][1] },
  light: { land: EARTH_PALETTES.light.land[2][1], ocean: EARTH_PALETTES.light.water[1][1] },
};

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));


/** Table de 256 couleurs (r, g, b à la suite) interpolées entre les paliers. */
function lut(stops: Stop[]): Uint8Array {
  const out = new Uint8Array(256 * 3);
  const rgb = stops.map(([, c]) => hex(c));
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 1 && t > stops[k + 1][0]) k++;
    const a = stops[k][0];
    const b = stops[Math.min(k + 1, stops.length - 1)][0];
    const f = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
    const ca = rgb[k];
    const cb = rgb[Math.min(k + 1, stops.length - 1)];
    for (let j = 0; j < 3; j++) out[i * 3 + j] = Math.round(ca[j] + (cb[j] - ca[j]) * f);
  }
  return out;
}

const luts = new Map<EarthTheme, { water: Uint8Array; land: Uint8Array; ice: number[] }>();
function lutsOf(theme: EarthTheme) {
  let l = luts.get(theme);
  if (!l) {
    const p = EARTH_PALETTES[theme];
    luts.set(theme, (l = { water: lut(p.water), land: lut(p.land), ice: hex(p.ice) }));
  }
  return l;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Recolore une image Blue Marble (RGBA) à la manière de Plans. */
export function gradePixels(d: Uint8ClampedArray, theme: EarthTheme): void {
  const { water, land, ice } = lutsOf(theme);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const mx = r > g ? r : g;
    const hi = mx > b ? mx : b;
    const lo = r < g ? (r < b ? r : b) : g < b ? g : b;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    // Eau : le bleu domine nettement (océans, mers) ; les lacs sont presque noirs sur l'image d'origine.
    let w = smooth(4, 14, b - mx);
    if (b >= mx && lum < 15) w = Math.max(w, smooth(15, 7, lum));
    // Profondeur lue dans le bleu : abysses sombres, plateaux continentaux plus clairs.
    const wi = Math.min(255, Math.max(0, Math.round(((b - 22) * 255) / 120))) * 3;
    const li = Math.round(lum) * 3;
    let lr = land[li];
    let lg = land[li + 1];
    let lb = land[li + 2];
    // Glace : très claire et sans couleur (le désert, lui, est clair mais coloré).
    const k = smooth(178, 224, lum) * (1 - smooth(26, 56, hi - lo));
    if (k > 0) {
      lr += (ice[0] - lr) * k;
      lg += (ice[1] - lg) * k;
      lb += (ice[2] - lb) * k;
    }
    d[i] = lr + (water[wi] - lr) * w;
    d[i + 1] = lg + (water[wi + 1] - lg) * w;
    d[i + 2] = lb + (water[wi + 2] - lb) * w;
  }
}

/** Couleur des calottes polaires : l'océan Arctique au nord, la glace de l'Antarctique au sud. */
function capColors(style: EarthStyle): { north: number[]; south: number[] } {
  if (style === 'photo') return { north: hex('#08183F'), south: hex('#ECEDF2') };
  const { water, ice } = lutsOf(style);
  const i = 118 * 3;
  return { north: [water[i], water[i + 1], water[i + 2]], south: ice };
}

/**
 * Au-delà de 85° de latitude, MapLibre étire la dernière ligne de pixels jusqu'au pôle : la moindre nuance y
 * dessine un éventail. Les dernières lignes des tuiles du bord sont fondues vers une couleur unie, la calotte
 * devient lisse.
 */
export function smoothPoles(d: Uint8ClampedArray, w: number, h: number, edge: 'north' | 'south', color: number[]): void {
  const k = Math.max(4, Math.round(h * 0.03));
  for (let row = 0; row < k; row++) {
    const t = 1 - smooth(k * 0.35, k, row);
    const y = edge === 'north' ? row : h - 1 - row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] += (color[0] - d[i]) * t;
      d[i + 1] += (color[1] - d[i + 1]) * t;
      d[i + 2] += (color[2] - d[i + 2]) * t;
    }
  }
}

/** Une tuile NASA : le serveur a parfois un raté passager ; deux nouvelles tentatives évitent un trou dans le globe. */
async function fetchTile(url: string, signal: AbortSignal): Promise<Blob> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 350 * 3 ** (attempt - 1)));
    if (signal.aborted) break;
    try {
      const res = await fetch(url, { signal });
      if (res.ok) return await res.blob();
      last = new Error(`Terre : ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      last = e;
      if (signal.aborted) break;
    }
  }
  throw last ?? new Error('Terre : requête annulée');
}

let registered = false;
/** Les tuiles terre:// : l'image NASA est chargée, recolorée, puis remise à la carte. */
export function registerEarth(addProtocol: (name: string, load: AddProtocolAction) => void): void {
  if (registered) return;
  registered = true;
  addProtocol(EARTH_PROTOCOL, async (params, abort) => {
    const m = /^terre:\/\/(light|dark|photo)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`Tuile inconnue : ${params.url}`);
    const [, style, z, x, y] = m as unknown as [string, EarthStyle, string, string, string];
    const src = await createImageBitmap(await fetchTile(gibsUrl(z, x, y), abort.signal));
    const { width: w, height: h } = src;
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.drawImage(src, 0, 0);
    src.close();
    const img = ctx.getImageData(0, 0, w, h);
    if (style !== 'photo') gradePixels(img.data, style);
    const last = 2 ** Number(z) - 1;
    const caps = capColors(style);
    if (Number(y) === 0) smoothPoles(img.data, w, h, 'north', caps.north);
    if (Number(y) === last) smoothPoles(img.data, w, h, 'south', caps.south);
    ctx.putImageData(img, 0, 0);
    return { data: await createImageBitmap(canvas) };
  });
}

/* ---------- Repères du globe, comme dans Plans ---------- */

const TROPIC = 23.4368;
const POLAR = 66.5632;

/** Équateur, tropiques et cercles polaires (un point tous les 2 degrés pour épouser la courbe du globe). */
export function graticule(): FeatureCollection<LineString> {
  const line = (lat: number, name: string, kind: 'equator' | 'tropic' | 'polar') => ({
    type: 'Feature' as const,
    properties: { name, kind },
    geometry: { type: 'LineString' as const, coordinates: Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]) },
  });
  return {
    type: 'FeatureCollection',
    features: [
      line(0, 'Équateur', 'equator'),
      line(TROPIC, 'Tropique du Cancer', 'tropic'),
      line(-TROPIC, 'Tropique du Capricorne', 'tropic'),
      line(POLAR, 'Cercle polaire arctique', 'polar'),
      line(-POLAR, 'Cercle polaire antarctique', 'polar'),
    ],
  };
}

/**
 * Continents et océans : les tuiles n'ont ni l'océan Indien, ni l'Arctique, ni l'Austral, et placent mal les
 * continents. Grandes villes : les tuiles n'en ont pas pour la Terre entière (rang 1 : les plus grandes).
 */
const LABELS: ['continent' | 'ocean' | 'city', string, number, number, number?][] = [
  ['continent', 'Amérique\ndu Nord', -99, 47],
  ['continent', 'Amérique\ndu Sud', -59, -13],
  ['continent', 'Europe', 21, 55],
  ['continent', 'Afrique', 19, 7],
  ['continent', 'Asie', 92, 48],
  ['continent', 'Océanie', 134, -24],
  ['continent', 'Antarctique', 30, -80],
  ['ocean', 'Océan\nAtlantique\nnord', -40, 33],
  ['ocean', 'Océan\nAtlantique\nsud', -17, -27],
  ['ocean', 'Océan\nPacifique\nnord', -148, 30],
  ['ocean', 'Océan\nPacifique\nnord', 165, 28],
  ['ocean', 'Océan\nPacifique\nsud', -128, -30],
  ['ocean', 'Océan\nPacifique\nsud', -176, -34],
  ['ocean', 'Océan\nIndien', 78, -22],
  ['ocean', 'Océan\nArctique', 40, 84.5],
  ['ocean', 'Océan\nAustral', 60, -62],
  ['city', 'Paris', 2.35, 48.86, 1],
  ['city', 'Londres', -0.13, 51.51, 1],
  ['city', 'Madrid', -3.7, 40.42, 2],
  ['city', 'Rome', 12.5, 41.9, 1],
  ['city', 'Berlin', 13.4, 52.52, 2],
  ['city', 'Stockholm', 18.07, 59.33, 2],
  ['city', 'Moscou', 37.62, 55.75, 1],
  ['city', 'Istanbul', 28.98, 41.01, 1],
  ['city', 'Le Caire', 31.24, 30.04, 1],
  ['city', 'Lagos', 3.38, 6.52, 1],
  ['city', 'Dakar', -17.45, 14.69, 2],
  ['city', 'Kinshasa', 15.31, -4.32, 2],
  ['city', 'Nairobi', 36.82, -1.29, 1],
  ['city', 'Johannesburg', 28.05, -26.2, 2],
  ['city', 'Le Cap', 18.42, -33.92, 1],
  ['city', 'Riyad', 46.72, 24.69, 1],
  ['city', 'Dubaï', 55.27, 25.2, 2],
  ['city', 'Téhéran', 51.39, 35.69, 2],
  ['city', 'Mumbai', 72.88, 19.08, 1],
  ['city', 'New Delhi', 77.21, 28.61, 1],
  ['city', 'Calcutta', 88.36, 22.57, 1],
  ['city', 'Bangkok', 100.5, 13.76, 2],
  ['city', 'Singapour', 103.82, 1.35, 1],
  ['city', 'Jakarta', 106.85, -6.21, 1],
  ['city', 'Pékin', 116.4, 39.9, 1],
  ['city', 'Shanghaï', 121.47, 31.23, 1],
  ['city', 'Hong Kong', 114.17, 22.32, 1],
  ['city', 'Séoul', 126.98, 37.57, 2],
  ['city', 'Tokyo', 139.69, 35.69, 1],
  ['city', 'Sydney', 151.21, -33.87, 1],
  ['city', 'Melbourne', 144.96, -37.81, 2],
  ['city', 'New York', -74.01, 40.71, 1],
  ['city', 'Washington', -77.04, 38.91, 1],
  ['city', 'Montréal', -73.57, 45.5, 2],
  ['city', 'Toronto', -79.38, 43.65, 2],
  ['city', 'Chicago', -87.63, 41.88, 2],
  ['city', 'Houston', -95.37, 29.76, 2],
  ['city', 'Los Angeles', -118.24, 34.05, 1],
  ['city', 'San Francisco', -122.42, 37.77, 2],
  ['city', 'Vancouver', -123.12, 49.28, 2],
  ['city', 'Mexico', -99.13, 19.43, 1],
  ['city', 'La Havane', -82.37, 23.11, 2],
  ['city', 'Bogota', -74.07, 4.71, 1],
  ['city', 'Lima', -77.04, -12.05, 1],
  ['city', 'Santiago', -70.67, -33.45, 1],
  ['city', 'Buenos Aires', -58.38, -34.6, 1],
  ['city', 'São Paulo', -46.63, -23.55, 1],
  ['city', 'Rio de Janeiro', -43.17, -22.91, 1],
];

export function globeLabels(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: LABELS.map(([kind, name, lng, lat, rank], id) => ({
      type: 'Feature',
      id,
      properties: { kind, name, rank: rank ?? 0 },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    })),
  };
}

/** Point des villes sur le globe : un petit anneau, comme dans Plans. */
export function cityDot(variant: 'light' | 'dark'): ImageData {
  const s = 2;
  const size = 9 * s;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 3.1 * s, 0, Math.PI * 2);
  ctx.fillStyle = variant === 'dark' ? 'rgba(0,0,0,0.38)' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.35 * s;
  ctx.strokeStyle = variant === 'dark' ? 'rgba(255,255,255,0.95)' : 'rgba(44,44,48,0.9)';
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}
