import type { LngLat } from './types';
import { overpass } from './services';

/*
 * Découverte : les lieux emblématiques de la zone (à Nantes : le Jardin des plantes, les Machines de l'île, les
 * grues Titan, la Tour LU, la Tour Bretagne…), pour en faire des points de passage.
 *
 * Trois sources fiables, peu de requêtes par zone :
 * 1. OpenStreetMap (Overpass) : les lieux qui ont un article Wikipédia et un genre qui se visite (musée, parc,
 *    monument, grue, tour, pont…), avec leurs horaires d'ouverture ; et les lieux touristiques qui n'ont
 *    qu'une fiche Wikidata (la Tour LU). Filtré côté serveur (ni tombes ni immeubles), un seul appel pour toute
 *    la zone.
 * 2. Wikidata, seulement pour ces derniers (quelques-uns par ville), en un appel : leur article français s'il
 *    existe, sinon leur photo, leur description et le nombre de langues où ils ont un article.
 * 3. Wikipédia : 50 lieux par appel, la photo, la description et la longueur de l'article (un lieu
 *    emblématique a un long article ; les vues ne sont données que pour une dizaine de pages par appel). La
 *    photo des lieux sans article vient du même appel. Au-delà de 50 lieux, seuls ceux qui peuvent encore
 *    entrer dans la liste sont demandés, 4 appels au plus.
 * Tout est gardé sur l'appareil : la zone par cases de 0,05° (14 jours), les articles et les fiches (30 jours).
 * Revenir sur une zone déjà vue ne coûte aucune requête.
 */

export type BBox = [number, number, number, number];

export interface Spot {
  /** identifiant OpenStreetMap (n123, w123, r123) */
  id: string;
  name: string;
  coord: LngLat;
  /** emprise du lieu (o, s, e, n) : sa zone sur la carte */
  bounds: BBox | null;
  emoji: string;
  /** « Musée », « Parc »… */
  kind: string;
  /** article Wikipédia (fr) */
  wiki: string | null;
  /** horaires d'ouverture OpenStreetMap */
  hours: string | null;
  image: string | null;
  /** description courte (Wikidata) */
  desc: string | null;
  /** longueur de l'article Wikipédia (octets) : sa notoriété */
  size: number;
  score: number;
}

/** Ce qui est gardé par case de zone (avant Wikipédia). */
interface Raw {
  id: string;
  n: string;
  c: LngLat;
  b: BBox | null;
  e: string;
  k: string;
  w: number;
  wiki: string | null;
  /** fiche Wikidata, quand OpenStreetMap ne donne pas d'article français */
  q: string | null;
  h: string | null;
}

interface WikiInfo {
  t: number;
  img: string | null;
  /** longueur de l'article (octets) */
  size: number;
  desc: string | null;
}

/** Ce que Wikidata dit d'un lieu qui n'a pas d'article français dans OpenStreetMap. */
interface WdInfo {
  t: number;
  /** son article français, s'il en a un */
  fr: string | null;
  /** sa photo (nom du fichier sur Commons) */
  file: string | null;
  desc: string | null;
  /** le nombre de Wikipédias (de langues) où il a un article */
  langs: number;
}

interface Store {
  v: 1;
  cells: Record<string, { t: number; s: Raw[] }>;
  wiki: Record<string, WikiInfo>;
  wd: Record<string, WdInfo>;
}

const KEY = 'boucle.decouverte.v3';
const CELL = 0.05;
const CELL_TTL = 14 * 86400000;
const WIKI_TTL = 30 * 86400000;
/** au-delà (environ 12 km de côté), la zone est ramenée autour de son centre : une requête rapide */
const MAX_W = 0.16;
const MAX_H = 0.11;
/** le nombre de lieux de la liste */
const LIMIT = 24;
/** sans article français, chaque langue où le lieu a un article compte comme 8 ko d'article */
const PER_LANG = 8000;

