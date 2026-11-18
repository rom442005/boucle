import type { GenProgress, LngLat, Params, Place, Route, Settings, Sport } from './types';
import { defaultParams, DEFAULT_SETTINGS, estimateDuration, SPORTS } from './sports';
import {
  deserialize,
  loadLast,
  loadLibrary,
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
import { reverse, type Weather } from './services';
import { reverseRoute } from './routegeo';
import { elevationStats } from './elevation';
import { cumulative, overlapRatio } from './geo';
import { Follower, type FollowState } from './follow';
import { slug } from './format';
import { ELEV_STEP, heights } from './valhalla';

const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

export type Phase = 'compose' | 'results' | 'library' | 'detail' | 'follow';
export type Detent = 'peek' | 'half' | 'full';

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

  library = $state.raw<SerialRoute[]>(loadLibrary());
  weather = $state.raw<Weather | null>(null);

  search = $state<null | 'start' | 'destination'>(null);
  pickOnMap = $state<null | 'start' | 'destination'>(null);
  toast = $state<{ text: string; id: number } | null>(null);

  detent = $state<Detent>('half');
  wide = $state(false);
  padding = $state<Padding>({ top: 80, bottom: 320, left: 16, right: 16 });

  userPos = $state<LngLat | null>(null);
  locating = $state(false);
  terrain3d = $state(false);
  bearing = $state(0);
  follow = $state.raw<FollowState | null>(null);
  /** la carte suit la position pendant le suivi (désactivé dès que l'on déplace la carte) */
  followCamera = $state(true);
  /** demande de remise au nord (lue par MapView) */
  northTick = $state(0);
  /** demande de déplacement de la carte (lue par MapView) */
  camera = $state.raw<{ center: LngLat; zoom?: number; id: number } | null>(null);

  flyTo(center: LngLat, zoom?: number) {
    this.camera = { center, zoom, id: Date.now() };
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
    const last = loadLast();
    if (last.params && SPORTS[last.params.sport]) this.params = { ...defaultParams(last.params.sport), ...last.params };
    if (last.start) this.start = last.start;
  }

  get route(): Route | null {
    return this.routes[this.selected] ?? null;
  }

  persist() {
    saveLast({ params: $state.snapshot(this.params), start: this.start ? $state.snapshot(this.start) : undefined });
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

  async useMyPosition(kind: 'start' | 'destination' = 'start') {
    const c = await this.locate();
    if (!c) return null;
    const place: Place = { name: 'Ma position', coord: c, kind: 'gps' };
    this.setPlace(kind, place);
    void reverse(c).then((r) => {
      const cur = kind === 'start' ? this.start : this.destination;
      if (r && cur && same(cur.coord, c)) this.setPlace(kind, { ...place, detail: r.detail ? `${r.name}, ${r.detail}` : r.name });
    });
    return c;
  }

  setPlace(kind: 'start' | 'destination', p: Place) {
    if (kind === 'start') this.start = p;
    else this.destination = p;
    this.persist();
  }

  async placeFromMap(kind: 'start' | 'destination', c: LngLat) {
    const place: Place = { name: 'Point choisi', coord: c, kind: 'map' };
    this.setPlace(kind, place);
    this.pickOnMap = null;
    const r = await reverse(c);
    const cur = kind === 'start' ? this.start : this.destination;
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
      this.weather = res.weather;
      this.phase = 'results';
      this.drawTick++;
      if (!this.wide) this.detent = 'half';
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      console.error(e);
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
    this.selected = i;
    this.scrub = null;
    this.drawTick++;
  }

  back() {
    this.scrub = null;
    if (this.phase === 'detail') {
      this.phase = 'library';
      this.routes = [];
      return;
    }
    this.phase = 'compose';
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
      this.showToast('Retiré de tes parcours');
      return;
    }
    const next = [serialize(r), ...this.library];
    if (!saveLibrary(next)) {
      this.showToast('Mémoire pleine : supprime un ancien parcours.');
      return;
    }
    this.library = next;
    this.showToast('Enregistré dans tes parcours');
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
    this.routes = [deserialize(s, this.settings)];
    this.selected = 0;
    this.scrub = null;
    this.phase = 'detail';
    this.drawTick++;
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
    this.selected = 0;
    this.phase = 'detail';
    this.drawTick++;
  }

  async openSharedLink(hash: string) {
    try {
      const r = await unpackRoute(hash, this.settings);
      this.routes = [r];
      this.selected = 0;
      this.phase = 'detail';
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
    this.follower?.stop();
    this.follower = null;
    this.follow = null;
    this.phase = this.beforeFollow;
  }
}

export const app = new AppState();
