import type { GenProgress, LngLat, Params, Place, Route, Settings, Sport } from './types';
import { defaultParams, DEFAULT_SETTINGS, estimateDuration, SPORTS } from './sports';
import {
  deserialize,
  loadLast,
  loadLibrary,
  loadHistory,
  saveHistory,
  loadFlags,
  saveFlag,
  type HistoryEntry,
  loadSettings,
  packRoute,
  parseGPX,
  saveLast,
  saveLibrary,
  saveSettings,
  serialize,
  toGPX,
  unpackRoute,
  type SerialRoute,
} from './persist';
import { generate, GenerateError } from './generator';
import { reverse, weather, type Weather } from './services';
import type { MapType } from './mapstyle';
import { reverseRoute } from './routegeo';
import { elevationStats } from './elevation';
import { cumulative, overlapRatio } from './geo';
import { Follower, type FollowState } from './follow';
import { slug } from './format';
import { ELEV_STEP, heights } from './valhalla';
import { haptic } from './haptics';

const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

export type Phase = 'compose' | 'results' | 'library' | 'detail' | 'follow';
export type Detent = 'peek' | 'half' | 'full';
/** Rôle d'un lieu choisi : départ, destination (« Vers un lieu ») ou point de passage imposé. */
export type PlaceKind = 'start' | 'destination' | 'via';

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

class AppState {
  params = $state<Params>(defaultParams('run'));
  settings = $state<Settings>(loadSettings(DEFAULT_SETTINGS));
  start = $state<Place | null>(null);
  destination = $state<Place | null>(null);
  /** point de passage imposé : un endroit à visiter forcément */
  via = $state<Place | null>(null);

  phase = $state<Phase>('compose');
  /** écran à retrouver en quittant le suivi */
  private beforeFollow: Phase = 'results';

  generating = $state(false);
  progress = $state<GenProgress | null>(null);
  error = $state<string | null>(null);
  note = $state<string | null>(null);

  routes = $state.raw<Route[]>([]);
  selected = $state(0);
  scrub = $state<number | null>(null);
  /** incrémenté à chaque nouveau résultat pour rejouer le dessin du tracé */
  drawTick = $state(0);
  /** avancement (0 à 1) du tracé d'un parcours tout juste trouvé : la carte, le profil et les chiffres le suivent */
  revealK = $state(1);

  library = $state.raw<SerialRoute[]>(loadLibrary());
  history = $state.raw<HistoryEntry[]>(loadHistory());
  libTab = $state<'favoris' | 'historique'>('favoris');
  /** origine du parcours affiché en détail (pour l'en-tête et le retour) */
  detailFrom = $state<null | { kind: 'favori' | 'historique' | 'lien' | 'gpx'; id?: string }>(null);
  flags = $state<Record<string, boolean>>(loadFlags());
  weather = $state.raw<Weather | null>(null);

  search = $state<null | PlaceKind>(null);
  pickOnMap = $state<null | PlaceKind>(null);
  toast = $state<{ text: string; id: number } | null>(null);

  detent = $state<Detent>('half');
  /** côte ou descente mise en avant (indice dans climbsOf(route)), null sinon */
  focusClimb = $state<number | null>(null);
  /** zoom de la carte (mis à jour à la fin de chaque mouvement) */
  zoom = $state(12);
  wide = $state(false);
  padding = $state<Padding>({ top: 80, bottom: 320, left: 16, right: 16 });

