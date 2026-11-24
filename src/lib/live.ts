import { registerPlugin } from '@capacitor/core';
import { isAndroid, isIOS, isNativeApp } from './platform';
import { chrono, clock, paceValue, speedValue, type FollowStats } from './follow';
import { kmValue, NNBSP } from './format';

/*
 * Écran verrouillé, comme Strava : pendant le suivi, l'app du téléphone montre la sortie sans déverrouiller.
 * Android : une notification permanente (service au premier plan, qui garde aussi le GPS actif), avec le chrono
 * qui tourne, la distance, l'allure, le restant, une barre de progression et les boutons Pause et Terminer.
 * iPhone : une Activité en direct (écran verrouillé et Dynamic Island), voir ios/App/BoucleLive.
 * App installée depuis Safari (ou Chrome sur Android) : iOS endort une page web écran éteint, le suivi s'y
 * arrête et rien ne peut s'y mettre à jour. Au moment où l'écran s'éteint, une notification (une seule,
 * remplacée à chaque fois) montre la sortie sur l'écran verrouillé ; elle s'efface au retour dans l'app.
 */

export interface LiveCard {
  /** « Course · Boucle de l'Erdre » */
  title: string;
  /** « 3,42 km » */
  distance: string;
  /** « Allure » ou « Vitesse », et sa valeur (« 5:12 /km », « 24,3 km/h ») */
  metricLabel: string;
  metric: string;
  /** « 6,6 km » */
  left: string;
  /** heure d'arrivée estimée (« 18:42 ») */
  eta: string | null;
  /** 0 à 1 */
  progress: number;
  /** base du chrono (ms) : départ + pauses, pour qu'il tourne tout seul sur l'écran verrouillé */
  chronoBase: number;
  /** chrono figé pendant une pause (« 27:41 ») */
  elapsed: string;
  paused: boolean;
}

interface LivePlugin {
  start(card: LiveCard): Promise<void>;
  update(card: LiveCard): Promise<void>;
  end(): Promise<void>;
  addListener(event: 'action', cb: (e: { action: 'pause' | 'resume' | 'stop' }) => void): Promise<{ remove(): Promise<void> }>;
  addListener(event: 'position', cb: (e: LivePosition) => void): Promise<{ remove(): Promise<void> }>;
}

/** Position lue par l'app native (écran éteint compris). */
export interface LivePosition {
  lon: number;
  lat: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  time: number;
}

// Créé seulement dans l'app ; jamais rendu par une promesse (le module natif répond à « then », voir health.ts).
const Live: LivePlugin | null = isNativeApp ? registerPlugin<LivePlugin>('BoucleLive') : null;

export function liveCard(s: FollowStats, title: string, startedAt: number, pausedMs: number): LiveCard {
  return {
    title,
    distance: `${kmValue(s.done)}${NNBSP}km`,
    metricLabel: s.bike ? 'Vitesse' : 'Allure',
    metric: s.bike ? `${speedValue(s.speed)}${NNBSP}km/h` : `${paceValue(s.speed)}${NNBSP}/km`,
    left: `${kmValue(s.left)}${NNBSP}km`,
    eta: s.eta ? clock(s.eta) : null,
    progress: s.ratio,
    chronoBase: startedAt + pausedMs,
    elapsed: chrono(s.moving),
    paused: s.paused,
  };
}

/* ------------------------- App web : notification sur l'écran verrouillé ------------------------- */

const webLock = !isNativeApp && (isIOS || isAndroid) && typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
const TAG = 'boucle-suivi';

async function closeNotice() {
  if (!webLock) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    for (const n of (await reg?.getNotifications({ tag: TAG })) ?? []) n.close();
  } catch {
    /* rien à fermer */
  }
}

async function showNotice(card: LiveCard) {
  if (!webLock || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.showNotification(`${card.paused ? 'Sortie en pause' : 'Sortie en cours'} · ${card.distance}`, {
      body: `${card.elapsed} · ${card.metricLabel.toLowerCase()} ${card.metric} · reste ${card.left}. Le suivi reprend dès que tu rouvres Boucle.`,
      tag: TAG,
      silent: true,
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    } as NotificationOptions);
  } catch {
    /* notifications indisponibles : rien sur l'écran verrouillé */
  }
}

let lastSent = 0;
let lastPaused = false;
let subs: { remove(): Promise<void> }[] = [];

export const live = {
  /**
   * À appeler dans le geste qui lance le suivi (iOS ne demande l'accord qu'au toucher) : l'app web demande
   * une fois de pouvoir afficher la sortie sur l'écran verrouillé.
   */
  ask() {
    if (webLock && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
  },
  /** L'écran s'éteint ou l'app passe en arrière-plan (app web) : la sortie s'affiche en notification. */
  hidden(card: LiveCard) {
    void showNotice(card);
  },
  shown() {
    void closeNotice();
  },
  async start(card: LiveCard, onAction: (a: 'pause' | 'resume' | 'stop') => void, onPosition: (p: LivePosition) => void) {
    const p = Live;
    if (!p) return;
    lastSent = Date.now();
    lastPaused = card.paused;
    try {
      await Promise.all(subs.map((x) => x.remove().catch(() => {})));
      subs = [await p.addListener('action', (e) => onAction(e.action)), await p.addListener('position', onPosition)];
      await p.start(card);
    } catch {
      /* pas d'écran verrouillé sur cet appareil : le suivi continue */
    }
  },
  /** Au plus toutes les 5 s (le chrono tourne tout seul), tout de suite à la pause et à la reprise. */
  async update(card: LiveCard) {
    if (!isNativeApp) return;
    const now = Date.now();
    if (now - lastSent < 5000 && card.paused === lastPaused) return;
    lastSent = now;
    lastPaused = card.paused;
    await Live?.update(card).catch(() => {});
  },
  async end() {
    void closeNotice();
    if (!Live) return;
    await Promise.all(subs.map((x) => x.remove().catch(() => {})));
    subs = [];
    await Live.end().catch(() => {});
  },
};
