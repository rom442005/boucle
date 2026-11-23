import type { LngLat } from './types';
import type { ZoneKind } from './zones';

/*
 * Mes lieux, comme les listes enregistrées de Google Maps : des adresses (domicile, travail, école, chez un
 * proche…) et des lieux repérés sur la carte (une piste, un parc), rangés dans des listes à émoji. Ils
 * servent de départ ou d'arrivée en un toucher, et se voient sur la carte. Gardés sur l'appareil.
 */

export interface SavedList {
  id: string;
  name: string;
  emoji: string;
  t: number;
}

export interface SavedPlace {
  id: string;
  name: string;
  /** adresse ou genre du lieu */
  detail?: string;
  coord: LngLat;
  /** liste où il est rangé */
  list: string;
  emoji: string;
  t: number;
  /** lieu de la barre des lieux (piste, parc…) d'où il vient */
  zone?: ZoneKind;
}

/** Lieu à enregistrer ou à modifier (fiche « Enregistrer ») */
export interface SaveDraft {
  /** lieu déjà enregistré qu'on modifie */
  id?: string;
  name: string;
  detail?: string;
  coord: LngLat;
  emoji: string;
  list: string;
  zone?: ZoneKind;
}

interface SavedDoc {
  v: 1;
  lists: SavedList[];
  places: SavedPlace[];
  /** dernière modification (ms) */
  at: number;
}

const KEY = 'boucle.lieux.v1';

/** Listes de départ : on y range d'abord ses adresses, ses lieux préférés et ceux à essayer. */
export const DEFAULT_LISTS: SavedList[] = [
  { id: 'adresses', name: 'Mes adresses', emoji: '🏠', t: 0 },
  { id: 'favoris', name: 'Favoris', emoji: '❤️', t: 0 },
  { id: 'essayer', name: 'À essayer', emoji: '🚩', t: 0 },
];

/** Adresses proposées dans « Mes adresses » tant qu'elles manquent. */
export const SUGGESTED = [
  { name: 'Domicile', emoji: '🏠' },
  { name: 'Travail', emoji: '💼' },
  { name: 'École', emoji: '🎓' },
] as const;

export const PLACE_EMOJIS = ['📍', '🏠', '💼', '🎓', '❤️', '👪', '🏟️', '🌳', '🌊', '⛰️', '☕', '🏋️', '⭐', '🚩'];
export const LIST_EMOJIS = ['⭐', '❤️', '🏠', '🚩', '🏟️', '🌳', '🏃', '🚴', '👪', '☕', '🗺️', '🔥'];

/** Émoji proposé pour un lieu de la barre des lieux. */
export const ZONE_EMOJI: Record<ZoneKind, string> = { track: '🏟️', park: '🌳', water: '🌊', wood: '🌲', fountain: '🚰', toilets: '🚻' };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const round = (c: LngLat): LngLat => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];

function load(): SavedDoc {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedDoc | null;
    if (d && d.v === 1 && Array.isArray(d.lists) && Array.isArray(d.places)) return d;
  } catch {
    /* stockage illisible : on repart des listes de départ */
  }
  return { v: 1, lists: DEFAULT_LISTS.map((l) => ({ ...l })), places: [], at: 0 };
}

class Saved {
  lists = $state.raw<SavedList[]>([]);
  places = $state.raw<SavedPlace[]>([]);
  at = 0;
  /** fiche « Enregistrer » ouverte */
  draft = $state.raw<SaveDraft | null>(null);
  /** liste montrée dans Mes parcours › Lieux */
  openList = $state('adresses');
  /** appelé après chaque modification (synchronisation avec le compte, branchée ailleurs) */
  onChange: (() => void) | null = null;

  constructor() {
    const d = load();
    this.lists = d.lists.length ? d.lists : DEFAULT_LISTS.map((l) => ({ ...l }));
    this.places = d.places;
    this.at = d.at;
  }

