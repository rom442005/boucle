import type { EnvClass, Sport } from './types';
import type { HistoryEntry } from './persist';

/*
 * Paysages en fond des écrans sans parcours (accueil, réglages sur iPhone, profil, Mes parcours), sous des
 * blocs de verre. Photos Unsplash (licence Unsplash, usage libre), servies avec l'app. La teinte d'attente
 * reprend le ton dominant de chaque photo, le temps qu'elle arrive.
 */
export type Scene = 'run' | 'trail' | 'road' | 'gravel' | 'welcome' | 'profile' | 'library';

export const SCENES: Record<Scene, { src: string; tone: string }> = {
  run: { src: 'scenes/run.jpg', tone: '#3d4a2a' },
  trail: { src: 'scenes/trail.jpg', tone: '#5d6170' },
  road: { src: 'scenes/road.jpg', tone: '#4f5d3c' },
  gravel: { src: 'scenes/gravel.jpg', tone: '#7a8584' },
  welcome: { src: 'scenes/welcome.jpg', tone: '#8d9c96' },
  profile: { src: 'scenes/profile.jpg', tone: '#b77a68' },
  library: { src: 'scenes/library.jpg', tone: '#2e5656' },
};

export const sceneUrl = (s: Scene) => import.meta.env.BASE_URL + SCENES[s].src;

export const SPORT_EMOJI: Record<Sport, string> = { run: '🏃', trail: '⛰️', road: '🚴', gravel: '🚵' };
export const ENV_EMOJI: Record<EnvClass, string> = { forest: '🌲', water: '🌊', park: '🌳', fields: '🌾', urban: '🏙️' };

/** Le ciel en un émoji, d'après le code météo OMM. */
export function skyEmoji(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code <= 2) return isDay ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code === 85 || code === 86) return '🌨️';
  if (code >= 95) return '⛈️';
  if (code >= 51) return '🌧️';
  return '🌤️';
}

/** Lundi 0 h de la semaine de `t`. */
function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Les sorties de la semaine en cours : distance par jour (lundi → dimanche), total et nombre. */
export function weekActivity(history: HistoryEntry[], now = Date.now()) {
  const from = weekStart(now);
  const days = Array(7).fill(0) as number[];
  let count = 0;
  for (const h of history) {
    if (h.date < from || h.date >= from + 7 * 86400000) continue;
    days[Math.min(6, Math.floor((h.date - from) / 86400000))] += h.distanceM;
    count++;
  }
  return { days, total: days.reduce((a, b) => a + b, 0), count, today: Math.min(6, Math.floor((now - from) / 86400000)) };
}

/** Les huit dernières semaines : distance par semaine (la plus ancienne d'abord), et le mois en cours. */
export function recentActivity(history: HistoryEntry[], now = Date.now()) {
  const w0 = weekStart(now);
  const weeks = Array(8).fill(0) as number[];
  const m = new Date(now);
  const monthFrom = new Date(m.getFullYear(), m.getMonth(), 1).getTime();
  let month = 0;
  let monthCount = 0;
  let monthTime = 0;
  for (const h of history) {
    const k = 7 - Math.floor((w0 - weekStart(h.date)) / (7 * 86400000));
    if (k >= 0 && k < 8) weeks[k] += h.distanceM;
    if (h.date >= monthFrom) {
      month += h.distanceM;
      monthCount++;
      monthTime += h.durationS ?? 0;
    }
  }
  return { weeks, month, monthCount, monthTime };
}
