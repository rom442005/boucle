import type { Profile } from './types';

/** Montées : du rose clair (plat) au grenat (montée raide). */
export const RAMP = ['#FF7A96', '#FF2D55', '#DE1446', '#B00D38', '#7C0A2A'] as const;
/** Descentes : de la lavande (2 à 5 %) à l'indigo (descente raide), pour lire le D− d'un coup d'œil. */
export const RAMP_DOWN = ['#9F9CF5', '#7B77EA', '#5A55D8', '#3C37B4'] as const;
export const RAMP_LABELS = ['Moins de 2 %', '2 à 5 %', '5 à 8 %', '8 à 12 %', 'Plus de 12 %'] as const;
/** Qualificatif d'une pente selon sa classe (1 à 4). */
export const SLOPE_WORDS = ['', 'douce', 'soutenue', 'raide', 'très raide'] as const;

export function gradeClass(g: number): number {
  if (g < 2) return 0;
  if (g < 5) return 1;
  if (g < 8) return 2;
  if (g < 12) return 3;
  return 4;
}

/** Classe de pente signée : 0 plat (moins de 2 %), 1 à 4 en montée, −1 à −4 en descente. */
export function slopeClass(g: number): number {
  const c = gradeClass(Math.abs(g));
  return g < 0 ? -c : c;
}

/** Couleur d'une classe de pente signée. */
export function slopeColor(c: number): string {
  return c >= 0 ? RAMP[Math.min(c, 4)] : RAMP_DOWN[Math.min(-c, 4) - 1];
}

