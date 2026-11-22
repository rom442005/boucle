import type { FilterSpecification } from 'maplibre-gl';
import type { VectorTile } from '@mapbox/vector-tile';
import type { IconName } from './icons';
import type { LngLat } from './types';
import { latToY, loadTile, lonToX } from './environment';

/*
 * Lieux à mettre en valeur sur la carte, depuis la petite barre sous la météo : pistes d'athlétisme, parcs,
 * bords de l'eau, forêts, fontaines, toilettes. Ils sont déjà dans les tuiles de la carte (OpenFreeMap, schéma
 * OpenMapTiles) : rien à télécharger de plus, le surlignage est immédiat.
 *
 * Les tuiles rangent sous « piste » tout ce qui est leisure=track : hippodromes, karting, BMX, roller… sans dire
 * le sport. Une piste d'athlétisme se reconnaît à sa forme : un anneau ovale de 80 à 230 m de long (piste de
 * 250 à 400 m), bien rempli (sans les tracés sinueux), étalonné sur les 53 pistes autour de Nantes. Les parcs
 * sont les parcs publics (pas les jardins privés).
 */
export type ZoneKind = 'track' | 'park' | 'water' | 'wood' | 'fountain' | 'toilets';

export interface ZoneDef {
  label: string;
  /** nom pour les lecteurs d'écran et la bulle d'aide */
  long: string;
  /** un lieu de ce genre, quand il n'a pas de nom */
  one: string;
  emoji: string;
  /** icône de la barre des lieux (et sa version pleine quand le lieu est montré) */
  icon: IconName;
  color: string;
  /** surface colorée, piste dessinée en anneau, ou simple repère */
  look: 'area' | 'track' | 'pin';
  /** zoom à partir duquel les tuiles les contiennent */
  minZoom: number;
  /** couches des tuiles et filtre */
  layer: 'landuse' | 'landcover' | 'water' | 'poi';
  filter: FilterSpecification;
  /** surface minimale (m²) pour être mis au point (les petits bouts ne sont qu'en couleur) */
  minArea?: number;
}

const PARKS = ['park', 'recreation_ground', 'village_green'];

export const ZONES: Record<ZoneKind, ZoneDef> = {
  track: {
    label: 'Pistes',
    long: 'Pistes d’athlétisme',
    one: 'Piste d’athlétisme',
    emoji: '🏟️',
    icon: 'track',
    color: '#FF6A3D',
    look: 'track',
    minZoom: 12,
    layer: 'landuse',
    filter: ['==', ['get', 'class'], 'track'],
  },
  park: {
    label: 'Parcs',
    long: 'Parcs et jardins publics',
    one: 'Parc',
    emoji: '🌳',
    icon: 'park',
    color: '#34C759',
    look: 'area',
    minZoom: 0,
    layer: 'landcover',
    filter: ['all', ['==', ['get', 'class'], 'grass'], ['in', ['get', 'subclass'], ['literal', PARKS]]],
    minArea: 8000,
  },
  water: {
    label: 'Eau',
    long: 'Lacs, étangs et rivières',
    one: 'Plan d’eau',
    emoji: '💧',
    icon: 'waves',
    color: '#0A84FF',
    look: 'area',
    minZoom: 0,
    layer: 'water',
    filter: ['all', ['!=', ['get', 'class'], 'swimming_pool'], ['!=', ['get', 'brunnel'], 'tunnel']],
    minArea: 15000,
  },
  wood: {
    label: 'Forêts',
    long: 'Bois et forêts',
    one: 'Bois',
    emoji: '🌲',
    icon: 'tree',
    color: '#1FA463',
    look: 'area',
    minZoom: 0,
    layer: 'landcover',
    filter: ['==', ['get', 'class'], 'wood'],
    minArea: 30000,
  },
  fountain: {
    label: 'Fontaines',
    long: 'Fontaines d’eau potable',
    one: 'Fontaine d’eau potable',
    emoji: '🚰',
    icon: 'drop',
    color: '#5AC8FA',
    look: 'pin',
    minZoom: 14,
    layer: 'poi',
    filter: ['==', ['get', 'class'], 'drinking_water'],
  },
  toilets: {
    label: 'Toilettes',
    long: 'Toilettes publiques',
    one: 'Toilettes',
    emoji: '🚻',
    icon: 'toilet',
    color: '#AF52DE',
    look: 'pin',
    minZoom: 14,
    layer: 'poi',
    filter: ['==', ['get', 'class'], 'toilets'],
  },
};

