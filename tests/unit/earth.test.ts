import { describe, expect, it } from 'vitest';
import { EARTH_PALETTES, globeLabels, gradePixels, graticule, smoothPoles } from '../../src/lib/earth';

/** Recolore un seul pixel (r, g, b) et rend le résultat. */
function grade(rgb: [number, number, number], theme: 'light' | 'dark'): number[] {
  const d = new Uint8ClampedArray([...rgb, 255]);
  gradePixels(d, theme);
  return [d[0], d[1], d[2]];
}
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const near = (a: number[], b: number[], tol = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// Couleurs relevées sur l'image NASA Blue Marble (relief et fonds marins).
const DEEP_ATLANTIC: [number, number, number] = [14, 26, 74];
const SHELF: [number, number, number] = [29, 69, 128];
const AMAZON: [number, number, number] = [20, 33, 6];
const SAHARA: [number, number, number] = [202, 169, 118];
const GREENLAND: [number, number, number] = [254, 255, 255];
const LAKE: [number, number, number] = [0, 3, 8];

describe('Terre dessinée comme dans Plans', () => {
  it('en sombre : océan bleu nuit, forêt vert d’eau, désert olive, glace gris bleuté', () => {
    const ocean = grade(DEEP_ATLANTIC, 'dark');
    expect(ocean[2]).toBeGreaterThan(ocean[0] + 25);
    expect(ocean[0] + ocean[1] + ocean[2]).toBeLessThan(90);
    const forest = grade(AMAZON, 'dark');
    expect(forest[1]).toBeGreaterThan(forest[0] + 60);
    expect(Math.abs(forest[1] - forest[2])).toBeLessThan(20);
    const desert = grade(SAHARA, 'dark');
    expect(Math.abs(desert[0] - desert[1])).toBeLessThan(15);
    expect(near(grade(GREENLAND, 'dark'), hex(EARTH_PALETTES.dark.ice))).toBe(true);
  });

  it('les plateaux continentaux sont plus clairs que les abysses, les lacs restent de l’eau', () => {
    const deep = grade(DEEP_ATLANTIC, 'dark');
    const shelf = grade(SHELF, 'dark');
    expect(shelf[2]).toBeGreaterThan(deep[2]);
    const lake = grade(LAKE, 'light');
    expect(lake[2]).toBeGreaterThan(lake[0] + 50);
  });

  it('en clair : la même Terre, plus lumineuse', () => {
    const ocean = grade(DEEP_ATLANTIC, 'light');
    expect(ocean[2]).toBeGreaterThan(180);
    const forest = grade(AMAZON, 'light');
    expect(forest[1]).toBeGreaterThan(forest[0]);
    expect(near(grade(GREENLAND, 'light'), hex(EARTH_PALETTES.light.ice))).toBe(true);
  });

  it('les calottes polaires deviennent unies (pas d’éventail au pôle)', () => {
    const w = 4;
    const h = 200;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < d.length; i += 4) d.set([Math.random() * 255, Math.random() * 255, Math.random() * 255, 255], i);
    smoothPoles(d, w, h, 'north', [10, 20, 30]);
    for (let x = 0; x < w; x++) expect(Array.from(d.slice(x * 4, x * 4 + 3))).toEqual([10, 20, 30]);
  });

  it('repères : équateur, tropiques, cercles polaires ; continents, océans et grandes villes', () => {
    const lines = graticule().features;
    expect(lines.map((f) => f.properties?.name)).toContain('Équateur');
    expect(lines).toHaveLength(5);
    const labels = globeLabels().features;
    const kinds = new Set(labels.map((f) => f.properties?.kind));
    expect([...kinds].sort()).toEqual(['city', 'continent', 'ocean']);
    expect(new Set(labels.map((f) => f.id)).size).toBe(labels.length);
    expect(labels.some((f) => f.properties?.name === 'Paris')).toBe(true);
  });
});
