import type { LngLat } from './types';
import { cumulative, haversine, localProjector } from './geo';

/*
 * Repasser sur ses pas : une portion du tracé qui reprend un chemin déjà parcouru, dans un sens ou dans
 * l'autre (impasse, aller-retour vers un point, départ et retour par la même rue), ou qui longe de tout
 * près une portion déjà faite (l'autre trottoir de la même rue, l'autre chaussée du même boulevard).
 * Croiser son propre tracé à un carrefour n'en est pas.
 */

export interface Stretch {
  /** portion qui repasse (m depuis le départ) */
  from: number;
  to: number;
  /** le même endroit, parcouru plus tôt (m depuis le départ) */
  firstFrom: number;
  firstTo: number;
  /** même chemin (true) ou chemin voisin, à quelques mètres (false) */
  exact: boolean;
  /** parcouru en sens inverse la seconde fois (demi-tour) */
  reverse: boolean;
}

export interface Retrace {
  stretches: Stretch[];
  /** longueur parcourue une seconde fois (m) */
  length: number;
  /** départ et retour par le même chemin : longueur commune (m) */
  stem: number;
}

const NONE: Retrace = { stretches: [], length: 0, stem: 0 };

/** Même chemin : moins de 3,5 m d'écart, dans un sens ou dans l'autre. */
const EXACT_TOL = 3.5;
/** Chemin voisin : moins de 14 m d'écart (les deux trottoirs d'une rue), sur au moins 60 m. */
const NEAR_TOL = 14;
const NEAR_MIN = 60;
/** Un chemin voisin n'est retenu que bien plus loin sur le tracé (les lacets d'un sentier ne comptent pas). */
const NEAR_SEP = 350;
const EXACT_MIN = 20;
const EXACT_SEP = 20;
const COS_EXACT = Math.cos((40 * Math.PI) / 180);
const COS_NEAR = Math.cos((25 * Math.PI) / 180);

/** Portions du tracé qui repassent là où il est déjà passé. */
export function findRetraces(coords: LngLat[]): Retrace {
  if (coords.length < 3) return NONE;
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  if (total < 100) return NONE;
  const step = total > 60000 ? 8 : total > 25000 ? 6 : 4;
  const n = Math.floor(total / step) + 1;
  const proj = localProjector(coords[0]);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = Math.min(total, k * step);
    while (seg < coords.length - 2 && cum[seg + 1] < s) seg++;
    const len = cum[seg + 1] - cum[seg];
    const t = len > 0 ? (s - cum[seg]) / len : 0;
    const [ax, ay] = proj.to(coords[seg]);
    const [bx, by] = proj.to(coords[seg + 1]);
    xs[k] = ax + (bx - ax) * t;
    ys[k] = ay + (by - ay) * t;
  }
  // Sens de marche en chaque point (sur ±2 pas).
  const ux = new Float64Array(n);
  const uy = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 2);
    const b = Math.min(n - 1, k + 2);
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const l = Math.hypot(dx, dy) || 1;
    ux[k] = dx / l;
    uy[k] = dy / l;
  }

  // Grille : chaque point n'est comparé qu'aux points déjà passés des cases voisines.
  const grid = new Map<number, number[]>();
  const cellOf = (x: number, y: number) => [Math.floor(x / NEAR_TOL), Math.floor(y / NEAR_TOL)];
  const keyOf = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
  const exact = new Int32Array(n).fill(-1);
  const near = new Int32Array(n).fill(-1);
  const sepExact = Math.ceil(EXACT_SEP / step);
  const sepNear = Math.ceil(NEAR_SEP / step);
  for (let k = 0; k < n; k++) {
    const [cx, cy] = cellOf(xs[k], ys[k]);
    let bestE = EXACT_TOL * EXACT_TOL;
    let bestN = NEAR_TOL * NEAR_TOL;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = grid.get(keyOf(cx + dx, cy + dy));
        if (!list) continue;
        for (const j of list) {
          if (k - j < sepExact) continue;
          const ddx = xs[k] - xs[j];
          const ddy = ys[k] - ys[j];
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > NEAR_TOL * NEAR_TOL) continue;
          const dot = Math.abs(ux[k] * ux[j] + uy[k] * uy[j]);
          if (d2 <= bestE && dot >= COS_EXACT) {
            bestE = d2;
            exact[k] = j;
          } else if (k - j >= sepNear && d2 <= bestN && dot >= COS_NEAR) {
            bestN = d2;
            near[k] = j;
          }
        }
      }
    }
    const key = keyOf(cx, cy);
    const list = grid.get(key);
    if (list) list.push(k);
    else grid.set(key, [k]);
  }

  const stretches: Stretch[] = [];
  const kept = new Uint8Array(n);
  const group = (match: Int32Array, isExact: boolean, minLen: number) => {
    let k = 0;
    while (k < n) {
      if (match[k] < 0 || kept[k]) {
        k++;
        continue;
      }
      const a = k;
      let b = k;
      let lo = match[k];
      let hi = match[k];
      const along = (i: number) => ux[i] * ux[match[i]] + uy[i] * uy[match[i]];
      let dir = along(k);
      // Un ou deux points manquants ne coupent pas une portion.
      let gap = 0;
      for (k = k + 1; k < n && gap <= 2; k++) {
        if (match[k] >= 0 && !kept[k]) {
          b = k;
          gap = 0;
          lo = Math.min(lo, match[k]);
          hi = Math.max(hi, match[k]);
          dir += along(k);
        } else gap++;
      }
      k = b + 1;
      const len = (b - a + 1) * step;
      if (len < minLen) continue;
      for (let i = a; i <= b; i++) kept[i] = 1;
      stretches.push({ from: a * step, to: Math.min(total, b * step), firstFrom: lo * step, firstTo: Math.min(total, hi * step), exact: isExact, reverse: dir < 0 });
    }
  };
  group(exact, true, EXACT_MIN);
  group(near, false, NEAR_MIN);
  stretches.sort((x, y) => x.from - y.from);
  let length = 0;
  for (let i = 0; i < n; i++) if (kept[i]) length += step;
  length = Math.min(length, total);
  // Départ et retour par le même chemin : une portion qui finit à l'arrivée et reprend le début du tracé.
  let stem = 0;
  for (const s of stretches) if (s.to >= total - 40 && s.firstFrom <= 40) stem = Math.max(stem, s.to - s.from);
  return { stretches, length, stem };
}

