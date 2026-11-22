import type { LngLat } from './types';
import { latToY, lonToX } from './environment';
import { ORTHO_TILES } from './mapstyle';
import type { ZoneKind } from './zones';

/*
 * Photos de la fiche d'un lieu : la vue du ciel (photos aériennes de l'IGN, tournée pour qu'une piste soit à
 * l'horizontale) et une photo prise au sol tout près, tournée vers le lieu (Panoramax, les photos de rue
 * libres d'OpenStreetMap France), ou une belle photo du lieu sur Wikimedia Commons quand il y en a une.
 */

/** Photos aériennes de l'IGN : France métropolitaine et Corse. */
const ORTHO_AREA: [number, number, number, number] = [-5.8, 41.2, 9.9, 51.3];
export const hasAerial = (c: LngLat) => c[0] >= ORTHO_AREA[0] && c[0] <= ORTHO_AREA[2] && c[1] >= ORTHO_AREA[1] && c[1] <= ORTHO_AREA[3];

export interface AerialTile {
  src: string;
  left: number;
  top: number;
  size: number;
}

/**
 * Tuiles de la vue du ciel pour un cadre de `w` × `h` px montrant `across` mètres de large autour de `c`,
 * assez nettes pour un écran Retina, et assez nombreuses pour couvrir le cadre même tourné.
 */
export function aerialTiles(c: LngLat, across: number, w: number, h: number): AerialTile[] {
  if (!w || !h) return [];
  const mpp = across / w;
  const zf = Math.log2((40075016 * Math.cos((c[1] * Math.PI) / 180)) / (256 * mpp));
  const z = Math.max(10, Math.min(19, Math.round(zf + 1)));
  const s = 256 * 2 ** (zf - z);
  const n = 2 ** z;
  const X = lonToX(c[0]) * n;
  const Y = latToY(c[1]) * n;
  const R = Math.hypot(w, h) / 2 + 2;
  const out: AerialTile[] = [];
  for (let i = Math.floor(X - R / s); i <= Math.floor(X + R / s); i++)
    for (let j = Math.floor(Y - R / s); j <= Math.floor(Y + R / s); j++) {
      if (j < 0 || j >= n) continue;
      const ii = ((i % n) + n) % n;
      out.push({ src: ORTHO_TILES.replace('{z}', String(z)).replace('{x}', String(ii)).replace('{y}', String(j)), left: w / 2 + (i - X) * s, top: h / 2 + (j - Y) * s, size: s });
    }
  return out;
}

export interface GroundPhoto {
  /** image affichée (et sa version grande) */
  src: string;
  full: string;
  credit: string;
  /** page de la photo */
  link: string;
  /** photo à 360° : position (0 à 1) du lieu dans l'image, pour la cadrer dessus */
  pano?: number;
}

const cache = new Map<string, Promise<GroundPhoto | null>>();

