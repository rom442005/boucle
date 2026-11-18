import type { LngLat, Route } from './types';
import { cumulative, nearestOnRoute } from './geo';

export interface FollowState {
  position: LngLat | null;
  accuracy: number | null;
  heading: number | null;
  /** distance parcourue le long du tracé (m) */
  progress: number;
  /** écart au tracé (m) */
  offset: number | null;
  error: string | null;
  startedAt: number;
}

/**
 * Suivi en direct : position GPS projetée sur le tracé. On cherche d'abord près de la dernière
 * position connue pour ne pas sauter sur le retour d'un aller-retour ou sur un passage commun.
 */
export class Follower {
  private watchId: number | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private cum: Float64Array;
  private lastIndex = 0;
  state: FollowState;

  constructor(
    private route: Route,
    private onChange: (s: FollowState) => void,
  ) {
    this.cum = cumulative(route.coords);
    this.state = { position: null, accuracy: null, heading: null, progress: 0, offset: null, error: null, startedAt: Date.now() };
  }

  start() {
    if (!('geolocation' in navigator)) {
      this.emit({ error: 'La localisation n’est pas disponible sur cet appareil.' });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.update([pos.coords.longitude, pos.coords.latitude], pos.coords.accuracy, pos.coords.heading),
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

  update(p: LngLat, accuracy: number | null = null, heading: number | null = null) {
    const n = this.route.coords.length;
    const windowPts = 400;
    let hit = nearestOnRoute(this.route.coords, this.cum, p, this.lastIndex - 40, this.lastIndex + windowPts);
    if (hit.dist > 60) {
      const global = nearestOnRoute(this.route.coords, this.cum, p, 0, n - 1);
      if (global.dist < hit.dist - 20) hit = global;
    }
    this.lastIndex = hit.index;
    this.emit({
      position: p,
      accuracy,
      heading: heading != null && Number.isFinite(heading) ? heading : null,
      progress: hit.dist <= 60 ? hit.s : this.state.progress,
      offset: hit.dist,
      error: null,
    });
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
