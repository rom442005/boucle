import { describe, expect, it } from 'vitest';
import { cumulative, destination } from '../../src/lib/geo';
import { findSpurs, removeSpurs } from '../../src/lib/spurs';
import type { LngLat } from '../../src/lib/types';

const A: LngLat = [-1.5536, 47.2184];

function line(from: LngLat, brg: number, dist: number, step = 20): LngLat[] {
  const out: LngLat[] = [];
  for (let d = step; d <= dist + 0.01; d += step) out.push(destination(from, brg, d));
  return out;
}

describe('allers-retours parasites', () => {
  it('retire un aller-retour de 100 m au milieu du tracé', () => {
    const mid = destination(A, 90, 500);
    const spurOut = line(mid, 0, 100);
    const spur = [...spurOut, ...spurOut.slice(0, -1).reverse(), mid];
    const coords: LngLat[] = [A, ...line(A, 90, 500), ...spur, ...line(mid, 90, 500)];
    const before = cumulative(coords).at(-1)!;
    const prof = { step: 30, ele: Array.from({ length: Math.floor(before / 30) + 2 }, (_, i) => 10 + (i % 7)) };
    const cuts = findSpurs(coords);
    expect(cuts.length).toBe(1);
    expect(cuts[0].to - cuts[0].from).toBeGreaterThan(180);
    const res = removeSpurs(coords, prof);
    const after = cumulative(res.coords).at(-1)!;
    expect(before - after).toBeGreaterThan(180);
    expect(after).toBeGreaterThan(990);
    expect(after).toBeLessThan(1010);
    // Le profil suit la nouvelle longueur.
    expect(res.profile.ele.length).toBe(Math.ceil(after / 30) + 1);
  });

  it('ne touche ni aux virages serrés ni aux longs allers-retours voulus', () => {
    // Épingle : deux branches parallèles à 25 m l'une de l'autre.
    const b = destination(A, 0, 400);
    const c = destination(b, 90, 25);
    const hairpin: LngLat[] = [A, ...line(A, 0, 400), c, ...line(c, 180, 400)];
    expect(findSpurs(hairpin)).toEqual([]);
    // Aller-retour de 2 km (forme demandée) : au-delà de la limite.
    const out = [A, ...line(A, 45, 2000)];
    const longOutBack = [...out, ...out.slice(0, -1).reverse()];
    expect(findSpurs(longOutBack)).toEqual([]);
  });
});