/** Moyenne glissante centrée sur 2*half+1 échantillons (fenêtre symétrique réduite aux extrémités). */
export function smooth(v: number[], half: number): number[] {
  const n = v.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    const h = Math.min(half, i, n - 1 - i);
    for (let k = i - h; k <= i + h; k++) {
      s += v[k];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

/** Nettoie un tableau d'altitudes (valeurs manquantes ou aberrantes). */
export function cleanElevation(raw: (number | null | undefined)[]): number[] {
  const out: number[] = [];
  let last = raw.find((x) => typeof x === 'number' && x > -500 && x < 9000) ?? 0;
  for (const x of raw) {
    if (typeof x === 'number' && x > -500 && x < 9000) last = x;
    out.push(last as number);
  }
  return out;
}

export function distanceAt(profile: Profile, i: number, lengthM: number): number {
  return Math.min(i * profile.step, lengthM);
}

export function eleAt(profile: Profile, s: number): number {
  const { ele, step } = profile;
  if (!ele.length) return 0;
  const x = Math.max(0, s / step);
  const i = Math.min(ele.length - 1, Math.floor(x));
  const j = Math.min(ele.length - 1, i + 1);
  const t = x - i;
  return ele[i] + (ele[j] - ele[i]) * Math.min(1, Math.max(0, t));
}

export interface ElevationStats {
  ascent: number;
  descent: number;
  minEle: number;
  maxEle: number;
  maxGrade: number;
}

/**
 * Dénivelés à partir du profil (un point tous les `step` m) :
 * lissage sur ~150 m puis seuil d'hystérésis de 1 m pour ignorer le bruit du modèle de terrain.
 */
export function elevationStats(profile: Profile): ElevationStats {
  const { ele, step } = profile;
  if (ele.length < 2) return { ascent: 0, descent: 0, minEle: ele[0] ?? 0, maxEle: ele[0] ?? 0, maxGrade: 0 };
  const half = Math.max(1, Math.round(75 / step));
  const sm = smooth(ele, half);
  let ascent = 0;
  let descent = 0;
  let ref = sm[0];
  for (let i = 1; i < sm.length; i++) {
    const d = sm[i] - ref;
    if (d >= 1) {
      ascent += d;
      ref = sm[i];
    } else if (d <= -1) {
      descent -= d;
      ref = sm[i];
    }
  }
  const g = grades(profile);
  return {
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    minEle: Math.round(Math.min(...ele)),
    maxEle: Math.round(Math.max(...ele)),
    maxGrade: Math.round(Math.max(0, ...g) * 10) / 10,
  };
}

/** Pente (%) de chaque intervalle i -> i+1, lissée sur ~100 m. */
export function grades(profile: Profile, windowM = 100): number[] {
  const { ele, step } = profile;
  if (ele.length < 2) return [];
  const half = Math.max(1, Math.round(windowM / step / 2));
  const sm = smooth(ele, 1);
  const out: number[] = [];
  for (let i = 0; i < ele.length - 1; i++) {
    const a = Math.max(0, i - half + 1);
    const b = Math.min(ele.length - 1, i + half);
    const run = (b - a) * step;
    out.push(run > 0 ? ((sm[b] - sm[a]) / run) * 100 : 0);
  }
  return out;
}

/** Inverse un profil (sens de parcours inversé). */
export function reverseProfile(profile: Profile, lengthM: number): Profile {
  // Les échantillons sont réguliers sauf le dernier : on rééchantillonne pour garder un pas constant.
  const n = Math.max(2, Math.floor(lengthM / profile.step) + 1);
  const ele: number[] = [];
  for (let i = 0; i < n; i++) ele.push(eleAt(profile, Math.max(0, lengthM - i * profile.step)));
  return { step: profile.step, ele };
}

/** Réduit un profil à au plus `max` points (pour l'enregistrement et le partage). */
export function decimateProfile(profile: Profile, lengthM: number, max = 400): Profile {
  if (profile.ele.length <= max) return { step: profile.step, ele: profile.ele.map((x) => Math.round(x * 10) / 10) };
  const step = lengthM / (max - 1);
  const ele: number[] = [];
  for (let i = 0; i < max; i++) ele.push(Math.round(eleAt(profile, i * step) * 10) / 10);
  return { step, ele };
}

/* ------------------------------ Côtes et descentes ------------------------------ */

export interface Climb {
  /** montée (true) ou descente */
  up: boolean;
  /** début et fin, en mètres depuis le départ */
  from: number;
  to: number;
  /** dénivelé franchi (m, positif) */
  gain: number;
  /** pente moyenne et pente maximale sur ~100 m (%, positives) */
  avg: number;
  max: number;
  /** classe de pente signée de la moyenne (couleur, qualificatif) */
  cls: number;
}

/** Points hauts et bas alternés : un changement de sens n'est retenu qu'au-delà de `h` mètres. */
function zigzag(v: number[], h: number): number[] {
  const piv = [0];
  let dir = 0;
  let ext = 0;
  let mn = 0;
  let mx = 0;
  for (let i = 1; i < v.length; i++) {
    if (dir === 0) {
      if (v[i] < v[mn]) mn = i;
      if (v[i] > v[mx]) mx = i;
      if (v[i] - v[mn] >= h) {
        if (mn !== 0) piv.push(mn);
        dir = 1;
        ext = i;
      } else if (v[mx] - v[i] >= h) {
        if (mx !== 0) piv.push(mx);
        dir = -1;
        ext = i;
      }
    } else if (dir === 1) {
      if (v[i] >= v[ext]) ext = i;
      else if (v[ext] - v[i] >= h) {
        piv.push(ext);
        dir = -1;
        ext = i;
      }
    } else {
      if (v[i] <= v[ext]) ext = i;
      else if (v[i] - v[ext] >= h) {
        piv.push(ext);
        dir = 1;
        ext = i;
      }
    }
  }
  if (dir !== 0 && ext > piv[piv.length - 1]) piv.push(ext);
  return piv;
}

/**
 * Côtes et descentes notables d'un profil : points hauts et bas repérés avec une hystérésis de 4 m
 * (le bruit du modèle de terrain est ignoré), bords plats rognés, puis gardées si elles font au moins
 * 12 m de dénivelé, 120 m de long et 2 % de moyenne. Au plus `limit`, les plus marquées, dans l'ordre du parcours.
 */
export function climbs(profile: Profile, lengthM: number, limit = 8): Climb[] {
  const { ele, step } = profile;
  if (ele.length < 4) return [];
  const sm = smooth(ele, Math.max(1, Math.round(40 / step)));
  const g = grades(profile);
  const piv = zigzag(sm, 4);
  const out: Climb[] = [];
  for (let k = 0; k + 1 < piv.length; k++) {
    let a = piv[k];
    let b = piv[k + 1];
    const up = sm[b] > sm[a];
    const sign = up ? 1 : -1;
    // Bords plats rognés : la côte commence quand ça monte vraiment.
    while (a < b - 1 && sign * (g[a] ?? 0) < 1.5) a++;
    while (b > a + 1 && sign * (g[b - 1] ?? 0) < 1.5) b--;
    const from = a * step;
    const to = Math.min(b * step, lengthM);
    const len = to - from;
    const gain = Math.abs(sm[b] - sm[a]);
    if (len < 120 || gain < 12) continue;
    const avg = (gain / len) * 100;
    if (avg < 2) continue;
    let max = 0;
    for (let i = a; i < b; i++) max = Math.max(max, sign * (g[i] ?? 0));
    out.push({ up, from, to, gain: Math.round(gain), avg: Math.round(avg * 10) / 10, max: Math.round(Math.max(max, avg) * 10) / 10, cls: sign * Math.max(1, gradeClass(avg)) });
  }
  const strongest = [...out].sort((x, y) => y.gain * y.avg - x.gain * x.avg).slice(0, limit);
  return out.filter((c) => strongest.includes(c));
}

const climbCache = new WeakMap<Profile, Climb[]>();
/** Côtes et descentes d'un parcours (mémorisées par profil). */
export function climbsOf(r: { profile: Profile; lengthM: number }): Climb[] {
  let c = climbCache.get(r.profile);
  if (!c) climbCache.set(r.profile, (c = climbs(r.profile, r.lengthM)));
  return c;
}