export const ZONE_ORDER: ZoneKind[] = ['track', 'park', 'water', 'wood', 'fountain', 'toilets'];

/* ------------------------------ Géométrie des lieux ------------------------------ */

type Ring = [number, number][];

const metersAround = (c0: [number, number]) => {
  const kx = 111320 * Math.cos((c0[1] * Math.PI) / 180);
  const ky = 110540;
  return (p: [number, number]): [number, number] => [(p[0] - c0[0]) * kx, (p[1] - c0[1]) * ky];
};

function ringArea(r: [number, number][]): number {
  let a = 0;
  for (let k = 1; k < r.length; k++) a += r[k - 1][0] * r[k][1] - r[k][0] * r[k - 1][1];
  return Math.abs(a) / 2;
}

/** Longueur, largeur (rectangle orienté le plus serré) et remplissage d'un contour, en mètres. */
export function shapeOf(ring: Ring): { L: number; W: number; area: number; fill: number } {
  const P = ring.map(metersAround(ring[0]));
  const area = ringArea(P);
  let best = { ar: Infinity, L: 0, W: 0 };
  for (let a = 0; a < 180; a += 3) {
    const c = Math.cos((a * Math.PI) / 180);
    const s = Math.sin((a * Math.PI) / 180);
    let mnx = Infinity;
    let mxx = -Infinity;
    let mny = Infinity;
    let mxy = -Infinity;
    for (const [px, py] of P) {
      const u = px * c + py * s;
      const v = -px * s + py * c;
      if (u < mnx) mnx = u;
      if (u > mxx) mxx = u;
      if (v < mny) mny = v;
      if (v > mxy) mxy = v;
    }
    const ar = (mxx - mnx) * (mxy - mny);
    if (ar < best.ar) best = { ar, L: Math.max(mxx - mnx, mxy - mny), W: Math.min(mxx - mnx, mxy - mny) };
  }
  return { L: best.L, W: best.W, area, fill: best.ar > 0 ? area / best.ar : 0 };
}

/**
 * Une piste d'athlétisme : anneau ovale de 80 à 230 m de long et 40 à 115 m de large, rempli à plus de 70 %
 * de son rectangle (un ovale l'est à 87-91 %). Écarte hippodromes (plus de 500 m), circuits sinueux de karting
 * ou de BMX (remplis à 20-30 %) et petites pistes de roller.
 */
export function isAthleticsTrack(ring: Ring): boolean {
  if (ring.length < 5) return false;
  const { L, W, fill } = shapeOf(ring);
  return L >= 80 && L <= 230 && W >= 40 && W <= 115 && L / W <= 2.6 && fill >= 0.7;
}

