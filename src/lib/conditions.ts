/**
 * Conditions d'une sortie qui partirait maintenant : la météo du moment (Open-Meteo) et la lumière du jour
 * (coucher du soleil, nuit), dites en clair.
 */
import type { Weather } from './services';
import type { IconName } from './icons';
import { NNBSP } from './format';
import { sunTimes } from './sun';

/** Heure à la française : 17 h 14. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}${NNBSP}h${NNBSP}${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Le temps qu'il fait, d'après le code météo OMM. */
export function sky(code: number, isDay: boolean): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Ciel clair', icon: isDay ? 'sun' : 'moon' };
  if (code === 1) return { label: 'Peu nuageux', icon: isDay ? 'cloudSun' : 'cloudMoon' };
  if (code === 2) return { label: 'Éclaircies', icon: isDay ? 'cloudSun' : 'cloudMoon' };
  if (code === 3) return { label: 'Couvert', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Brouillard', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Bruine', icon: 'rain' };
  if (code >= 61 && code <= 67) return { label: code === 65 || code === 67 ? 'Forte pluie' : 'Pluie', icon: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Neige', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Averses', icon: 'rain' };
  if (code === 85 || code === 86) return { label: 'Averses de neige', icon: 'snow' };
  if (code >= 95) return { label: 'Orage', icon: 'storm' };
  return { label: 'Nuageux', icon: 'cloud' };
}

const WIND_FROM = ['du nord', 'du nord-est', 'd’est', 'du sud-est', 'du sud', 'du sud-ouest', 'd’ouest', 'du nord-ouest'];

export function windText(w: Weather): string {
  const kmh = Math.round(w.windKmh);
  if (kmh < 6) return 'Vent faible';
  return `Vent ${WIND_FROM[Math.round((((w.windFrom % 360) + 360) % 360) / 45) % 8]} à ${kmh}${NNBSP}km/h`;
}

export interface Line {
  icon: IconName;
  title: string;
  sub: string;
  /** à signaler : départ ou retour dans le noir */
  warn?: boolean;
}

export function weatherLine(w: Weather): Line {
  const s = sky(w.code, w.isDay);
  return { icon: s.icon, title: `${Math.round(w.temperature)}${NNBSP}°C · ${s.label}`, sub: windText(w) };
}

/** La lumière pour une sortie de `durationS` secondes qui partirait à `now`. */
export function daylightLine(now: number, lat: number, lng: number, durationS: number): Line | null {
  const t = sunTimes(now, lat, lng);
  if (t.sunrise == null || t.sunset == null || t.dawn == null || t.dusk == null) return null;
  const end = now + durationS * 1000;
  if (now < t.dawn) return { icon: 'moon', warn: true, title: 'Départ de nuit', sub: `Lever du soleil à ${clock(t.sunrise)}` };
  if (now > t.dusk) return { icon: 'moon', warn: true, title: 'Départ de nuit', sub: `Nuit depuis ${clock(t.dusk)}` };
  if (end <= t.sunset) return { icon: 'sunHorizon', title: `Retour vers ${clock(end)}, de jour`, sub: `Coucher du soleil à ${clock(t.sunset)}` };
  if (end <= t.dusk) return { icon: 'sunHorizon', warn: true, title: `Retour vers ${clock(end)}, au crépuscule`, sub: `Coucher du soleil à ${clock(t.sunset)}` };
  return { icon: 'moon', warn: true, title: `Retour vers ${clock(end)}, de nuit`, sub: `Nuit à ${clock(t.dusk)}` };
}

/** Pour l'option « Rues éclairées » : quand la nuit tombe ce soir. */
export function nightfall(now: number, lat: number, lng: number): string | null {
  const t = sunTimes(now, lat, lng);
  if (t.dawn == null || t.dusk == null) return null;
  if (now < t.dawn || now > t.dusk) return 'Il fait nuit en ce moment';
  return `Nuit à ${clock(t.dusk)} ce soir`;
}