let store: Store | null = null;
function load(): Store {
  if (store) return store;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Store | null;
    if (s && s.v === 1 && s.cells && s.wiki && s.wd) return (store = s);
  } catch {
    /* illisible : on repart de zéro */
  }
  return (store = { v: 1, cells: {}, wiki: {}, wd: {} });
}
function save() {
  const s = load();
  // Au plus 80 cases, 800 articles et 400 fiches : on garde les plus récents.
  const cells = Object.entries(s.cells).sort((a, b) => b[1].t - a[1].t);
  if (cells.length > 80) s.cells = Object.fromEntries(cells.slice(0, 80));
  const wiki = Object.entries(s.wiki).sort((a, b) => b[1].t - a[1].t);
  if (wiki.length > 800) s.wiki = Object.fromEntries(wiki.slice(0, 800));
  const wd = Object.entries(s.wd).sort((a, b) => b[1].t - a[1].t);
  if (wd.length > 400) s.wd = Object.fromEntries(wd.slice(0, 400));
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage plein : la découverte marche, sans mémoire */
  }
}

/* ------------------------------------ Genres ------------------------------------ */

type Tags = Record<string, string | undefined>;

/** Le genre d'un lieu (émoji, nom, poids dans le classement), ou null s'il ne se visite pas. */
export function classify(t: Tags): { e: string; k: string; w: number } | null {
  const name = t.name ?? '';
  if (/^(immeuble|maison|hôtel particulier)\b/i.test(name)) return null;
  if (/^(school|college|university|kindergarten|hospital|clinic|doctors)$/.test(t.amenity ?? '')) return null;
  if (t.railway || t.public_transport || t.shop || t.office) return null;
  // Une tombe, une plaque, un calvaire : à leur place, pas des buts de sortie.
  if (/^(tomb|memorial|wayside_shrine|wayside_cross|boundary_stone|milestone)$/.test(t.historic ?? '') && !t.tourism) return null;
  if (t.historic === 'castle' || /^château\b/i.test(name)) return { e: '🏰', k: 'Château', w: 1.3 };
  const isCrane = t.man_made === 'crane' || /^grue\b/i.test(name);
  // Une grue qui a un article est un repère de la ville (les grues Titan de Nantes, de Saint-Nazaire).
  if (isCrane) return { e: '🏗️', k: 'Grue', w: 1.3 };
  if (/^tour\b/i.test(name) && (t.building || t.man_made === 'tower')) return { e: '🏙️', k: 'Tour', w: 1.2 };
  switch (t.tourism) {
    case 'museum':
      return { e: '🏛️', k: 'Musée', w: 1.3 };
    case 'attraction':
      return { e: '✨', k: 'À voir', w: 1.35 };
    case 'theme_park':
      return { e: '🎡', k: 'Parc de loisirs', w: 1.2 };
    case 'zoo':
      return { e: '🦒', k: 'Zoo', w: 1.2 };
    case 'aquarium':
      return { e: '🐠', k: 'Aquarium', w: 1.2 };
    case 'viewpoint':
      return { e: '🌄', k: 'Point de vue', w: 1.25 };
    case 'gallery':
      return { e: '🖼️', k: 'Galerie', w: 1.05 };
    case 'artwork':
      return { e: '🎨', k: 'Œuvre', w: 1.05 };
  }
  if (t.leisure === 'park' || t.leisure === 'garden') return /jardin/i.test(name) ? { e: '🌷', k: 'Jardin', w: 1.3 } : { e: '🌳', k: 'Parc', w: 1.25 };
  if (t.leisure === 'nature_reserve') return { e: '🌿', k: 'Nature', w: 1.15 };
  if (t.historic === 'castle' || t.historic === 'manor' || t.building === 'castle') return { e: '🏰', k: 'Château', w: 1.25 };
  if (t.historic === 'monument') return { e: '🗿', k: 'Monument', w: 1.05 };
  if (t.historic === 'ruins' || t.historic === 'archaeological_site') return { e: '🏛️', k: 'Vestiges', w: 1.0 };
  if (t.historic === 'technical_monument' || t.historic === 'ship') return { e: '⚓', k: 'Patrimoine', w: 1.1 };
  if (t.man_made === 'lighthouse') return { e: '🗼', k: 'Phare', w: 1.2 };
  if (t.man_made === 'windmill' || t.historic === 'windmill') return { e: '🌬️', k: 'Moulin', w: 1.1 };
  if (t.man_made === 'tower' || t.man_made === 'water_tower') return { e: '🗼', k: 'Tour', w: 1.05 };
  if (t.amenity === 'place_of_worship' || /^(cathedral|church|chapel|basilica)$/.test(t.building ?? ''))
    return /cathédrale|basilique/i.test(name) ? { e: '⛪', k: /basilique/i.test(name) ? 'Basilique' : 'Cathédrale', w: 1.2 } : { e: '⛪', k: 'Église', w: 0.85 };
  if (t.man_made === 'bridge' || t.bridge) return { e: '🌉', k: 'Pont', w: 0.95 };
  if (t.amenity === 'fountain') return { e: '⛲', k: 'Fontaine', w: 1.0 };
  if (t.amenity === 'theatre') return { e: '🎭', k: 'Théâtre', w: 1.05 };
  if (t.amenity === 'arts_centre') return { e: '🎶', k: 'Culture', w: 1.0 };
  if (t.amenity === 'marketplace') return { e: '🧺', k: 'Marché', w: 0.95 };
  if (t.amenity === 'library') return { e: '📚', k: 'Médiathèque', w: 0.85 };
  if (/^(apartments|house|residential|terrace|detached|semidetached_house)$/.test(t.building ?? '')) return null;
  if (t.building) return { e: '🏛️', k: 'Monument', w: 0.85 };
  return { e: '📍', k: 'Lieu', w: 0.8 };
}