/** Centre approché d'une géométrie (milieu de son emprise) : de quoi poser un repère sur un petit lieu. */
export function centerOf(g: GeoJSON.Geometry): [number, number] | null {
  const b = boundsOf(g);
  return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

/** Emprise d'une géométrie [ouest, sud, est, nord]. */
export function boundsOf(g: GeoJSON.Geometry): [number, number, number, number] | null {
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
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/** Un même lieu, coupé entre plusieurs tuiles, ne compte qu'une fois (grille d'une cinquantaine de mètres). */
export const zoneKey = (kind: ZoneKind, c: [number, number]) => `${kind}:${Math.round(c[0] * 1600)}:${Math.round(c[1] * 2200)}`;

/** Contours extérieurs d'un polygone ou multipolygone (avec leurs trous), en coordonnées. */
export function polygonsOf(g: GeoJSON.Geometry): Ring[][] {
  if (g.type === 'Polygon') return [g.coordinates as Ring[]];
  if (g.type === 'MultiPolygon') return g.coordinates as Ring[][];
  return [];
}

/* ------------------------------ Lieux à mettre au point ------------------------------ */

/** Un lieu candidat à la mise au point : son repère, son emprise, sa taille, son nom s'il en a un. */
export interface ZonePlace {
  kind: ZoneKind;
  coord: LngLat;
  bounds: [number, number, number, number];
  area: number;
  name: string | null;
  /** piste : son anneau, pour le dessiner */
  shape?: GeoJSON.Polygon;
  /** dépasse du carré de sa tuile (peut-être coupé par le bord) */
  edge?: boolean;
}

/** Noms posés près des lieux (stades, parcs, lacs) : pour nommer une piste ou un parc dans la bulle. */
interface Label {
  coord: LngLat;
  name: string;
  cls: string;
}

/** Lieux d'un genre dans une tuile (coordonnées géographiques), avec les noms des alentours. */
export function placesInTile(tile: VectorTile, x: number, y: number, z: number, kind: ZoneKind): { places: ZonePlace[]; labels: Label[] } {
  const def = ZONES[kind];
  const places: ZonePlace[] = [];
  const labels: Label[] = [];
  const layer = tile.layers[def.layer];
  const pois = tile.layers.poi;
  if (pois) {
    for (let i = 0; i < pois.length; i++) {
      const f = pois.feature(i);
      const name = f.properties['name:fr'] ?? f.properties.name;
      const cls = String(f.properties.class ?? '');
      if (typeof name !== 'string' || !name || !['stadium', 'sports_centre', 'pitch', 'park', 'garden'].includes(cls)) continue;
      const g = f.toGeoJSON(x, y, z).geometry;
      const c = centerOf(g);
      if (c) labels.push({ coord: c, name, cls });
    }
  }
  const wn = tile.layers.water_name;
  if (wn && kind === 'water') {
    for (let i = 0; i < wn.length; i++) {
      const f = wn.feature(i);
      const name = f.properties['name:fr'] ?? f.properties.name;
      const c = centerOf(f.toGeoJSON(x, y, z).geometry);
      if (typeof name === 'string' && name && c) labels.push({ coord: c, name, cls: 'water' });
    }
  }
  if (!layer) return { places, labels };
  const n2 = 2 ** z;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n2))) * 180) / Math.PI;
  const core: [number, number, number, number] = [(x / n2) * 360 - 180, lat(y + 1), ((x + 1) / n2) * 360 - 180, lat(y)];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const p = f.properties;
    if (!matches(kind, p)) continue;
    const g = f.toGeoJSON(x, y, z).geometry;
    if (def.look === 'pin') {
      if (g.type !== 'Point') continue;
      const name = p['name:fr'] ?? p.name;
      places.push({ kind, coord: g.coordinates as LngLat, bounds: [g.coordinates[0], g.coordinates[1], g.coordinates[0], g.coordinates[1]], area: 0, name: typeof name === 'string' && name ? name : null });
      continue;
    }
    for (const poly of polygonsOf(g)) {
      const outer = poly[0];
      if (!outer || outer.length < 4) continue;
      const area = ringArea(outer.map(metersAround(outer[0])));
      const b = boundsOf({ type: 'Polygon', coordinates: [outer] })!;
      // Un lieu qui dépasse du carré de la tuile peut y être coupé : on le recollera avec son voisin.
      const edge = b[0] < core[0] || b[1] < core[1] || b[2] > core[2] || b[3] > core[3];
      places.push({
        kind,
        coord: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2],
        bounds: b,
        area,
        name: null,
        ...(kind === 'track' ? { shape: { type: 'Polygon', coordinates: poly } as GeoJSON.Polygon, edge } : {}),
      });
    }
  }
  return { places, labels };
}

function matches(kind: ZoneKind, p: Record<string, unknown>): boolean {
  switch (kind) {
    case 'track':
      return p.class === 'track';
    case 'park':
      return p.class === 'grass' && PARKS.includes(String(p.subclass ?? ''));
    case 'water':
      return p.class !== 'swimming_pool' && p.brunnel !== 'tunnel';
    case 'wood':
      return p.class === 'wood';
    case 'fountain':
      return p.class === 'drinking_water';
    case 'toilets':
      return p.class === 'toilets';
  }
}

/**
 * Regroupe les lieux trouvés dans plusieurs tuiles (un lieu coupé par un bord de tuile ne compte qu'une fois,
 * les morceaux d'un grand parc se rejoignent), les nomme d'après les noms proches, et les trie du plus proche
 * au plus lointain du point de référence. Les petits bouts de parc ou d'eau sont laissés de côté.
 */