/**
 * Points à éviter pour qu'un nouveau calcul ne reprenne pas une portion déjà parcourue : le milieu des
 * tronçons du tracé, loin des carrefours (chaque sommet du tracé en est un). Les points proches des
 * lieux à garder (départ, points de passage) sont écartés : les éviter rendrait ces lieux inaccessibles.
 */
export function avoidPoints(coords: LngLat[], s: Stretch, keepAway: LngLat[], opts: { minDist?: number; max?: number } = {}): LngLat[] {
  const minDist = opts.minDist ?? 150;
  const max = opts.max ?? 6;
  const cum = cumulative(coords);
  const ranges: [number, number][] = [[s.from, s.to]];
  if (!s.exact) ranges.push([s.firstFrom, s.firstTo]);
  const out: LngLat[] = [];
  for (const [a, b] of ranges) {
    const picked: LngLat[] = [];
    let lastAt = -Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
      const s0 = cum[i];
      const s1 = cum[i + 1];
      if (s1 < a || s0 > b || s1 - s0 < 6) continue;
      const mid = (s0 + s1) / 2;
      if (mid - lastAt < 30) continue;
      const m: LngLat = [(coords[i][0] + coords[i + 1][0]) / 2, (coords[i][1] + coords[i + 1][1]) / 2];
      if (keepAway.some((q) => haversine(q, m) < minDist)) continue;
      picked.push(m);
      lastAt = mid;
    }
    // Au plus `max` points par portion, répartis sur toute sa longueur.
    const stride = Math.max(1, Math.ceil(picked.length / max));
    for (let i = 0; i < picked.length; i += stride) out.push(picked[i]);
  }
  return out;
}

/**
 * Détours en cul-de-sac : le tracé entre dans une impasse (ou une petite boucle au bout d'une impasse),
 * fait demi-tour et ressort par où il est entré. Renvoie les portions à retirer (de l'entrée à la sortie,
 * qui sont au même endroit). Le départ et l'arrivée, eux, ne sont pas touchés.
 */
