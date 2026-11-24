import type { LngLat, Route } from './types';
import { cumulative, haversine, nearestOnRoute } from './geo';

export interface FollowState {
  position: LngLat | null;
  accuracy: number | null;
  heading: number | null;
  /** distance parcourue le long du tracé (m) */
  progress: number;
  /** écart au tracé (m) */
  offset: number | null;
  /** vitesse du moment (m/s), lissée sur une dizaine de secondes ; null tant qu'elle n'est pas connue */
  speed: number | null;
  /** vitesse la plus haute tenue (m/s) */
  maxSpeed: number;
  /** pause en cours (heure de début), et durée cumulée des pauses (ms) */
  pausedAt: number | null;
  pausedMs: number;
  error: string | null;
  startedAt: number;
}

/** Temps en mouvement (s) : depuis le départ, pauses retirées. */
export function movingSeconds(s: FollowState, now = Date.now()): number {
  return Math.max(0, ((s.pausedAt ?? now) - s.startedAt - s.pausedMs) / 1000);
}

/** D+ cumulé le long du tracé (m), point par point du profil d'altitude. */
export function ascentProfile(r: Route): Float64Array {
  const e = r.profile.ele;
  const out = new Float64Array(e.length);
  for (let i = 1; i < e.length; i++) out[i] = out[i - 1] + Math.max(0, e[i] - e[i - 1]);
  return out;
}

/** D+ fait après d mètres. */
export function ascentAt(r: Route, cum: Float64Array, d: number): number {
  if (!cum.length) return 0;
  const i = Math.min(cum.length - 1, Math.max(0, Math.floor(d / r.profile.step)));
  return cum[i];
}

/** Au-delà, un saut de position est une erreur du GPS, pas une vitesse (m/s : 90 km/h). */
const GLITCH = 25;
/** fenêtre de calcul de la vitesse (ms) */
const WINDOW = 12000;

/**
 * Suivi en direct : position GPS projetée sur le tracé. On cherche d'abord près de la dernière
 * position connue pour ne pas sauter sur le retour d'un aller-retour ou sur un passage commun.
 * La vitesse vient du GPS (ou, à défaut, des dernières positions) ; une pause arrête le chrono.
 */
export class Follower {
  private watchId: number | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private cum: Float64Array;
  private lastIndex = 0;
  private fixes: { t: number; p: LngLat }[] = [];
  state: FollowState;

  constructor(
    private route: Route,
    private onChange: (s: FollowState) => void,
  ) {
    this.cum = cumulative(route.coords);
    this.state = {
      position: null,
      accuracy: null,
      heading: null,
      progress: 0,
      offset: null,
      speed: null,
      maxSpeed: 0,
      pausedAt: null,
      pausedMs: 0,
      error: null,
      startedAt: Date.now(),
    };
  }

  start() {
    if (!('geolocation' in navigator)) {
      this.emit({ error: 'La localisation n’est pas disponible sur cet appareil.' });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.update([pos.coords.longitude, pos.coords.latitude], pos.coords.accuracy, pos.coords.heading, pos.coords.speed, pos.timestamp),
      (err) =>
        this.emit({
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Autorise la localisation pour Boucle dans Réglages, puis réessaie.'
              : 'Position GPS introuvable pour le moment.',
        }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    void this.lockScreen();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible' && this.watchId != null) void this.lockScreen();
  };

  private async lockScreen() {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl) this.wakeLock = await wl.request('screen');
    } catch {
      /* l'écran pourra se mettre en veille */
    }
  }

  /** Pause : le chrono s'arrête (la position reste suivie). */
  pause() {
    if (this.state.pausedAt != null) return;
    this.emit({ pausedAt: Date.now(), speed: null });
  }

  resume() {
    const at = this.state.pausedAt;
    if (at == null) return;
    this.fixes = [];
    this.emit({ pausedAt: null, pausedMs: this.state.pausedMs + (Date.now() - at) });
  }

  update(p: LngLat, accuracy: number | null = null, heading: number | null = null, gpsSpeed: number | null = null, t = Date.now()) {
    const n = this.route.coords.length;
    const windowPts = 400;
    let hit = nearestOnRoute(this.route.coords, this.cum, p, this.lastIndex - 40, this.lastIndex + windowPts);
    if (hit.dist > 60) {
      const global = nearestOnRoute(this.route.coords, this.cum, p, 0, n - 1);
      if (global.dist < hit.dist - 20) hit = global;
    }
    this.lastIndex = hit.index;
    const speed = this.state.pausedAt != null ? null : this.speedFrom(p, t, gpsSpeed);
    this.emit({
      position: p,
      accuracy,
      heading: heading != null && Number.isFinite(heading) ? heading : null,
      progress: hit.dist <= 60 ? hit.s : this.state.progress,
      offset: hit.dist,
      speed,
      maxSpeed: speed != null ? Math.max(this.state.maxSpeed, speed) : this.state.maxSpeed,
      error: null,
    });
  }