export function rankPlaces(found: { places: ZonePlace[]; labels: Label[] }[], kind: ZoneKind, ref: LngLat): ZonePlace[] {
  const def = ZONES[kind];
  const labels = found.flatMap((f) => f.labels);
  const merged = new Map<string, ZonePlace>();
  let all = found.flatMap((f) => f.places);
  if (kind === 'track') all = athleticsTracks(all);
  for (const p of all) {
    // Une piste ou un repère : par position. Une surface : par emprise qui se chevauche (même lieu, autre tuile).
    if (def.look !== 'area') {
      const k = zoneKey(kind, p.coord);
      if (!merged.has(k)) merged.set(k, p);
      continue;
    }
    let joined = false;
    for (const [k, q] of merged) {
      const touch = p.bounds[0] <= q.bounds[2] + 1e-4 && p.bounds[2] >= q.bounds[0] - 1e-4 && p.bounds[1] <= q.bounds[3] + 1e-4 && p.bounds[3] >= q.bounds[1] - 1e-4;
      const sameSpot = Math.abs(p.coord[0] - q.coord[0]) < 1e-6 && Math.abs(p.coord[1] - q.coord[1]) < 1e-6;
      if (sameSpot || (touch && Math.abs(p.area - q.area) / Math.max(p.area, q.area, 1) < 0.02)) {
        joined = true;
        break;
      }
      if (touch && onEdge(p.bounds, q.bounds)) {
        const b: [number, number, number, number] = [Math.min(p.bounds[0], q.bounds[0]), Math.min(p.bounds[1], q.bounds[1]), Math.max(p.bounds[2], q.bounds[2]), Math.max(p.bounds[3], q.bounds[3])];
        merged.set(k, { ...q, bounds: b, area: q.area + p.area, coord: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] });
        joined = true;
        break;
      }
    }
    if (!joined) merged.set(`${kind}:${merged.size}`, p);
  }
  const kx = 111320 * Math.cos((ref[1] * Math.PI) / 180);
  const dist = (a: LngLat) => Math.hypot((a[0] - ref[0]) * kx, (a[1] - ref[1]) * 110540);
  const out = [...merged.values()].filter((p) => def.look !== 'area' || p.area >= (def.minArea ?? 0));
  for (const p of out) {
    if (p.name) continue;
    // Le nom le plus proche, s'il est dans le lieu (parc, plan d'eau) ou tout près (stade d'une piste).
    let best: Label | null = null;
    let bd = Infinity;
    for (const l of labels) {
      if (kind === 'park' && l.cls !== 'park' && l.cls !== 'garden') continue;
      if (kind === 'track' && !['stadium', 'sports_centre', 'pitch'].includes(l.cls)) continue;
      if (kind === 'water' && l.cls !== 'water') continue;
      if (kind === 'wood' || def.look === 'pin') continue;
      const inside = l.coord[0] >= p.bounds[0] && l.coord[0] <= p.bounds[2] && l.coord[1] >= p.bounds[1] && l.coord[1] <= p.bounds[3];
      const d = Math.hypot((l.coord[0] - p.coord[0]) * kx, (l.coord[1] - p.coord[1]) * 110540);
      if ((inside || d < (kind === 'track' ? 220 : 120)) && d < bd) {
        bd = d;
        best = l;
      }
    }
    if (best) p.name = best.name;
  }
  return out.sort((a, b) => dist(a.coord) - dist(b.coord));
}

/**
 * Les pistes d'athlétisme parmi les pistes des tuiles. Une piste coupée par le bord d'une tuile arrive en deux
 * morceaux (chacun déborde un peu dans la tuile voisine) : les morceaux qui se chevauchent sont jugés ensemble,
 * sur l'ensemble de leurs points.
 */