export function deadEnds(coords: LngLat[], rt: Retrace, keep: LngLat[] = [], maxTurnShare = 0.35, keepRadius = 60): { from: number; to: number }[] {
  if (!rt.stretches.length) return [];
  const total = cumulative(coords).at(-1) ?? 0;
  // Un même aller-retour peut être morcelé (même chemin, puis l'autre chaussée, puis le même chemin) :
  // les morceaux qui se suivent, à l'aller comme au retour, n'en font qu'un.
  const parts = rt.stretches.filter((s) => s.reverse).sort((a, b) => a.from - b.from);
  const joined: Stretch[] = [];
  for (const s of parts) {
    const last = joined[joined.length - 1];
    if (last && s.from - last.to <= 150 && last.firstFrom - s.firstTo <= 150) {
      last.to = Math.max(last.to, s.to);
      last.firstFrom = Math.min(last.firstFrom, s.firstFrom);
      last.firstTo = Math.max(last.firstTo, s.firstTo);
      last.exact = last.exact || s.exact;
    } else joined.push({ ...s });
  }
  const out: { from: number; to: number }[] = [];
  for (const s of joined) {
    if (!s.exact) continue;
    // Le demi-tour (entre l'aller et le retour) : un rond de cul-de-sac, une boucle de parking, ou le
    // petit tour d'un point de passage tombé au bout d'une seule route (de l'autre côté d'un fleuve).
    const turn = s.from - s.firstTo;
    if (turn < 0 || turn > Math.max(250, maxTurnShare * total)) continue;
    if (s.firstFrom <= 40 && s.to >= total - 40) continue;
    const cut = { from: s.firstFrom, to: s.to };
    if (keep.length && passesNear(coords, cut, keep, keepRadius)) continue;
    out.push(cut);
  }
  out.sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && c.from <= last.to) last.to = Math.max(last.to, c.to);
    else merged.push({ ...c });
  }
  return merged;
}

/**
 * Fioritures d'arrivée d'une boucle : le retour passe déjà tout près du départ (par le trottoir d'en
 * face, par exemple), puis fait un crochet de quelques dizaines de mètres pour rejoindre le point exact
 * (demi-tour au carrefour, retour par l'autre trottoir). On s'arrête au premier passage tout près du
 * départ. Même chose au départ : un crochet avant de vraiment partir. Renvoie la portion à garder (m).
 */
export function closureTrim(coords: LngLat[], near = 20): { from: number; to: number } | null {
  if (coords.length < 4) return null;
  const cum = cumulative(coords);
  const total = cum[cum.length - 1];
  const S = coords[0];
  const E = coords[coords.length - 1];
  if (total < 500 || haversine(S, E) > near) return null;
  // Un crochet s'éloigne d'au moins 30 m puis revient, sans dépasser 120 m.
  const crochet = (a: number, b: number, q: LngLat) => {
    let m = 0;
    for (let j = a; j <= b; j++) m = Math.max(m, haversine(coords[j], q));
    return m > 2 * near && m <= 120;
  };
  // Arrivée : premier point des 300 derniers mètres à moins de `near` du départ, suivi d'un crochet.
  let to = total;
  for (let i = 0; i < coords.length; i++) {
    if (cum[i] < total - 300 || haversine(coords[i], S) > near) continue;
    if (crochet(i, coords.length - 1, S)) to = cum[i];
    break;
  }
  // Départ : dernier point des 300 premiers mètres à moins de `near` de l'arrivée, après un crochet.
  let from = 0;
  for (let i = coords.length - 1; i >= 0; i--) {
    if (cum[i] > Math.min(300, to - 300) || haversine(coords[i], E) > near) continue;
    if (crochet(0, i, E)) from = cum[i];
    break;
  }
  if (to >= total - 1 && from <= 1) return null;
  return { from, to };
}

function passesNear(coords: LngLat[], s: { from: number; to: number }, pts: LngLat[], d: number): boolean {
  const cum = cumulative(coords);
  for (let i = 0; i < coords.length; i++) {
    if (cum[i] < s.from || cum[i] > s.to) continue;
    if (pts.some((q) => haversine(coords[i], q) <= d)) return true;
  }
  return false;
}

/** Sens de départ (cap en degrés) : la rue du départ, sur les premiers mètres du tracé. */
export function departureBearing(coords: LngLat[], within = 10): number | null {
  if (coords.length < 2) return null;
  const a = coords[0];
  let b = coords[1];
  for (let i = 1; i < coords.length; i++) {
    b = coords[i];
    if (haversine(a, b) >= within) break;
  }
  if (haversine(a, b) < 3) return null;
  const proj = localProjector(a);
  const [x, y] = proj.to(b);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}