/* ------------------------------------ Overpass ------------------------------------ */

const cellOf = (lng: number, lat: number) => `${Math.floor(lat / CELL)}_${Math.floor(lng / CELL)}`;

/** La requête : lieux avec article Wikipédia et un genre qui se visite (filtrés au serveur), et lieux
 * touristiques qui n'ont qu'une fiche Wikidata. */
function query(b: BBox): string {
  const [w, s, e, n] = b.map((x) => x.toFixed(4));
  const W = '["wikipedia"]["name"]';
  return `[out:json][timeout:15][bbox:${s},${w},${n},${e}];(
nwr${W}["tourism"~"^(attraction|museum|viewpoint|artwork|gallery|zoo|theme_park|aquarium)$"];
nwr${W}["historic"]["historic"!~"^(tomb|memorial|wayside_shrine|wayside_cross|boundary_stone|milestone|yes)$"];
nwr${W}["leisure"~"^(park|garden|nature_reserve)$"];
nwr${W}["man_made"~"^(tower|crane|lighthouse|windmill|water_tower|bridge)$"];
nwr${W}["building"~"^(cathedral|church|chapel|basilica|castle|tower|palace|public|civic|government|office|commercial|yes)$"]["amenity"!~"^(school|college|university|hospital|clinic)$"]["railway"!~"."];
nwr${W}["amenity"~"^(theatre|arts_centre|fountain|marketplace|place_of_worship|library)$"];
nwr["wikidata"]["name"][!"wikipedia"]["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|aquarium)$"];
);out tags bb qt;`;
}

interface OsmEl {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Tags;
}

export function rawOf(el: OsmEl): Raw | null {
  const t = el.tags ?? {};
  // Un point a sa position ; une surface, son emprise (Overpass ne donne pas les deux), dont on prend le milieu.
  const bb = el.bounds;
  const lat = el.lat ?? el.center?.lat ?? (bb ? (bb.minlat + bb.maxlat) / 2 : undefined);
  const lon = el.lon ?? el.center?.lon ?? (bb ? (bb.minlon + bb.maxlon) / 2 : undefined);
  if (lat == null || lon == null || !t.name) return null;
  const c = classify(t);
  if (!c) return null;
  const wp = t.wikipedia ?? '';
  const wiki = wp.startsWith('fr:') ? wp.slice(3).trim() : null;
  const qid = t.wikidata?.split(';')[0].trim() ?? '';
  const b = el.bounds;
  return {
    id: `${el.type[0]}${el.id}`,
    n: t.name,
    c: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5],
    b: b ? [b.minlon, b.minlat, b.maxlon, b.maxlat].map((x) => Math.round(x * 1e5) / 1e5) as BBox : null,
    e: c.e,
    k: c.k,
    w: c.w,
    wiki,
    q: !wiki && /^Q\d+$/.test(qid) ? qid : null,
    h: t.opening_hours ?? null,
  };
}