  userPos = $state<LngLat | null>(null);
  locating = $state(false);
  terrain3d = $state(false);
  /** fond de carte : plan ou photos aériennes (mémorisé) */
  mapType = $state<MapType>(loadFlags().satellite ? 'satellite' : 'plan');
  bearing = $state(0);
  follow = $state.raw<FollowState | null>(null);
  /** la carte suit la position pendant le suivi (désactivé dès que l'on déplace la carte) */
  followCamera = $state(true);
  /** demande de remise au nord (lue par MapView) */
  northTick = $state(0);
  /** demande de zoom d'un niveau, + ou − (boutons de la carte sur Mac, lue par MapView) */
  zoomStep = $state.raw<{ d: number; id: number } | null>(null);
  zoomBy(d: number) {
    this.zoomStep = { d, id: (this.zoomStep?.id ?? 0) + 1 };
  }
  /** demande de déplacement de la carte (lue par MapView) */
  camera = $state.raw<{ center: LngLat; zoom?: number; id: number } | null>(null);

  flyTo(center: LngLat, zoom?: number) {
    this.camera = { center, zoom, id: Date.now() };
  }

  setMapType(t: MapType) {
    if (t === this.mapType) return;
    this.mapType = t;
    this.setFlag('satellite', t === 'satellite');
  }

  private weatherAt: { coord: LngLat; at: number } | null = null;
  /** Météo du moment au départ (pour « Si tu pars maintenant »), gardée un quart d'heure au même endroit. */
  refreshWeather(c: LngLat) {
    const w = this.weatherAt;
    if (this.weather && w && Date.now() - w.at < 15 * 60000 && Math.abs(w.coord[0] - c[0]) + Math.abs(w.coord[1] - c[1]) < 0.05) return;
    this.weatherAt = { coord: c, at: Date.now() };
    void weather(c).then((x) => {
      if (x && this.weatherAt?.coord === c) this.weather = x;
    });
  }

  /** Bouton de localisation : recentre, et pendant la composition place aussi le départ. */
  async locateButton() {
    if (this.phase === 'compose') {
      const c = await this.useMyPosition('start');
      if (c) this.flyTo(c);
      return;
    }
    const c = await this.locate();
    if (c) this.flyTo(c, 15);
  }