function athleticsTracks(all: ZonePlace[]): ZonePlace[] {
  const out: ZonePlace[] = [];
  const edges: ZonePlace[][] = [];
  for (const p of all) {
    const ring = p.shape?.coordinates[0] as Ring | undefined;
    if (!ring) continue;
    if (!p.edge) {
      if (isAthleticsTrack(ring)) out.push(p);
      continue;
    }
    const g = edges.find((grp) => grp.some((q) => p.bounds[0] <= q.bounds[2] && p.bounds[2] >= q.bounds[0] && p.bounds[1] <= q.bounds[3] && p.bounds[3] >= q.bounds[1]));
    if (g) g.push(p);
    else edges.push([p]);
  }
  for (const grp of edges) {
    const pts = grp.flatMap((p) => p.shape!.coordinates[0] as Ring);
    const whole = grp.find((p) => isAthleticsTrack(p.shape!.coordinates[0] as Ring));
    if (whole) {
      out.push(whole);
      continue;
    }
    // Longueur et largeur de l'ensemble, remplissage du plus grand morceau (un demi-ovale l'est autant).
    const s = shapeOf(convexHull(pts));
    const fill = Math.max(...grp.map((p) => shapeOf(p.shape!.coordinates[0] as Ring).fill));
    if (s.L >= 80 && s.L <= 230 && s.W >= 40 && s.W <= 115 && s.L / s.W <= 2.6 && fill >= 0.7) {
      const big = grp.reduce((a, b) => (b.area > a.area ? b : a));
      const b: [number, number, number, number] = [Math.min(...grp.map((p) => p.bounds[0])), Math.min(...grp.map((p) => p.bounds[1])), Math.max(...grp.map((p) => p.bounds[2])), Math.max(...grp.map((p) => p.bounds[3]))];
      out.push({ ...big, bounds: b, coord: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], shape: { type: 'Polygon', coordinates: [convexHull(pts)] } });
    }
  }
  return out;
}

/** Enveloppe convexe (algorithme de la chaîne monotone), fermée. */
function convexHull(points: Ring): Ring {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Ring = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Ring = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return [...hull, hull[0]];
}

/** Deux emprises qui se touchent par un bord (un lieu coupé entre deux tuiles). */
function onEdge(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  const e = 2e-4;
  return Math.abs(a[2] - b[0]) < e || Math.abs(a[0] - b[2]) < e || Math.abs(a[3] - b[1]) < e || Math.abs(a[1] - b[3]) < e;
}

/** Zoom des tuiles lues pour chaque genre : les pistes au 13, les surfaces au 12, les fontaines et toilettes au 14. */
const TILE_ZOOM = (kind: ZoneKind) => (ZONES[kind].look === 'pin' ? 14 : kind === 'track' ? 13 : 12);

/**
 * Lieux d'un genre dans une emprise [ouest, sud, est, nord] (au plus 16 tuiles), triés du plus proche au plus
 * lointain de `ref`. Les tuiles sont gardées en mémoire : relire la même zone est immédiat.
 */
export async function findPlaces(kind: ZoneKind, bounds: [number, number, number, number], ref: LngLat, signal?: AbortSignal): Promise<ZonePlace[]> {
  let z = TILE_ZOOM(kind);
  const range = (zz: number) => {
    const n = 2 ** zz;
    return [Math.floor(lonToX(bounds[0]) * n), Math.floor(latToY(bounds[3]) * n), Math.floor(lonToX(bounds[2]) * n), Math.floor(latToY(bounds[1]) * n)];
  };
  let [x0, y0, x1, y1] = range(z);
  // Trop de tuiles : la zone se resserre autour du point de référence.
  while ((x1 - x0 + 1) * (y1 - y0 + 1) > 16) {
    const n = 2 ** z;
    const cx = Math.floor(lonToX(ref[0]) * n);
    const cy = Math.floor(latToY(ref[1]) * n);
    x0 = Math.max(x0, cx - 1);
    x1 = Math.min(x1, cx + 2);
    y0 = Math.max(y0, cy - 1);
    y1 = Math.min(y1, cy + 2);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 16) break;
    z--;
    [x0, y0, x1, y1] = range(z);
  }
  const jobs: Promise<{ places: ZonePlace[]; labels: Label[] }>[] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      jobs.push(loadTile(z, x, y, signal).then((t) => (t ? placesInTile(t, x, y, z, kind) : { places: [], labels: [] })));
  return rankPlaces(await Promise.all(jobs), kind, ref);
}

/** Emprise d'un carré de `half` mètres autour d'un point. */
export function boxAround(c: LngLat, half: number): [number, number, number, number] {
  const dx = half / (111320 * Math.cos((c[1] * Math.PI) / 180));
  const dy = half / 110540;
  return [c[0] - dx, c[1] - dy, c[0] + dx, c[1] + dy];
}

