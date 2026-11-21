import type { EnvClass, Sport } from './types';
import type { HistoryEntry } from './persist';

/*
 * Paysages en fond des écrans sans parcours (accueil, réglages sur iPhone, profil, Mes parcours), sous des
 * blocs de verre. Sept photos Unsplash (licence Unsplash, usage libre) servies avec l'app, en deux tailles :
 * portrait pour l'iPhone, très grande pour les écrans larges. Elles tournent toutes les cinq minutes, les
 * mêmes partout au même moment ; la teinte dominante de chacune attend qu'elle soit là.
 */
export const SCENES = [
  { file: 's1', tone: '#3d4a2a' },
  { file: 's2', tone: '#5d6170' },
  { file: 's3', tone: '#4f5d3c' },
  { file: 's4', tone: '#7a8584' },
  { file: 's5', tone: '#8d9c96' },
  { file: 's6', tone: '#b77a68' },
  { file: 's7', tone: '#2e5656' },
] as const;

/** Durée de chaque photo. */
export const SCENE_MS = 5 * 60 * 1000;

/** La photo du moment (la même sur tous les écrans, d'un lancement à l'autre). */
export const sceneAt = (t = Date.now()) => Math.floor(t / SCENE_MS) % SCENES.length;

const big = () => typeof window !== 'undefined' && window.innerWidth * (window.devicePixelRatio || 1) > 1400;
export const sceneUrl = (i: number) => `${import.meta.env.BASE_URL}scenes/${SCENES[i].file}-${big() ? 'l' : 'm'}.jpg`;

const warmed = new Set<number>();
/** Télécharge et décode une photo à l'avance : elle apparaîtra sans attendre. */
export function warmScene(i: number) {
  if (warmed.has(i) || typeof Image === 'undefined') return;
  warmed.add(i);
  const img = new Image();
  img.decoding = 'async';
  img.src = sceneUrl(i);
  void img.decode?.().catch(() => warmed.delete(i));
}

/** Teinte de chaque sport (cartes du fil sans photo). */
export const SPORT_TONE: Record<Sport, string> = { run: '#3d4a2a', trail: '#5d6170', road: '#4f5d3c', gravel: '#7a8584' };

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