  private persist() {
    this.at = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.doc()));
    } catch {
      /* stockage plein ou indisponible : les lieux restent pour cette visite */
    }
    this.onChange?.();
  }

  doc(): SavedDoc {
    return { v: 1, lists: this.lists, places: this.places, at: this.at };
  }

  /** Remplace tout (lieux venus du compte, plus récents que ceux de l'appareil). */
  replace(d: SavedDoc) {
    if (!d || d.v !== 1 || !Array.isArray(d.lists) || !Array.isArray(d.places)) return;
    this.lists = d.lists.length ? d.lists : DEFAULT_LISTS.map((l) => ({ ...l }));
    this.places = d.places;
    this.at = d.at;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.doc()));
    } catch {
      /* stockage indisponible */
    }
  }

  listOf(id: string): SavedList {
    return this.lists.find((l) => l.id === id) ?? this.lists[0] ?? DEFAULT_LISTS[0];
  }

  /** Émoji montré pour un lieu : celui de sa liste (on le change depuis la liste). */
  emojiOf(p: Pick<SavedPlace, 'list'>): string {
    return this.listOf(p.list).emoji;
  }

  placesIn(list: string): SavedPlace[] {
    return this.places.filter((p) => p.list === list);
  }

  /** Lieu enregistré à moins de 25 m (pour reconnaître une piste ou une adresse déjà gardée). */
  near(c: LngLat, within = 25): SavedPlace | null {
    const kx = 111320 * Math.cos((c[1] * Math.PI) / 180);
    let best: SavedPlace | null = null;
    let bd = within;
    for (const p of this.places) {
      const d = Math.hypot((p.coord[0] - c[0]) * kx, (p.coord[1] - c[1]) * 110540);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Ouvre la fiche « Enregistrer » pour un lieu (ou pour modifier un lieu déjà enregistré). */
  edit(d: Omit<SaveDraft, 'emoji' | 'list'> & Partial<Pick<SaveDraft, 'emoji' | 'list'>>) {
    const had = d.id ? this.places.find((p) => p.id === d.id) : null;
    this.draft = {
      ...d,
      emoji: d.emoji ?? had?.emoji ?? '📍',
      list: d.list ?? had?.list ?? (this.lists.some((l) => l.id === 'favoris') ? 'favoris' : this.lists[0]?.id ?? 'favoris'),
    };
  }

  /** Enregistre la fiche ouverte (nouveau lieu, ou lieu modifié). */
  commit(d: SaveDraft): SavedPlace {
    const name = d.name.trim() || 'Lieu';
    if (d.id && this.places.some((p) => p.id === d.id)) {
      let out!: SavedPlace;
      this.places = this.places.map((p) => (p.id === d.id ? (out = { ...p, name, detail: d.detail, emoji: d.emoji, list: d.list, coord: round(d.coord) }) : p));
      this.persist();
      this.draft = null;
      return out;
    }
    const p: SavedPlace = { id: uid(), name, detail: d.detail, coord: round(d.coord), list: d.list, emoji: d.emoji, t: Date.now(), ...(d.zone ? { zone: d.zone } : {}) };
    this.places = [p, ...this.places];
    this.openList = d.list;
    this.persist();
    this.draft = null;
    return p;
  }

  remove(id: string) {
    this.places = this.places.filter((p) => p.id !== id);
    this.persist();
  }

  addList(name: string, emoji: string): SavedList {
    const l: SavedList = { id: uid(), name: name.trim() || 'Nouvelle liste', emoji, t: Date.now() };
    this.lists = [...this.lists, l];
    this.persist();
    return l;
  }

  renameList(id: string, name: string, emoji: string) {
    this.lists = this.lists.map((l) => (l.id === id ? { ...l, name: name.trim() || l.name, emoji } : l));
    this.persist();
  }

  /** Supprime une liste et ses lieux (il en reste toujours une). */
  removeList(id: string) {
    if (this.lists.length <= 1) return;
    this.lists = this.lists.filter((l) => l.id !== id);
    this.places = this.places.filter((p) => p.list !== id);
    if (this.openList === id) this.openList = this.lists[0].id;
    this.persist();
  }
}

export const saved = new Saved();
