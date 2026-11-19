import { describe, expect, it } from 'vitest';
import { climbs, slopeClass, slopeColor, RAMP, RAMP_DOWN } from '../../src/lib/elevation';
import type { Profile } from '../../src/lib/types';

/** Profil échantillonné tous les 30 m à partir d'une fonction altitude(distance). */
function profile(len: number, f: (s: number) => number): Profile {
  const ele: number[] = [];
  for (let s = 0; s <= len; s += 30) ele.push(f(s));
  return { step: 30, ele };
}

describe('pentes signées', () => {
  it('distingue montées et descentes', () => {
    expect(slopeClass(1)).toBe(0);
    expect(slopeClass(6)).toBe(2);
    expect(slopeClass(-6)).toBe(-2);
    expect(slopeClass(-15)).toBe(-4);
    expect(slopeColor(2)).toBe(RAMP[2]);
    expect(slopeColor(-1)).toBe(RAMP_DOWN[0]);
    expect(slopeColor(-4)).toBe(RAMP_DOWN[3]);
  });
});

describe('côtes et descentes', () => {
  it('aucune sur le plat, même avec le bruit du terrain', () => {
    const p = profile(5000, (s) => 20 + Math.sin(s / 40) * 1.5);
    expect(climbs(p, 5000)).toEqual([]);
  });

  it('repère une côte puis une descente, bords plats rognés', () => {
    // 1 km de plat à 10 m, 500 m de montée à 6 % (jusqu'à 40 m), 500 m de plat, 300 m de descente à 8,3 %, plat.
    const f = (s: number) => {
      if (s < 1000) return 10;
      if (s < 1500) return 10 + (s - 1000) * 0.06;
      if (s < 2000) return 40;
      if (s < 2300) return 40 - (s - 2000) * 0.0833;
      return 15;
    };
    const c = climbs(profile(3500, f), 3500);
    expect(c).toHaveLength(2);
    const [up, down] = c;
    expect(up.up).toBe(true);
    expect(up.from).toBeGreaterThanOrEqual(900);
    expect(up.from).toBeLessThanOrEqual(1100);
    expect(up.to).toBeGreaterThanOrEqual(1400);
    expect(up.to).toBeLessThanOrEqual(1600);
    expect(up.gain).toBeGreaterThanOrEqual(26);
    expect(up.avg).toBeGreaterThan(4.5);
    expect(up.cls).toBeGreaterThan(0);
    expect(down.up).toBe(false);
    expect(down.gain).toBeGreaterThanOrEqual(20);
    expect(down.cls).toBeLessThan(0);
  });

  it('ignore une bosse trop petite', () => {
    const f = (s: number) => (s > 1000 && s < 1200 ? 20 + (s - 1000) * 0.04 : s >= 1200 && s < 1400 ? 28 - (s - 1200) * 0.04 : 20);
    expect(climbs(profile(3000, f), 3000)).toEqual([]);
  });
});
