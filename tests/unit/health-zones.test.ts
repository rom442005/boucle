import { describe, expect, it } from 'vitest';
import { centerOf, zoneKey } from '../../src/lib/zones';
import type { HealthDay } from '../../src/lib/community/types';

// health.ts lit la plateforme au chargement (matchMedia, absent hors navigateur).
(globalThis as { matchMedia?: unknown }).matchMedia ??= () => ({ matches: false });
const { summarize } = await import('../../src/lib/health');

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = (n: number) => {
  const t = new Date();
  return key(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n, 12));
};
const day = (n: number, extra: Partial<HealthDay> = {}): HealthDay => ({ day: ago(n), steps: null, restingHr: null, vo2max: null, distance: 0, workouts: [], source: 'ios', ...extra });

describe('santé : ce que le profil affiche', () => {
  it('montre aujourd’hui, la semaine et les moyennes', () => {
    const s = summarize([day(8, { steps: 9000 }), day(2, { steps: 6000, vo2max: 44.5 }), day(1, { steps: 8000, restingHr: 58 }), day(0, { steps: 4000, walkM: 2900, activeKcal: 310, exerciseMin: 21 })])!;
    expect(s.today).toMatchObject({ isToday: true, steps: 4000, walkM: 2900, kcal: 310, exercise: 21 });
    expect(s.week).toHaveLength(7);
    expect(s.week.map((d) => d.steps)).toEqual([0, 0, 0, 0, 6000, 8000, 4000]);
    expect(s.restingHr).toBe(58);
    expect(s.vo2max).toBe(44.5);
    expect(s.walk28).toBe(2900);
  });
  it('sans données du jour, montre le dernier jour reçu', () => {
    const s = summarize([day(3, { steps: 7000 }), day(2, { steps: 7500 })])!;
    expect(s.today.isToday).toBe(false);
    expect(s.today.steps).toBe(7500);
  });
  it('rien reçu : pas de bloc', () => expect(summarize([])).toBeNull());
});

describe('lieux sur la carte', () => {
  it('pose le repère au milieu d’un lieu', () => {
    expect(centerOf({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]]] })).toEqual([1, 2]);
    expect(centerOf({ type: 'Point', coordinates: [-1.55, 47.2] })).toEqual([-1.55, 47.2]);
  });
  it('un lieu coupé entre deux tuiles ne compte qu’une fois', () => {
    expect(zoneKey('track', [-1.55001, 47.20001])).toBe(zoneKey('track', [-1.55002, 47.20002]));
    expect(zoneKey('track', [-1.55, 47.2])).not.toBe(zoneKey('track', [-1.56, 47.2]));
  });
});