/** La zone ramenée à une taille raisonnable, autour de son centre. */
function clamp(b: BBox): BBox {
  let [w, s, e, n] = b;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  if (e - w > MAX_W) [w, e] = [cx - MAX_W / 2, cx + MAX_W / 2];
  if (n - s > MAX_H) [s, n] = [cy - MAX_H / 2, cy + MAX_H / 2];
  return [w, s, e, n];
}

/** Les lieux bruts de la zone : depuis l'appareil, sinon une requête pour les cases qui manquent. */
async function rawIn(b: BBox, signal?: AbortSignal): Promise<Raw[]> {
  const s = load();
  const now = Date.now();
  const [w, so, e, n] = b;
  const cells: string[] = [];
  let missing: BBox | null = null;
  for (let y = Math.floor(so / CELL); y <= Math.floor(n / CELL); y++) {
    for (let x = Math.floor(w / CELL); x <= Math.floor(e / CELL); x++) {
      const key = `${y}_${x}`;
      cells.push(key);
      const c = s.cells[key];
      if (c && now - c.t < CELL_TTL) continue;
      const cb: BBox = [x * CELL, y * CELL, (x + 1) * CELL, (y + 1) * CELL];
      missing = missing ? [Math.min(missing[0], cb[0]), Math.min(missing[1], cb[1]), Math.max(missing[2], cb[2]), Math.max(missing[3], cb[3])] : cb;
    }
  }
  if (missing) {
    const j = await overpass<{ elements: OsmEl[] }>(query(missing), signal, 12000);
    if (j) {
      const fresh: Record<string, Raw[]> = {};
      // Toutes les cases demandées sont marquées vues, même vides (pas de nouvelle requête pour rien).
      for (let y = Math.floor(missing[1] / CELL + 1e-9); y < Math.round(missing[3] / CELL); y++)
        for (let x = Math.floor(missing[0] / CELL + 1e-9); x < Math.round(missing[2] / CELL); x++) fresh[`${y}_${x}`] = [];
      for (const el of j.elements) {
        const r = rawOf(el);
        if (!r) continue;
        (fresh[cellOf(r.c[0], r.c[1])] ??= []).push(r);
      }
      for (const [k, list] of Object.entries(fresh)) s.cells[k] = { t: now, s: list };
      save();
    } else if (!cells.some((k) => s.cells[k])) {
      // Aucun serveur n'a répondu et rien n'est connu ici : ce n'est pas « aucun lieu », c'est « pas de réponse ».
      throw new Error('overpass');
    }
  }
  return cells.flatMap((k) => s.cells[k]?.s ?? []);
}

/* ------------------------------------ Wikidata ------------------------------------ */

/** Ce qui n'est pas une Wikipédia de langue parmi les liens d'une fiche Wikidata. */
const NOT_LANG = /^(commons|species|meta|mediawiki|sources|wikidata|wikifunctions|outreach|incubator|wikimania|foundation)wiki$/;

