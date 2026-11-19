/**
 * Lever et coucher du soleil, calculés sur l'appareil (formules classiques de l'almanach astronomique :
 * anomalie moyenne, longitude écliptique, déclinaison, angle horaire). Précision de l'ordre de la minute.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;

export interface SunTimes {
  /** lever et coucher du soleil (ms) ; null pendant la nuit ou le jour polaires */
  sunrise: number | null;
  sunset: number | null;
  /** début de l'aube et fin du crépuscule civils (soleil 6° sous l'horizon) : avant et après, il fait nuit */
  dawn: number | null;
  dusk: number | null;
}

export function sunTimes(ms: number, lat: number, lng: number): SunTimes {
  const lw = -lng * RAD;
  const phi = lat * RAD;
  const n = Math.round(toDays(ms) - J0 - lw / (2 * Math.PI));
  const transit = (ha: number) => J0 + (ha + lw) / (2 * Math.PI) + n;
  const ds = transit(0);
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(RAD * 23.4397) * Math.sin(L));
  const julian = (d: number) => J2000 + d + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const noon = julian(ds);
  /** heures (ms) où le soleil passe à `deg` degrés de hauteur, le matin et le soir */
  const at = (deg: number): [number, number] | null => {
    const cos = (Math.sin(deg * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cos < -1 || cos > 1) return null;
    const set = julian(transit(Math.acos(cos)));
    return [fromJulian(noon - (set - noon)), fromJulian(set)];
  };
  const sun = at(-0.833);
  const civil = at(-6);
  return { sunrise: sun?.[0] ?? null, sunset: sun?.[1] ?? null, dawn: civil?.[0] ?? null, dusk: civil?.[1] ?? null };
}
