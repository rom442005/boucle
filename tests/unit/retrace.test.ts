import { describe, expect, it } from 'vitest';
import { destination } from '../../src/lib/geo';
import { avoidPoints, deadEnds, departureBearing, findRetraces } from '../../src/lib/retrace';
import { chainJobs } from '../../src/lib/valhalla';
import type { LngLat } from '../../src/lib/types';

const A: LngLat = [-1.5536, 47.2184];

/** Points tous les `step` m dans une direction, sans le point de départ. */
function line(from: LngLat, brg: number, dist: number, step = 20): LngLat[] {
  const out: LngLat[] = [];
  for (let d = step; d <= dist + 0.01; d += step) out.push(destination(from, brg, d));
  return out;
}

/** Boucle carrée de `side` m de côté, dans le sens des aiguilles d'une montre. */
function square(from: LngLat, side: number): LngLat[] {
  const out: LngLat[] = [from];
  let p = from;
  for (const brg of [0, 90, 180, 270]) {
    const seg = line(p, brg, side);
    out.push(...seg);
    p = seg[seg.length - 1];
  }
  return out;
}

describe('repasser sur ses pas', () => {
  it('une boucle simple ne repasse pas', () => {
    const rt = findRetraces(square(A, 800));
    expect(rt.length).toBe(0);
    expect(rt.stem).toBe(0);
  });

  it('croiser son tracé à un carrefour ne compte pas', () => {
    // Un huit : la boucle croise son propre tracé à angle droit.
    const c = destination(A, 90, 400);
    const eight: LngLat[] = [A, ...line(A, 90, 800), ...line(destination(A, 90, 800), 0, 400), ...line(destination(destination(A, 90, 800), 0, 400), 270, 400)];
    const top = eight[eight.length - 1];
    eight.push(...line(top, 180, 800));
    const bottom = eight[eight.length - 1];
    eight.push(...line(bottom, 270, 400), ...line(destination(bottom, 270, 400), 0, 400));
    expect(c).toBeTruthy();
    expect(findRetraces(eight).length).toBe(0);
  });

  it('repère un aller-retour vers un cul-de-sac, et le retire', () => {
    const mid = destination(A, 90, 400);
    const spurOut = line(mid, 0, 200);
    const tip = spurOut[spurOut.length - 1];
    // Petit rond au bout (comme un rond de cul-de-sac), puis retour par le même chemin.
    const ring = [destination(tip, 90, 15), destination(destination(tip, 90, 15), 0, 15), destination(tip, 0, 15), tip];
    const back = spurOut.slice(0, -1).reverse();
    const coords: LngLat[] = [A, ...line(A, 90, 400), ...spurOut, ...ring, ...back, mid, ...line(mid, 90, 400)];
    const rt = findRetraces(coords);
    expect(rt.length).toBeGreaterThan(140);
    expect(rt.stretches.some((s) => s.exact && s.reverse)).toBe(true);
    const cuts = deadEnds(coords, rt);
    expect(cuts.length).toBe(1);
    expect(cuts[0].to - cuts[0].from).toBeGreaterThan(380);
  });

  it('garde l’aller-retour qui mène au point de passage imposé', () => {
    const mid = destination(A, 90, 400);
    const spurOut = line(mid, 0, 200);
    const coords: LngLat[] = [A, ...line(A, 90, 400), ...spurOut, ...spurOut.slice(0, -1).reverse(), mid, ...line(mid, 90, 400)];
    const rt = findRetraces(coords);
    expect(deadEnds(coords, rt, [spurOut[spurOut.length - 1]])).toEqual([]);
  });

  it('départ et retour par la même rue : bout commun mesuré', () => {
    // Sucette : 300 m de rue, une boucle au bout, retour par la même rue.
    const stem = line(A, 0, 300);
    const J = stem[stem.length - 1];
    const loop = square(J, 600).slice(1);
    const coords: LngLat[] = [A, ...stem, ...loop, ...stem.slice(0, -1).reverse(), A];
    const rt = findRetraces(coords);
    expect(rt.stem).toBeGreaterThan(250);
    expect(rt.stem).toBeLessThan(320);
    // Le cul-de-sac ne coupe pas le départ lui-même.
    expect(deadEnds(coords, rt)).toEqual([]);
  });

  it('l’autre trottoir de la même rue compte, mais pas une rue parallèle plus loin', () => {
    // Aller vers le nord, puis retour vers le sud à 10 m (l'autre trottoir), loin dans le tracé.
    const north = line(A, 0, 900);
    const top = north[north.length - 1];
    const east = line(top, 90, 10);
    const sideB = destination(top, 90, 10);
    const south = line(sideB, 180, 900);
    const near = findRetraces([A, ...north, ...east, ...south]);
    expect(near.stretches.some((s) => !s.exact)).toBe(true);
    expect(near.length).toBeGreaterThan(400);
    // Même figure avec 60 m d'écart : deux rues différentes.
    const far = destination(top, 90, 60);
    const south2 = line(far, 180, 900);
    expect(findRetraces([A, ...north, ...line(top, 90, 60), ...south2]).length).toBe(0);
  });

  it('points à éviter : loin du départ et des points de passage', () => {
    const stem = line(A, 0, 600);
    const J = stem[stem.length - 1];
    const coords: LngLat[] = [A, ...stem, ...square(J, 500).slice(1), ...stem.slice(0, -1).reverse(), A];
    const rt = findRetraces(coords);
    const s = rt.stretches.find((x) => x.to >= rt.stretches[rt.stretches.length - 1].to - 1)!;
    const pts = avoidPoints(coords, s, [A]);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.length).toBeLessThanOrEqual(6);
    for (const q of pts) expect(Math.hypot(q[0] - A[0], q[1] - A[1])).toBeGreaterThan(0.0012);
  });

  it('sens de départ : la rue du départ', () => {
    expect(departureBearing([A, ...line(A, 45, 100)])).toBeCloseTo(45, 0);
  });
});

describe('plusieurs itinéraires en une requête', () => {
  const S = { coord: A };
  const w = (b: number) => ({ coord: destination(A, b, 800), through: true });
  it('deux boucles partagent le départ : 9 points', () => {
    const r = chainJobs([{ points: [S, w(10), w(50), w(90), S] }, { points: [S, w(190), w(230), w(270), S] }]);
    expect(r.points.length).toBe(9);
    expect(r.legOf).toEqual([0, 1]);
    expect([...r.breaks].sort((a, b) => a - b)).toEqual([0, 4, 8]);
  });
  it('des allers vers des points différents : un trajet de liaison ignoré entre eux', () => {
    const t = (b: number) => ({ coord: destination(A, b, 3000) });
    const r = chainJobs([{ points: [S, t(0)] }, { points: [S, t(90)] }, { points: [S, t(180)] }]);
    expect(r.points.length).toBe(6);
    expect(r.legOf).toEqual([0, -1, 1, -1, 2]);
  });
  it('un sens de départ différent sépare les boucles', () => {
    const r = chainJobs([
      { points: [{ coord: A, heading: 40 }, w(10), w(50), w(90), { coord: A, heading: 40 }] },
      { points: [S, w(190), w(230), w(270), S] },
    ]);
    expect(r.points.length).toBe(10);
    expect(r.legOf).toEqual([0, -1, 1]);
  });
});
