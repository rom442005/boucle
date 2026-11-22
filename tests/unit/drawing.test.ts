import { describe, expect, it } from 'vitest';
import { cumulativePts, cycleOf, hasDrawing, lengthOf, presetDrawing, rotateCycle, tipsOf, type Pt } from '../../src/lib/drawing';
import { bestPoses, distanceTransform, joinResults, placeCycle, resemblance, type RoadField } from '../../src/lib/art';
import type { RouteResult } from '../../src/lib/valhalla';

describe('dessin : géométrie', () => {
  it('le tour est fermé et relie les traits dans l’ordre', () => {
    const d = { strokes: [[[0.1, 0.1], [0.5, 0.1]], [[0.5, 0.5], [0.1, 0.5]]] as Pt[][] };
    const c = cycleOf(d);
    expect(c[0]).toEqual(c[c.length - 1]);
    // 0,1 → 0,5 (trait) → 0,5 0,5 (liaison) → 0,1 0,5 (trait) → retour au départ
    expect(lengthOf(c)).toBeCloseTo(0.4 + 0.4 + 0.4 + 0.4, 5);
  });

  it('un simple toucher n’est pas un dessin', () => {
    expect(hasDrawing({ strokes: [[[0.5, 0.5], [0.501, 0.5]]] })).toBe(false);
    expect(hasDrawing(presetDrawing('heart'))).toBe(true);
  });

  it('changer le point de départ garde la même figure', () => {
    const c = cycleOf(presetDrawing('star'));
    const r = rotateCycle(c, cumulativePts(c), 0.37);
    expect(lengthOf(r)).toBeCloseTo(lengthOf(c), 6);
    expect(r[0]).toEqual(r[r.length - 1]);
  });

  it('les cinq pointes de l’étoile sont repérées (pas les creux)', () => {
    expect(tipsOf(cycleOf(presetDrawing('star')))).toHaveLength(5);
  });
});

describe('dessin : carte des distances et placement', () => {
  it('distance exacte au pixel allumé le plus proche', () => {
    const n = 21;
    const g = new Uint8Array(n * n);
    g[10 * n + 10] = 1;
    const d = distanceTransform(g, n);
    expect(d[10 * n + 10]).toBe(0);
    expect(d[10 * n + 13]).toBeCloseTo(3, 5);
    expect(d[14 * n + 13]).toBeCloseTo(5, 5);
  });

  /** Quadrillage de rues tous les `gap` mètres, axes nord-sud et est-ouest. */
  function gridField(gap: number, half = 3000, mpp = 10): RoadField {
    const size = (2 * half) / mpp;
    const g = new Uint8Array(size * size);
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const x = -half + (i + 0.5) * mpp;
        const y = half - (j + 0.5) * mpp;
        if (Math.abs(((x % gap) + gap) % gap) < mpp || Math.abs(((y % gap) + gap) % gap) < mpp) g[j * size + i] = 1;
      }
    const px = distanceTransform(g, size);
    const dist = new Float32Array(px.length).map((_, i) => px[i] * mpp);
    return {
      size,
      mpp,
      half,
      dist,
      at: (x, y) => {
        const i = Math.floor((x + half) / mpp);
        const j = Math.floor((half - y) / mpp);
        return i < 0 || j < 0 || i >= size || j >= size ? 400 : dist[j * size + i];
      },
    };
  }

  it('un carré se pose droit sur un quadrillage de rues', () => {
    const c = cycleOf(presetDrawing('square'));
    // Côté du carré ≈ 0,68 unité du carnet : à 1 176 m par unité, 800 m de côté, soit 4 rues.
    const best = bestPoses(c, gridField(200), 1176, 3);
    expect(best[0].rot).toBe(0);
    const tilted = { ...best[0], rot: 15, scale: 1 };
    const tiltedCost = (() => {
      const g = gridField(200);
      const pts = placeCycle(c, tilted, 1176);
      return Math.sqrt(pts.reduce((s, [x, y]) => s + Math.min(160, g.at(x, y)) ** 2, 0) / pts.length);
    })();
    expect(best[0].cost).toBeLessThan(tiltedCost);
  });

  it('ressemblance : parfaite sur le dessin, faible quand un morceau manque', () => {
    const ghost: Pt[] = [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 1000],
      [0, 0],
    ];
    expect(resemblance(ghost, ghost).fit).toBeCloseTo(1, 5);
    // Raccourci en diagonale : la moitié du carré n'est pas courue.
    const cut: Pt[] = [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 0],
    ];
    expect(resemblance(cut, ghost).fit).toBeLessThan(0.75);
  });

  it('les morceaux recollés gardent un profil continu', () => {
    const part = (a: [number, number], b: [number, number], e0: number, e1: number): RouteResult => ({
      coords: [a, b],
      profile: { step: 30, ele: [e0, e1] },
      lengthM: 30,
      maneuvers: [],
    });
    const j = joinResults([part([0, 0], [0.0003, 0], 10, 20), part([0.0003, 0], [0.0006, 0], 20, 30)]);
    expect(j.coords).toHaveLength(3);
    expect(j.profile.ele[0]).toBeCloseTo(10, 0);
    expect(j.profile.ele[j.profile.ele.length - 1]).toBeCloseTo(30, 0);
  });
});
