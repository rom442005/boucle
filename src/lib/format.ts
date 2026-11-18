/** Espace fine insécable, utilisée avant les unités et le signe %. */
export const NNBSP = ' ';

const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function kmValue(m: number): string {
  const km = m / 1000;
  if (km >= 100) return nf0.format(km);
  return nf1.format(km);
}

export function km(m: number): string {
  return `${kmValue(m)}${NNBSP}km`;
}

/** Valeur d'un curseur de distance : 10 km, 10,5 km. */
export function kmSetting(v: number): string {
  return Number.isInteger(v) ? nf0.format(v) : nf1.format(v);
}

export function meters(v: number): string {
  return `${nf0.format(Math.round(v))}${NNBSP}m`;
}

export function percent(f: number): string {
  return `${nf0.format(Math.round(f * 100))}${NNBSP}%`;
}

export function grade(g: number): string {
  const v = Math.round(g);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}${NNBSP}%`;
}

export function duration(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return `${min}${NNBSP}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}${NNBSP}h${NNBSP}${String(m).padStart(2, '0')}`;
}

export function pace(sPerKm: number): string {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}${NNBSP}/km`;
}

export function speed(kmh: number): string {
  return `${nf0.format(kmh)}${NNBSP}km/h`;
}

export function dateShort(ts: number): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(ts);
}

/** Nom de fichier sûr. */
export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'parcours'
  );
}
