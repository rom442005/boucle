/*
 * Boucle+ et publicités, en simulation (voir plus.ts et ads.ts). L'aperçu des publicités s'allume dans
 * Profil › Boucle+ ou par l'adresse ?demo=pub ; un abonné Boucle+ n'en voit aucune.
 */
import { app } from './state.svelte';
import { advance, cancel, loadPlus, monthOf, nextMonth, priceFor, savePlus, streakAt, subscribe, type PlusSim } from './plus';
import { contextual, pickAds, type Ad, type AdSignals } from './ads';

const RAIN = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

class Promo {
  sim = $state<PlusSim>(loadPlus());
  /** feuille Boucle+ ouverte */
  open = $state(false);
  /** publicités masquées pendant cette visite */
  hidden = $state<string[]>([]);

  constructor() {
    if (typeof location !== 'undefined' && /[?&]demo=pub\b/.test(location.search)) app.setFlag('pubSim', true);
  }

  /** aperçu des publicités allumé (et pas abonné) */
  get adsOn() {
    return !!app.flags.pubSim && !this.sim.active;
  }
  /** publicités choisies d'après le profil (sinon, seulement d'après la sortie affichée) */
  get personal() {
    return app.flags.pubPerso !== false;
  }
  setAds(on: boolean) {
    app.setFlag('pubSim', on);
  }
  setPersonal(on: boolean) {
    app.setFlag('pubPerso', on);
  }

  get streak() {
    return streakAt(this.sim.paid, this.sim.now);
  }
  /** prix du mois en cours si l'on est abonné, sinon prix d'un abonnement qui commencerait ce mois-ci */
  get price() {
    return priceFor(this.sim);
  }
  /** prix du mois prochain si l'on reste abonné */
  get nextPrice() {
    const paid = this.sim.paid.includes(this.sim.now) ? this.sim.paid : [...this.sim.paid, this.sim.now];
    return priceFor({ ...this.sim, paid }, nextMonth(this.sim.now));
  }
  private set(s: PlusSim) {
    this.sim = s;
    savePlus(s);
  }
  subscribe() {
    this.set(subscribe(this.sim));
    app.showToast('Boucle+ activé (simulation)');
  }
  cancel() {
    this.set(cancel(this.sim));
    app.showToast('Abonnement arrêté (simulation)', () => this.set(subscribe(this.sim)));
  }
  advance() {
    this.set(advance(this.sim));
  }
  /** La simulation repart de zéro, au mois réel. */
  reset() {
    this.set({ active: false, paid: [], now: monthOf(new Date()) });
  }

  /** Ce que l'app sait du sportif, lu sur l'appareil. */
  get signals(): AdSignals {
    const now = Date.now();
    const recent = app.history.filter((h) => now - h.date < 28 * 864e5);
    const all = app.history;
    const dark = all.length ? all.filter((h) => {
      const hr = new Date(h.date).getHours();
      return hr >= 18 || hr < 7;
    }).length / all.length : 0;
    // Le sport le plus pratiqué, sinon celui des réglages.
    const counts = new Map<string, number>();
    for (const h of all) counts.set(h.route.s, (counts.get(h.route.s) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const r = app.route;
    const w = app.weather;
    return {
      sport: (top as AdSignals['sport']) ?? app.params.sport,
      weekKm: recent.reduce((s, h) => s + h.distanceM, 0) / 1000 / 4,
      darkShare: dark,
      distanceKm: r ? r.lengthM / 1000 : app.params.distanceKm,
      climbPerKm: r ? r.ascent / Math.max(0.5, r.lengthM / 1000) : 0,
      envs: [...app.params.envs],
      temp: w ? w.temperature : null,
      rain: w ? RAIN.has(w.code) : false,
      totalKm: all.reduce((s, h) => s + h.distanceM, 0) / 1000,
    };
  }
  /** Les publicités à montrer, la plus pertinente d'abord. */
  get ads(): Ad[] {
    if (!this.adsOn) return [];
    const s = this.signals;
    return pickAds(this.personal ? s : contextual(s), this.hidden);
  }
  hide(id: string) {
    this.hidden = [...this.hidden, id];
  }
}

export const promo = new Promo();
