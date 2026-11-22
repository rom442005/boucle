/*
 * Mouvement partagé par la carte, le profil et les chiffres : une même courbe, une même durée,
 * pour que le tracé d'un parcours, son profil et ses compteurs avancent ensemble.
 */

import { tick } from 'svelte';

/** Préférence « réduire les animations » du système (lue en direct). */
export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Courbe du tracé : le stylo part en douceur, file au milieu, se pose en douceur à l'arrivée
 * (cubique, un peu plus vive au départ qu'une courbe symétrique).
 */
export function traceEase(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  // Deux arcs de même puissance qui se raccordent sans à-coup (même vitesse à 40 %).
  return k < 0.4 ? 0.4 * (k / 0.4) ** 2.4 : 0.4 + 0.6 * (1 - (1 - (k - 0.4) / 0.6) ** 2.4);
}

/** Durée du tracé d'un parcours : plus long pour un long parcours, jamais plus de 2 s. */
export function traceMs(lengthM: number): number {
  return Math.round(Math.min(2000, 1100 + lengthM / 45));
}

/** Instant (0 à 1) où le stylo atteint la fraction `f` du parcours : inverse de la courbe, par dichotomie. */
export function traceTimeAt(f: number): number {
  const target = Math.min(1, Math.max(0, f));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (traceEase(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Passage d'un écran à l'autre en fondu (View Transitions, Safari 18 et Chrome) : l'ancien contenu se fond
 * dans le nouveau au lieu de sauter. Sans l'API, ou si l'on réduit les animations, le changement est direct.
 */
export function smoothly(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void> | void) => unknown };
  if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return change();
  // Pendant le fondu, le panneau glisse par la transition elle-même : ses propres transitions se taisent.
  const root = document.documentElement;
  root.classList.add('vt');
  const t = doc.startViewTransition(async () => {
    change();
    await tick();
  }) as { finished?: Promise<void> } | undefined;
  void (t?.finished ?? Promise.resolve()).finally(() => root.classList.remove('vt'));
}