  /** Vitesse lissée : celle du GPS quand il la donne, sinon le chemin des 12 dernières secondes. */
  private speedFrom(p: LngLat, t: number, gps: number | null): number | null {
    const last = this.fixes.at(-1);
    // Même position reçue deux fois (GPS de la page et de l'app native) : rien de neuf pour la vitesse.
    if (last && t <= last.t + 200) return this.state.speed;
    if (last && haversine(last.p, p) / ((t - last.t) / 1000) > GLITCH) {
      // Saut impossible : on repart de ce point (si c'était l'erreur, le point suivant fera de même).
      this.fixes = [{ t, p }];
      return this.state.speed;
    }
    this.fixes.push({ t, p });
    while (this.fixes.length > 2 && t - this.fixes[0].t > WINDOW) this.fixes.shift();
    let path: number | null = null;
    if (this.fixes.length >= 2) {
      const dt = (t - this.fixes[0].t) / 1000;
      if (dt >= 3) {
        let d = 0;
        for (let i = 1; i < this.fixes.length; i++) d += haversine(this.fixes[i - 1].p, this.fixes[i].p);
        path = d / dt;
      }
    }
    // La vitesse du GPS (effet Doppler) est la plus juste ; certains appareils donnent 0 en roulant.
    const g = gps != null && Number.isFinite(gps) && gps >= 0 ? gps : null;
    const v = g != null && !(g === 0 && path != null && path > 1) ? g : path;
    if (v == null) return this.state.speed;
    const prev = this.state.speed;
    return prev == null ? v : prev * 0.6 + v * 0.4;
  }

  private emit(patch: Partial<FollowState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  stop() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }
}

/* ------------------------------ Chiffres du suivi ------------------------------ */

export interface FollowStats {
  bike: boolean;
  /** fait, restant (m), part faite (0 à 1) */
  done: number;
  left: number;
  ratio: number;
  /** temps en mouvement (s) */
  moving: number;
  /** vitesse du moment et moyenne (m/s) */
  speed: number | null;
  avg: number | null;
  maxSpeed: number;
  /** D+ fait et D+ du parcours (m) */
  climbed: number;
  climb: number;
  /** heure d'arrivée estimée (ms) */
  eta: number | null;
  paused: boolean;
  finished: boolean;
}

/** Tous les chiffres du suivi, pour l'écran et pour l'écran verrouillé. */
export function followStats(r: Route, f: FollowState, cumAscent: Float64Array, bike: boolean, now = Date.now()): FollowStats {
  const done = f.progress;
  const left = Math.max(0, r.lengthM - done);
  const moving = movingSeconds(f, now);
  const avg = done >= 200 && moving >= 45 ? done / moving : null;
  // L'arrivée : à l'allure moyenne tenue, sinon à celle prévue pour le parcours.
  const pace = avg ?? (r.durationS > 0 ? r.lengthM / r.durationS : null);
  return {
    bike,
    done,
    left,
    ratio: r.lengthM ? Math.min(1, done / r.lengthM) : 0,
    moving,
    speed: f.speed,
    avg,
    maxSpeed: f.maxSpeed,
    climbed: Math.round(ascentAt(r, cumAscent, done)),
    climb: Math.round(r.ascent),
    eta: pace && pace > 0.3 ? now + (left / pace) * 1000 : null,
    paused: f.pausedAt != null,
    finished: left < 40 && done > r.lengthM * 0.9,
  };
}

/** Chrono : 27:41, ou 1:02:05 au-delà d'une heure. */
export function chrono(s: number): string {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Allure (course) : 5:12 par km ; « – » à l'arrêt ou trop lent pour une allure. */
export function paceValue(mps: number | null): string {
  if (mps == null || mps < 0.5) return '–';
  const s = Math.round(1000 / mps);
  if (s >= 60 * 60) return '–';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Vitesse (vélo) : 24,3 km/h. */
export function speedValue(mps: number | null): string {
  if (mps == null) return '–';
  return (mps * 3.6).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export const clock = (ms: number) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(ms);