/** Les fiches Wikidata des lieux sans article français, 50 au plus en un appel ; gardées 30 jours. */
async function resolve(ids: string[], signal?: AbortSignal) {
  const s = load();
  const now = Date.now();
  const need = [...new Set(ids)].filter((q) => !(s.wd[q] && now - s.wd[q].t < WIKI_TTL)).slice(0, 50);
  if (!need.length) return;
  const url = new URL('https://www.wikidata.org/w/api.php');
  const params: Record<string, string> = {
    action: 'wbgetentities',
    format: 'json',
    origin: '*',
    ids: need.join('|'),
    props: 'sitelinks|descriptions|claims',
    languages: 'fr',
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return;
    const j: {
      entities?: Record<
        string,
        {
          sitelinks?: Record<string, { title: string }>;
          descriptions?: { fr?: { value: string } };
          claims?: { P18?: { mainsnak?: { datavalue?: { value?: unknown } } }[] };
        }
      >;
    } = await r.json();
    for (const [q, e] of Object.entries(j.entities ?? {})) {
      const file = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      s.wd[q] = {
        t: now,
        fr: e.sitelinks?.frwiki?.title ?? null,
        file: typeof file === 'string' ? file : null,
        desc: e.descriptions?.fr?.value ?? null,
        langs: Object.keys(e.sitelinks ?? {}).filter((k) => k.endsWith('wiki') && !NOT_LANG.test(k)).length,
      };
    }
    // Les fiches sans réponse sont notées vues (pas d'appel à chaque fois).
    for (const q of need) s.wd[q] ??= { t: now, fr: null, file: null, desc: null, langs: 0 };
    save();
  } catch (e) {
    if (signal?.aborted) throw e;
  }
}

/* ------------------------------------ Wikipédia ------------------------------------ */

const pageOf = (title: string) => title.split('#')[0].trim();

/** L'article d'un lieu : celui d'OpenStreetMap, sinon celui que donne Wikidata. */
const titleOf = (s: Pick<Store, 'wd'>, r: Raw) => r.wiki ?? (r.q ? s.wd[r.q]?.fr : null) ?? null;
/** Pour un lieu sans article, la page de sa photo sur Commons (Wikipédia en donne la vignette). */
const fileOf = (s: Pick<Store, 'wd'>, r: Raw) => {
  const f = r.q ? s.wd[r.q]?.file : null;
  return f ? `File:${f}` : null;
};
/** Le plus qu'un lieu peut tirer de Wikipédia : un article de 400 ko, et une photo. */
const TOP = Math.log10(400000 + 2000) * 1.15;

/** Photo, description et longueur de 50 articles au plus, en un appel ; gardés 30 jours. Faux si l'appel échoue. */
async function wikiCall(titles: string[], signal?: AbortSignal): Promise<boolean> {
  const s = load();
  const now = Date.now();
  const url = new URL('https://fr.wikipedia.org/w/api.php');
  const params: Record<string, string> = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    redirects: '1',
    prop: 'pageimages|info|description',
    piprop: 'thumbnail',
    pithumbsize: '480',
    pilimit: '50',
    titles: titles.join('|'),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return false;
    const j: {
      query?: {
        pages?: { title: string; missing?: boolean; thumbnail?: { source: string }; description?: string; length?: number }[];
        redirects?: { from: string; to: string }[];
        normalized?: { from: string; to: string }[];
      };
    } = await r.json();
    const q = j.query ?? {};
    // Le titre demandé peut avoir été normalisé ou redirigé : on garde l'info sous le titre demandé.
    const back = new Map<string, string[]>();
    const alias = (from: string, to: string) => back.set(to, [...(back.get(to) ?? []), from, ...(back.get(from) ?? [])]);
    for (const x of q.normalized ?? []) alias(x.from, x.to);
    for (const x of q.redirects ?? []) alias(x.from, x.to);
    for (const p of q.pages ?? []) {
      const info: WikiInfo = {
        t: now,
        img: p.thumbnail?.source ?? null,
        size: p.length ?? 0,
        desc: p.description ?? null,
      };
      for (const t of [p.title, ...(back.get(p.title) ?? [])]) s.wiki[t] = info;
    }
    // Les titres sans réponse sont notés vus (pas d'appel à chaque fois).
    for (const t of titles) s.wiki[t] ??= { t: now, img: null, size: 0, desc: null };
    save();
    return true;
  } catch (e) {
    if (signal?.aborted) throw e;
    return false;
  }
}

/**
 * Photo, description et longueur d'article des lieux de la zone. D'abord les 50 aux genres les plus
 * remarquables ; au-delà, seulement ceux qui peuvent encore entrer dans la liste (le 24e score connu ne peut
 * que monter, un lieu qui ne l'atteindrait pas même avec un très long article et une photo n'est pas
 * demandé), 3 appels de plus au plus, en parallèle.
 */