  private follower: Follower | null = null;
  private abort: AbortController | null = null;
  private seed = Math.floor(Math.random() * 1e9);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.persistNow());
    const last = loadLast();
    if (last.params && SPORTS[last.params.sport]) this.params = { ...defaultParams(last.params.sport), ...last.params };
    if (last.start) this.start = last.start;
    if (last.destination) this.destination = last.destination;
    if (last.via) this.via = last.via;
  }

  get route(): Route | null {
    return this.routes[this.selected] ?? null;
  }

  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  /** Sauvegarde de la session, regroupée : un curseur qu'on fait glisser n'écrit pas à chaque pas. */
  persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistNow(), 300);
  }
  persistNow() {
    clearTimeout(this.persistTimer);
    saveLast({
      params: $state.snapshot(this.params),
      start: this.start ? $state.snapshot(this.start) : undefined,
      destination: this.destination ? $state.snapshot(this.destination) : undefined,
      via: this.via ? $state.snapshot(this.via) : undefined,
    });
  }

  /** iPhone : le panneau descend pour montrer tout le parcours. */
  private focusRoute() {
    if (!this.wide) this.detent = 'peek';
  }

  /* ------------------------------ Réglages ------------------------------ */

  setSport(s: Sport) {
    if (s === this.params.sport) return;
    const def = SPORTS[s];
    const p = this.params;
    const wasBike = SPORTS[p.sport].bike;
    p.sport = s;
    if (wasBike !== def.bike || p.distanceKm < def.distance.min || p.distanceKm > def.distance.max) p.distanceKm = def.distance.def;
    if (p.elevation != null) p.elevation = Math.min(def.elevation.max, Math.round(p.elevation / def.elevation.step) * def.elevation.step);
    p.surface = def.defaultSurface;
    p.headwind = def.bike;
    if (def.bike) p.lit = false;
    this.persist();
  }

  toggleEnv(e: Params['envs'][number]) {
    const i = this.params.envs.indexOf(e);
    if (i >= 0) this.params.envs.splice(i, 1);
    else this.params.envs.push(e);
    this.persist();
  }

  saveSettings() {
    saveSettings($state.snapshot(this.settings));
    // Les durées affichées suivent l'allure réglée.
    if (this.routes.length) this.routes = this.routes.map((r) => ({ ...r, durationS: estimateDuration(r.sport, r.lengthM, r.ascent, this.settings) }));
  }

  /* ------------------------------ Lieux ------------------------------ */

  showToast(text: string) {
    clearTimeout(this.toastTimer);
    this.toast = { text, id: Date.now() };
    this.toastTimer = setTimeout(() => (this.toast = null), 2800);
  }

  locate(): Promise<LngLat | null> {
    if (!('geolocation' in navigator)) {
      this.showToast('Localisation indisponible sur cet appareil.');
      return Promise.resolve(null);
    }
    this.locating = true;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: LngLat = [pos.coords.longitude, pos.coords.latitude];
          this.userPos = c;
          this.locating = false;
          resolve(c);
        },
        (err) => {
          this.locating = false;
          this.showToast(
            err.code === err.PERMISSION_DENIED
              ? 'Localisation refusée : choisis un départ sur la carte ou par adresse.'
              : 'Position introuvable pour le moment.',
          );
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      );
    });
  }

  /** Le lieu d'un rôle donné (départ, destination, point de passage). */
  placeOf(kind: PlaceKind): Place | null {
    return kind === 'start' ? this.start : kind === 'destination' ? this.destination : this.via;
  }

  async useMyPosition(kind: PlaceKind = 'start') {
    const c = await this.locate();
    if (!c) return null;
    const place: Place = { name: 'Ma position', coord: c, kind: 'gps' };
    this.setPlace(kind, place);
    void reverse(c).then((r) => {
      const cur = this.placeOf(kind);
      if (r && cur && same(cur.coord, c)) this.setPlace(kind, { ...place, detail: r.detail ? `${r.name}, ${r.detail}` : r.name });
    });
    return c;
  }

  setPlace(kind: PlaceKind, p: Place) {
    if (kind === 'start') this.start = p;
    else if (kind === 'destination') this.destination = p;
    else this.via = p;
    this.persist();
  }

  /** Choisir un point sur la carte : sur iPhone, le panneau descend pour dégager la carte. */
  /** Retire le point de passage. */
  clearVia() {
    this.via = null;
    this.persist();
  }

  startPick(kind: PlaceKind) {
    this.search = null;
    this.pickOnMap = kind;
    if (!this.wide && this.detent !== 'peek') {
      this.pickPrevDetent = this.detent;
      this.detent = 'peek';
    }
  }

  cancelPick() {
    this.pickOnMap = null;
    this.restoreDetent();
  }

  private pickPrevDetent: Detent | null = null;
  private restoreDetent() {
    if (this.pickPrevDetent) this.detent = this.pickPrevDetent;
    this.pickPrevDetent = null;
  }

  async placeFromMap(kind: PlaceKind, c: LngLat) {
    const place: Place = { name: 'Point choisi', coord: c, kind: 'map' };
    this.setPlace(kind, place);
    this.pickOnMap = null;
    this.restoreDetent();
    const r = await reverse(c);
    const cur = this.placeOf(kind);
    if (r && cur && same(cur.coord, c)) this.setPlace(kind, { ...place, name: r.name, detail: r.detail });
  }

  /* ------------------------------ Génération ------------------------------ */

  async create(reroll = false) {
    if (this.generating) return;
    this.error = null;
    if (!this.start) {
      const c = await this.useMyPosition('start');
      if (!c) {
        this.search = 'start';
        return;
      }
    }
    if (this.params.shape === 'oneway' && !this.destination) {
      this.search = 'destination';
      return;
    }
    if (reroll) this.seed += 7919;
    this.abort?.abort();
    const ctrl = new AbortController();
    this.abort = ctrl;
    this.generating = true;
    this.note = null;
    this.progress = { message: 'Préparation…', ratio: 0.02 };
    try {
      const res = await generate({
        start: $state.snapshot(this.start!) as Place,
        destination: this.destination ? ($state.snapshot(this.destination) as Place) : null,
        via: this.via ? ($state.snapshot(this.via) as Place) : null,
        params: $state.snapshot(this.params) as Params,
        settings: $state.snapshot(this.settings) as Settings,
        seed: this.seed,
        signal: ctrl.signal,
        onProgress: (p) => {
          if (this.abort === ctrl) this.progress = p;
        },
      });
      if (ctrl.signal.aborted) return;
      this.routes = res.routes;
      this.selected = 0;
      this.scrub = null;
      this.note = res.note;
      if (res.weather) {
        this.weather = res.weather;
        this.weatherAt = { coord: this.start!.coord, at: Date.now() };
      } else this.refreshWeather(this.start!.coord);
      this.phase = 'results';
      this.drawTick++;
      this.focusRoute();
      haptic('success');
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      console.error(e);
      haptic('warn');
      this.error = e instanceof GenerateError ? e.message : 'La création a échoué. Vérifie ta connexion, puis réessaie.';
    } finally {
      if (this.abort === ctrl) {
        this.generating = false;
        this.progress = null;
        this.abort = null;
      }
    }
  }

  cancel() {
    this.abort?.abort();
    this.abort = null;
    this.generating = false;
    this.progress = null;
  }

  select(i: number) {
    if (i === this.selected || !this.routes[i]) return;
    haptic('tick');
    this.selected = i;
    this.scrub = null;
    this.drawTick++;
  }

  back() {
    this.scrub = null;
    if (this.phase === 'detail') {
      if (this.detailFrom?.kind === 'historique') this.libTab = 'historique';
      else if (this.detailFrom?.kind === 'favori') this.libTab = 'favoris';
      this.detailFrom = null;
      this.phase = 'library';
      this.routes = [];
      if (!this.wide) this.detent = 'half';
      return;
    }
    this.phase = 'compose';
    if (!this.wide) this.detent = 'half';
    this.routes = [];
    this.note = null;
  }

  openLibrary() {
    this.cancel();
    this.scrub = null;
    this.routes = [];
    this.phase = 'library';
  }

  closeLibrary() {
    this.phase = 'compose';
  }

  reverseSelected() {
    const r = this.route;
    if (!r) return;
    const rev = reverseRoute(r);
    const st = elevationStats(rev.profile);
    const next = { ...rev, maxGrade: st.maxGrade, durationS: estimateDuration(rev.sport, rev.lengthM, rev.ascent, this.settings) };
    this.routes = this.routes.map((x, i) => (i === this.selected ? next : x));
    this.drawTick++;
    this.showToast('Sens inversé');
  }

  /* ------------------------------ Bibliothèque ------------------------------ */

  isSaved(r: Route | null): boolean {
    return !!r && this.library.some((s) => s.id === r.id);
  }

  toggleSave(r: Route) {
    if (this.isSaved(r)) {
      this.library = this.library.filter((s) => s.id !== r.id);
      saveLibrary(this.library);
      this.showToast('Retiré des favoris');
      return;
    }
    const next = [serialize(r), ...this.library];
    if (!saveLibrary(next)) {
      this.showToast('Mémoire pleine : supprime un ancien parcours.');
      return;
    }
    this.library = next;
    this.showToast('Ajouté aux favoris');
  }

  rename(r: Route, name: string) {
    const n = name.trim().slice(0, 80);
    if (!n) return;
    this.routes = this.routes.map((x) => (x.id === r.id ? { ...x, name: n } : x));
    if (this.isSaved(r)) {
      this.library = this.library.map((s) => (s.id === r.id ? { ...s, n } : s));
      saveLibrary(this.library);
    }
  }

  openSaved(id: string) {
    const s = this.library.find((x) => x.id === id);
    if (!s) return;
    this.detailFrom = { kind: 'favori', id };
    this.routes = [deserialize(s, this.settings)];
    this.refreshWeather(this.routes[0].coords[0]);
    this.selected = 0;
    this.scrub = null;
    this.phase = 'detail';
    this.focusRoute();
    this.drawTick++;
  }

  /** Ajoute une sortie à l'historique (copie compacte du parcours). */
  addHistory(r: Route, opts: { date?: number; durationS?: number | null; distanceM?: number; source: 'follow' | 'manual' }) {
    const distanceM = Math.round(opts.distanceM ?? r.lengthM);
    const entry: HistoryEntry = {
      id: `h-${Date.now().toString(36)}`,
      date: opts.date ?? Date.now(),
      durationS: opts.durationS ?? null,
      distanceM,
      complete: distanceM >= r.lengthM * 0.95,
      source: opts.source,
      route: serialize(r, true),
    };
    const next = [entry, ...this.history].sort((a, b) => b.date - a.date);
    if (!saveHistory(next)) {
      this.showToast('Mémoire pleine : supprime d’anciennes sorties.');
      return null;
    }
    this.history = next;
    return entry;
  }

  /** « Fait » : la sortie du jour, ajoutée à la main. */
  markDone(r: Route) {
    const recent = this.history.find((h) => h.route.id === r.id && Date.now() - h.date < 6 * 3600 * 1000);
    if (recent) {
      this.showToast('Déjà dans l’historique aujourd’hui');
      return;
    }
    if (this.addHistory(r, { source: 'manual' })) this.showToast('Ajouté à l’historique');
  }

  isDoneToday(r: Route | null): boolean {
    return !!r && this.history.some((h) => h.route.id === r.id && Date.now() - h.date < 6 * 3600 * 1000);
  }

  removeHistory(id: string) {
    this.history = this.history.filter((h) => h.id !== id);
    saveHistory(this.history);
  }

  openHistory(id: string) {
    const h = this.history.find((x) => x.id === id);
    if (!h) return;
    this.routes = [deserialize(h.route, this.settings)];
    this.selected = 0;
    this.scrub = null;
    this.detailFrom = { kind: 'historique', id };
    this.phase = 'detail';
    this.focusRoute();
    this.drawTick++;
  }

  setFlag(name: string, value = true) {
    this.flags = { ...this.flags, [name]: value };
    saveFlag(name, value);
  }

  removeSaved(id: string) {
    this.library = this.library.filter((s) => s.id !== id);
    saveLibrary(this.library);
  }

  async importGPX(file: File) {
    const parsed = parseGPX(await file.text());
    if (!parsed) {
      this.showToast('Fichier GPX illisible.');
      return;
    }
    const cum = cumulative(parsed.coords);
    const lengthM = cum[cum.length - 1];
    let profile = { step: ELEV_STEP, ele: [] as number[] };
    const hasEle = parsed.ele.filter((e) => e != null).length > parsed.ele.length * 0.8;
    // Profil régulier à partir des altitudes du fichier, sinon du modèle de terrain.
    const sampleAt = (fn: (s: number) => number) => {
      const ele: number[] = [];
      for (let s = 0; s < lengthM; s += ELEV_STEP) ele.push(fn(s));
      ele.push(fn(lengthM));
      return ele;
    };
    if (hasEle) {
      let k = 0;
      profile.ele = sampleAt((s) => {
        while (k < cum.length - 1 && cum[k + 1] < s) k++;
        const a = parsed.ele[k] ?? parsed.ele.find((x) => x != null) ?? 0;
        const b = parsed.ele[k + 1] ?? a;
        const t = cum[k + 1] > cum[k] ? (s - cum[k]) / (cum[k + 1] - cum[k]) : 0;
        return (a as number) + ((b as number) - (a as number)) * Math.max(0, Math.min(1, t));
      });
    } else {
      try {
        const step = Math.max(ELEV_STEP, lengthM / 500);
        const pts: LngLat[] = [];
        let k = 0;
        for (let s = 0; s <= lengthM; s += step) {
          while (k < cum.length - 1 && cum[k + 1] < s) k++;
          pts.push(parsed.coords[k]);
        }
        profile = { step, ele: await heights(pts) };
      } catch {
        profile = { step: lengthM, ele: [0, 0] };
      }
    }
    const st = elevationStats(profile);
    const first = parsed.coords[0];
    const lastPt = parsed.coords[parsed.coords.length - 1];
    const loop = Math.hypot(first[0] - lastPt[0], first[1] - lastPt[1]) < 0.002;
    const r: Route = {
      id: `gpx-${Date.now().toString(36)}`,
      name: parsed.name,
      sport: this.params.sport,
      shape: loop ? 'loop' : 'oneway',
      coords: parsed.coords,
      profile,
      lengthM,
      ascent: st.ascent,
      descent: st.descent,
      minEle: st.minEle,
      maxEle: st.maxEle,
      maxGrade: st.maxGrade,
      env: {},
      surface: null,
      busy: null,
      overlap: overlapRatio(parsed.coords),
      waterPoints: [],
      durationS: estimateDuration(this.params.sport, lengthM, st.ascent, this.settings),
      createdAt: Date.now(),
    };
    this.routes = [r];
    this.refreshWeather(r.coords[0]);
    this.selected = 0;
    this.detailFrom = { kind: 'gpx' };
    this.phase = 'detail';
    this.focusRoute();
    this.drawTick++;
  }

  async openSharedLink(hash: string) {
    try {
      const r = await unpackRoute(hash, this.settings);
      this.routes = [r];
      this.refreshWeather(r.coords[0]);
      this.selected = 0;
      this.detailFrom = { kind: 'lien' };
      this.phase = 'detail';
      this.focusRoute();
      this.drawTick++;
      this.showToast('Parcours reçu : enregistre-le pour le garder.');
    } catch {
      this.showToast('Ce lien de parcours est incomplet.');
    }
  }

  /* ------------------------------ Export et partage ------------------------------ */

  async exportGPX(r: Route) {
    const file = new File([toGPX(r)], `${slug(r.name)}.gpx`, { type: 'application/gpx+xml' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: r.name });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.showToast('GPX téléchargé');
  }

  async shareLink(r: Route) {
    const url = `${location.origin}${location.pathname}#r=${await packRoute(r)}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: r.name, text: `${r.name} — parcours Boucle`, url });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.showToast('Lien copié : ouvre-le sur ton autre appareil.');
    } catch {
      this.showToast('Copie impossible dans ce navigateur.');
    }
  }

  /* ------------------------------ Suivi en direct ------------------------------ */

  startFollow() {
    const r = this.route;
    if (!r) return;
    this.beforeFollow = this.phase === 'detail' ? 'detail' : 'results';
    this.scrub = null;
    this.follower?.stop();
    this.follower = new Follower(r, (s) => {
      this.follow = s;
      if (s.position) this.userPos = s.position;
    });
    this.follow = this.follower.state;
    this.followCamera = true;
    this.phase = 'follow';
    this.follower.start();
  }

  stopFollow() {
    const r = this.route;
    const f = this.follow;
    if (r && f && f.progress >= 300) {
      const e = this.addHistory(r, { date: f.startedAt, durationS: Math.round((Date.now() - f.startedAt) / 1000), distanceM: f.progress, source: 'follow' });
      if (e) this.showToast(`Sortie ajoutée à l’historique : ${(e.distanceM / 1000).toFixed(1).replace('.', ',')} km`);
    }
    this.follower?.stop();
    this.follower = null;
    this.follow = null;
    this.phase = this.beforeFollow;
  }
}

export const app = new AppState();
