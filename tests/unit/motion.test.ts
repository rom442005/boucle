import { describe, expect, it } from 'vitest';
import { traceEase, traceMs, traceTimeAt } from '../../src/lib/motion';

describe('tracé au stylo', () => {
  it('la courbe part de 0, arrive à 1, ne recule jamais et se raccorde sans à-coup', () => {
    expect(traceEase(0)).toBe(0);
    expect(traceEase(1)).toBeCloseTo(1, 9);
    let prev = 0;
    for (let i = 1; i <= 200; i++) {
      const v = traceEase(i / 200);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Même vitesse de part et d'autre du raccord (40 %).
    const h = 1e-5;
    const left = (traceEase(0.4) - traceEase(0.4 - h)) / h;
    const right = (traceEase(0.4 + h) - traceEase(0.4)) / h;
    expect(Math.abs(left - right)).toBeLessThan(0.01);
  });

  it("l'instant où le stylo atteint un point est l'inverse de la courbe", () => {
    for (const f of [0.1, 0.25, 0.5, 0.8, 0.99]) expect(traceEase(traceTimeAt(f))).toBeCloseTo(f, 4);
  });

  it('un long parcours se trace plus lentement, jamais plus de 2 s', () => {
    expect(traceMs(5000)).toBeLessThan(traceMs(30000));
    expect(traceMs(200000)).toBe(2000);
  });
});