async function enrich(raw: Raw[], signal?: AbortSignal) {
  const s = load();
  const now = Date.now();
  const best = new Map<string, number>();
  for (const r of raw) {
    const t = titleOf(s, r);
    const key = t ? pageOf(t) : fileOf(s, r);
    if (key) best.set(key, Math.max(best.get(key) ?? 0, r.w));
  }
  const todo = [...best].filter(([t]) => !(s.wiki[t] && now - s.wiki[t].t < WIKI_TTL)).sort((a, b) => b[1] - a[1]);
  if (!todo.length) return;
  if (!(await wikiCall(todo.slice(0, 50).map(([t]) => t), signal))) return;
  const floor = rank(raw)[LIMIT - 1]?.score ?? 0;
  const rest = todo
    .slice(50)
    .filter(([, w]) => w * TOP > floor)
    .map(([t]) => t)
    .slice(0, 150);
  const parts: string[][] = [];
  for (let i = 0; i < rest.length; i += 50) parts.push(rest.slice(i, i + 50));
  await Promise.all(parts.map((p) => wikiCall(p, signal)));
}

/* ------------------------------------ Ensemble ------------------------------------ */

const inside = (c: LngLat, b: BBox) => c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3];

/**
 * Classement : le genre, puis la notoriété (longueur de l'article, à l'échelle logarithmique ; sans article
 * français, le nombre de langues où le lieu en a un), la photo en plus.
 */
export function rank(raw: Raw[], s: Pick<Store, 'wiki' | 'wd'> = load(), limit = LIMIT): Spot[] {
  // Un même article pour plusieurs objets (les Machines de l'île, la Galerie, le Carrousel) : on garde celui qui
  // porte le nom de l'article, sinon le plus grand.
  const best = new Map<string, Raw>();
  const area = (r: Raw) => (r.b ? (r.b[2] - r.b[0]) * (r.b[3] - r.b[1]) : 0);
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").replace(/\s*\(.*\)$/, '').trim();
  const named = (r: Raw) => {
    const t = titleOf(s, r);
    return t && norm(r.n) === norm(pageOf(t)) ? 1 : 0;
  };
  for (const r of raw) {
    const t = titleOf(s, r);
    const key = t ? pageOf(t) : `${r.n}|${r.k}`;
    const cur = best.get(key);
    if (!cur || named(r) > named(cur) || (named(r) === named(cur) && area(r) > area(cur))) best.set(key, r);
  }
  return [...best.values()]
    .map((r) => {
      const t = titleOf(s, r);
      const info = t ? s.wiki[pageOf(t)] : undefined;
      const wd = r.q ? s.wd[r.q] : undefined;
      const file = fileOf(s, r);
      const image = info?.img ?? (file ? s.wiki[file]?.img : null) ?? null;
      const size = info?.size || (wd?.langs ?? 0) * PER_LANG;
      const score = r.w * Math.log10(size + 2000) * (image ? 1.15 : 1);
      return { id: r.id, name: r.n, coord: r.c, bounds: r.b, emoji: r.e, kind: r.k, wiki: t, hours: r.h, image, desc: info?.desc ?? wd?.desc ?? null, size, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Les lieux emblématiques de la zone affichée, du plus au moins remarquable. Sans réseau ou si les serveurs ne
 * répondent pas : ce qui est déjà connu de l'appareil, sinon une erreur (que la Découverte dit comme telle).
 */
export async function discover(view: BBox, signal?: AbortSignal): Promise<Spot[]> {
  const b = clamp(view);
  const raw = (await rawIn(b, signal)).filter((r) => inside(r.c, b));
  // Wikidata d'abord, pour les quelques lieux qui n'ont pas d'article français dans OpenStreetMap.
  await resolve(
    raw.flatMap((r) => (r.q ? [r.q] : [])),
    signal,
  );
  await enrich(raw, signal);
  return rank(raw);
}

/** Pour les tests : vide la mémoire. */
export function resetDiscover() {
  store = { v: 1, cells: {}, wiki: {}, wd: {} };
}