/** Une photo prise au sol près d'un lieu, la meilleure trouvée (ou rien). Gardée en mémoire. */
export function groundPhoto(c: LngLat, kind: ZoneKind | 'place', name: string | null): Promise<GroundPhoto | null> {
  const key = `${c[0].toFixed(5)}:${c[1].toFixed(5)}`;
  let p = cache.get(key);
  if (!p) {
    p = findGround(c, kind, name).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

async function findGround(c: LngLat, kind: ZoneKind | 'place', name: string | null): Promise<GroundPhoto | null> {
  // Une vraie photo du lieu (stade, parc, lac) d'abord, si Wikimedia Commons en a une tout près.
  if (kind !== 'fountain' && kind !== 'toilets' && kind !== 'place') {
    const w = await commons(c, kind, name).catch(() => null);
    if (w) return w;
  }
  return panoramax(c, kind);
}

const KEYWORDS: Partial<Record<ZoneKind, RegExp>> = {
  track: /stade|stadium|piste|athl|track|complexe sportif|sports? (centre|center|ground)/i,
  park: /parc|park|jardin|garden|square|coul[ée]e|prairie/i,
  water: /lac|[ée]tang|lake|pond|rivi[èe]re|river|loire|erdre|s[èe]vre|canal|bord|quai|plan d.eau/i,
  wood: /bois|for[êe]t|forest|wood/i,
};

async function commons(c: LngLat, kind: ZoneKind, name: string | null): Promise<GroundPhoto | null> {
  const re = KEYWORDS[kind];
  if (!re) return null;
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch' +
    `&ggscoord=${c[1].toFixed(6)}|${c[0].toFixed(6)}&ggsradius=${kind === 'track' ? 350 : 500}&ggsnamespace=6&ggslimit=40` +
    '&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=900&iiextmetadatafilter=Artist|LicenseShortName';
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = (await r.json()) as { query?: { pages?: Record<string, { title: string; imageinfo?: { thumburl?: string; descriptionurl?: string; width?: number; height?: number; extmetadata?: Record<string, { value?: string }> }[] }> } };
  const words = (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length > 3 && !['stade', 'parc', 'piste', 'jardin', 'complexe', 'sportif'].includes(x));
  let best: { score: number; ph: GroundPhoto } | null = null;
  for (const p of Object.values(d.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl || !/\.(jpe?g|png|webp)$/i.test(p.title)) continue;
    // Paysage seulement, et pas les plaques de rue, cartes ou plans.
    if ((ii.width ?? 0) < (ii.height ?? 1) * 1.15 || /plaque|carte|plan |map|logo|blason|panneau|sign/i.test(p.title)) continue;
    const title = p.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const hit = re.test(p.title) ? 2 : 0;
    const named = words.some((w) => title.includes(w)) ? 3 : 0;
    const score = hit + named;
    if (score < 2) continue;
    const m = ii.extmetadata ?? {};
    const artist = (m.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 40);
    const lic = (m.LicenseShortName?.value ?? '').trim();
    const ph: GroundPhoto = { src: ii.thumburl, full: ii.thumburl, credit: [artist, lic, 'Wikimedia Commons'].filter(Boolean).join(' · '), link: ii.descriptionurl ?? 'https://commons.wikimedia.org' };
    if (!best || score > best.score) best = { score, ph };
  }
  return best?.ph ?? null;
}

interface PxFeature {
  id: string;
  geometry: { coordinates: LngLat };
  assets: { sd?: { href: string }; thumb?: { href: string }; hd?: { href: string } };
  providers?: { name: string }[];
  properties: { 'view:azimuth'?: number; datetime?: string; license?: string; 'pers:interior_orientation'?: { field_of_view?: number } };
  collection?: string;
}

async function panoramax(c: LngLat, kind: ZoneKind | 'place'): Promise<GroundPhoto | null> {
  const far = kind === 'track' || kind === 'park' || kind === 'water' || kind === 'wood' ? 160 : 60;
  const url = `https://api.panoramax.xyz/api/search?place_position=${c[0].toFixed(6)},${c[1].toFixed(6)}&place_distance=${kind === 'track' ? 20 : 3}-${far}&place_fov_tolerance=40&limit=30`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = (await r.json()) as { features?: PxFeature[] };
  const kx = 111320 * Math.cos((c[1] * Math.PI) / 180);
  let best: { score: number; f: PxFeature; pano: number | undefined } | null = null;
  for (const f of d.features ?? []) {
    const [x, y] = f.geometry.coordinates;
    const dx = (c[0] - x) * kx;
    const dy = (c[1] - y) * 110540;
    const dist = Math.hypot(dx, dy);
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    const az = f.properties['view:azimuth'] ?? 0;
    const off = ((bearing - az + 540) % 360) - 180;
    const pano = (f.properties['pers:interior_orientation']?.field_of_view ?? 0) >= 359;
    if (!pano && Math.abs(off) > 40) continue;
    // Ni trop près (on ne voit que le sol), ni trop loin ; les photos récentes d'abord.
    const ideal = kind === 'track' ? 70 : kind === 'fountain' || kind === 'toilets' || kind === 'place' ? 12 : 50;
    const age = (Date.now() - Date.parse(f.properties.datetime ?? '2015-01-01')) / (365 * 864e5);
    const score = -Math.abs(dist - ideal) / ideal - age * 0.15 - (pano ? 0 : Math.abs(off) / 90);
    if (!best || score > best.score) best = { score, f, pano: pano ? (((0.5 + off / 360) % 1) + 1) % 1 : undefined };
  }
  if (!best) return null;
  const f = best.f;
  const who = f.providers?.[0]?.name ?? '';
  const lic = f.properties.license === 'etalab-2.0' ? 'Licence ouverte' : (f.properties.license ?? '').replace(/-4\.0$/, '').replace(/-/g, ' ');
  const src = best.pano != null ? f.assets.sd?.href : f.assets.thumb?.href;
  if (!src) return null;
  return {
    src,
    full: f.assets.sd?.href ?? src,
    credit: [who, lic, 'Panoramax'].filter(Boolean).join(' · '),
    link: `https://api.panoramax.xyz/#focus=pic&pic=${f.id}`,
    pano: best.pano,
  };
}
