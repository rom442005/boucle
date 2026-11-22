/* Banc réel du mode Dessin (réseau requis) : LIVE=1 npx vitest run tests/unit/art.live.test.ts */
import { describe, expect, it } from 'vitest';
import { drawingLoops } from '../../src/lib/art';
import { presetDrawing, type Drawing, type DrawPreset, type Pt } from '../../src/lib/drawing';
import { costingFor } from '../../src/lib/valhalla';
import { defaultParams, DEFAULT_SETTINGS } from '../../src/lib/sports';
import type { LngLat, Sport } from '../../src/lib/types';

declare const process: { env: Record<string, string | undefined> };
const live = process.env.LIVE === '1';
const OUT = process.env.ART_OUT;
const NANTES: LngLat = [-1.5536, 47.2184];

/** Un visage à main levée : la tête, deux yeux, un sourire (quatre traits, reliés dans l'ordre). */
function face(): Drawing {
  const ring = (cx: number, cy: number, r: number, n: number, from = 0): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = from + (i / n) * 2 * Math.PI;
      return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as Pt;
    });
  const smile: Pt[] = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI * (0.65 + (i / 12) * 0.7);
    return [0.5 - 0.2 * Math.sin(a), 0.55 - 0.2 * Math.cos(a)] as Pt;
  });
  return { strokes: [ring(0.5, 0.5, 0.4, 48), ring(0.36, 0.38, 0.06, 12), ring(0.64, 0.38, 0.06, 12), smile] };
}

async function run(preset: DrawPreset | 'face', sport: Sport, km: number, reach = 0, approach = false, start = NANTES) {
  const p = { ...defaultParams(sport), distanceKm: km };
  const t = Date.now();
  let first = 0;
  const res = await drawingLoops({
    drawing: preset === 'face' ? face() : presetDrawing(preset),
    origin: start,
    reach: reach * 1000,
    approach,
    D: km * 1000,
    sport,
    costing: costingFor(p, DEFAULT_SETTINGS),
    ratio: sport === 'road' || sport === 'gravel' ? 1.7 : 1.42,
    deadline: Date.now() + 18000,
    report: () => {},
    onGood: () => (first ||= Date.now() - t),
  });
  const ms = Date.now() - t;
  console.log(
    `${preset} ${sport} ${km} km${reach ? ` (jusqu’à ${reach} km${approach ? ', accès compris' : ''})` : ''} → ${res.cands.map((c) => `${(c.L / 1000).toFixed(2)} km ressemblance ${Math.round(c.fit * 100)} % (écart ${Math.round(c.dev)} m${c.approach ? `, accès ${(c.approach / 1000).toFixed(1)} km` : ''})`).join(' | ')} — 1re ${first} ms, fin ${ms} ms, rapport ${res.ratio.toFixed(2)}`,
  );
  // Copie des tracés pour les regarder (ART_OUT=dossier) ; module de Node chargé à la demande.
  if (OUT) {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { writeFileSync: (f: string, d: string) => void };
    fs.writeFileSync(`${OUT}/${preset}-${sport}-${km}${reach ? `-r${reach}` : ''}.json`, JSON.stringify(res.cands.map((c) => ({ route: c.res.coords, ghost: c.ghost, fit: c.fit, L: c.L, origin: start }))));
  }
  return res;
}

describe.skipIf(!live)('mode Dessin, réseau réel', () => {
  for (const preset of ['heart', 'star', 'circle', 'square'] as DrawPreset[]) {
    it(`${preset}, course 10 km`, async () => {
      const res = await run(preset, 'run', 10);
      expect(res.cands.length).toBeGreaterThan(0);
      const best = [...res.cands].sort((a, b) => b.fit - a.fit)[0];
      expect(best.fit).toBeGreaterThan(0.6);
    }, 60000);
  }
  it('visage à main levée (quatre traits), course 14 km', async () => {
    const res = await run('face', 'run', 14);
    expect(res.cands.length).toBeGreaterThan(0);
  }, 60000);
  it('cœur, course 10 km, meilleur endroit à moins de 6 km', async () => {
    const res = await run('heart', 'run', 10, 6);
    expect(res.cands.length).toBeGreaterThan(0);
    expect(Math.max(...res.cands.map((c) => c.fit))).toBeGreaterThan(0.8);
  }, 90000);
  it('étoile, course 12 km, à moins de 8 km avec l’accès', async () => {
    const res = await run('star', 'run', 12, 8, true);
    expect(res.cands.length).toBeGreaterThan(0);
  }, 90000);
  it('cœur à vélo, 100 km, à moins de 25 km', async () => {
    const res = await run('heart', 'road', 100, 25);
    expect(res.cands.length).toBeGreaterThan(0);
    expect(Math.max(...res.cands.map((c) => c.fit))).toBeGreaterThan(0.75);
  }, 120000);
  it('cœur à vélo, 40 km', async () => {
    const res = await run('heart', 'road', 40);
    expect(res.cands.length).toBeGreaterThan(0);
  }, 60000);
});
