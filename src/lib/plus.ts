/*
 * Boucle+ en simulation : un abonnement qui coûte de moins en moins cher chaque mois d'affilée, et revient au
 * prix de départ après un mois sans abonnement. Rien n'est payé : tout reste sur l'appareil (localStorage).
 *
 * Prix : 4,99 € le premier mois, 0,25 € de moins chaque mois d'affilée, jamais moins de 1,99 € (atteint au
 * 13e mois). Un mois sauté (ou un arrêt d'un mois) : la série repart de zéro.
 */

export const PLUS_START = 4.99;
export const PLUS_STEP = 0.25;
export const PLUS_FLOOR = 1.99;

/** Prix du n-ième mois d'affilée (n = 1 pour le premier). */
export function priceOfMonth(n: number): number {
  const p = PLUS_START - PLUS_STEP * (Math.max(1, Math.floor(n)) - 1);
  return Math.round(Math.max(PLUS_FLOOR, p) * 100) / 100;
}

/** Mois où le plancher est atteint. */
export const PLUS_FLOOR_MONTH = Math.ceil((PLUS_START - PLUS_FLOOR) / PLUS_STEP) + 1;

/** Un mois au format « 2026-11 ». */
export type Month = string;

export function monthOf(d: Date): Month {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function nextMonth(m: Month): Month {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

export interface PlusSim {
  /** abonné ce mois-ci */
  active: boolean;
  /** mois payés, dans l'ordre */
  paid: Month[];
  /** mois « courant » de la simulation (on peut avancer dans le temps) */
  now: Month;
}

/** Nombre de mois payés d'affilée qui finissent au mois `m` (0 si `m` n'est pas payé). */
export function streakAt(paid: Month[], m: Month): number {
  const set = new Set(paid);
  let n = 0;
  let cur = m;
  while (set.has(cur)) {
    n++;
    cur = prevMonth(cur);
  }
  return n;
}
function prevMonth(m: Month): Month {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}

/** Ce que coûterait le mois `m` si on le payait. */
export function priceFor(sim: PlusSim, m: Month = sim.now): number {
  return priceOfMonth(streakAt(sim.paid, prevMonth(m)) + 1);
}

/** S'abonner (ou se réabonner) : le mois courant est payé à son prix. */
export function subscribe(sim: PlusSim): PlusSim {
  if (sim.paid.includes(sim.now)) return { ...sim, active: true };
  return { ...sim, active: true, paid: [...sim.paid, sim.now] };
}
/** Arrêter : plus rien n'est payé à partir du mois suivant. */
export function cancel(sim: PlusSim): PlusSim {
  return { ...sim, active: false };
}
/** Passer au mois suivant : payé si l'abonnement est actif, sauté sinon (la série repart alors de zéro). */
export function advance(sim: PlusSim): PlusSim {
  const now = nextMonth(sim.now);
  return { ...sim, now, paid: sim.active ? [...sim.paid, now] : sim.paid };
}
/** Économie de la série en cours par rapport au prix de départ, sur 12 mois. */
export function yearCost(fromStreak: number): number {
  let t = 0;
  for (let i = 1; i <= 12; i++) t += priceOfMonth(fromStreak + i);
  return Math.round(t * 100) / 100;
}

const KEY = 'boucle.plus.sim';

export function loadPlus(now = new Date()): PlusSim {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (x && typeof x.now === 'string' && Array.isArray(x.paid)) return { active: !!x.active, paid: x.paid.filter((m: unknown) => typeof m === 'string'), now: x.now };
  } catch {
    /* rien de gardé */
  }
  return { active: false, paid: [], now: monthOf(now) };
}
export function savePlus(sim: PlusSim) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sim));
  } catch {
    /* stockage plein ou bloqué */
  }
}
