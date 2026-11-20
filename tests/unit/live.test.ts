/* Test réel contre les services publics (réseau requis) : LIVE=1 npx vitest run tests/unit/live.test.ts */
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/lib/generator';
import { defaultParams, DEFAULT_SETTINGS } from '../../src/lib/sports';
import type { Params, Place, Route } from '../../src/lib/types';
import { cumulative, nearestOnRoute } from '../../src/lib/geo';
import { climbsOf } from '../../src/lib/elevation';
import { findRetraces } from '../../src/lib/retrace';

declare const process: { env: Record<string, string | undefined> };
const live = process.env.LIVE === '1';
const start: Place = { name: 'Nantes', coord: [-1.5536, 47.2184], kind: 'map' };

async function run(p: Partial<Params>, destination?: Place, via?: Place) {
  const params = { ...defaultParams(p.sport ?? 'run'), ...p };
  const t = Date.now();
  let first = 0;
  const res = await generate({ start, destination, via, params, settings: DEFAULT_SETTINGS, seed: 42, onPartial: () => (first = Date.now() - t) });
  const ms = Date.now() - t;
  console.log(
    `${params.sport}/${params.shape} ${params.distanceKm} km D+${params.elevation ?? '-'} → ${res.routes
      .map((r) => `${(r.lengthM / 1000).toFixed(2)} km +${r.ascent} m repasse ${Math.round(findRetraces(r.coords).length)} m surf ${r.surface ? Math.round(r.surface.paved * 100) + '% bitume' : '?'} « ${r.name} » [${r.tags?.join(', ')}]`)
      .join(' | ')} (1re ${first} ms, toutes ${ms} ms)${res.note ? ' — ' + res.note : ''}`,
  );
  // Une boucle ne repasse jamais au même endroit (au plus un bout de carrefour).
  if (params.shape === 'loop' && !via) for (const r of res.routes) expect(findRetraces(r.coords).length).toBeLessThanOrEqual(Math.max(30, 0.0015 * r.lengthM));
  for (const r of res.routes.slice(0, 1)) {
    const cs = climbsOf(r);
    console.log(`   côtes (${cs.length}) : ` + cs.map((c) => `${c.up ? '↗' : '↘'} km ${(c.from / 1000).toFixed(1)} ${Math.round(c.to - c.from)} m ${c.gain} m ${c.avg} % (max ${c.max})`).join(' · '));
  }
  return res;
}

describe.skipIf(!live)('génération réelle', () => {
  it('boucle de course de 10 km', async () => {
    const res = await run({ sport: 'run', distanceKm: 10 });
    expect(res.routes.length).toBeGreaterThanOrEqual(2);
    for (const r of res.routes) expect(Math.abs(r.lengthM - 10000) / 10000).toBeLessThan(0.12);
    expect(res.routes[0].surface).not.toBeNull();
  }, 60000);

  it('boucle vélo de 50 km avec dénivelé visé', async () => {
    const res = await run({ sport: 'road', distanceKm: 50, elevation: 400 });
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(res.routes[0].lengthM - 50000) / 50000).toBeLessThan(0.12);
  }, 90000);

  it('aller-retour trail de 12 km', async () => {
    const res = await run({ sport: 'trail', distanceKm: 12, shape: 'outback' });
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(res.routes[0].lengthM - 12000) / 12000).toBeLessThan(0.12);
  }, 60000);

  it('itinéraire vers un lieu, allongé', async () => {
    const dest: Place = { name: 'Parc de Procé', coord: [-1.5826, 47.2243], kind: 'search' };
    const res = await run({ sport: 'run', distanceKm: 8, shape: 'oneway' }, dest);
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    expect(res.routes[0].name).toContain('Parc de Procé');
  }, 60000);

  // Point de passage imposé : le tracé doit y passer (à moins de 120 m) et tenir la distance.
  const passes = (r: Route, v: Place) => nearestOnRoute(r.coords, cumulative(r.coords), v.coord).dist;
  const jardin: Place = { name: 'Jardin des Plantes', coord: [-1.5424, 47.2195], kind: 'search' };
  const proce: Place = { name: 'Parc de Procé', coord: [-1.5826, 47.2243], kind: 'search' };

  it('boucle de 10 km par un point de passage proche', async () => {
    const res = await run({ sport: 'run', distanceKm: 10 }, undefined, jardin);
    expect(res.routes.length).toBeGreaterThanOrEqual(2);
    for (const r of res.routes) {
      expect(passes(r, jardin)).toBeLessThan(120);
      expect(Math.abs(r.lengthM - 10000) / 10000).toBeLessThan(0.15);
    }
  }, 90000);

  it('boucle de 12 km par un point de passage à 2,2 km', async () => {
    const res = await run({ sport: 'run', distanceKm: 12 }, undefined, proce);
    expect(res.routes.length).toBeGreaterThanOrEqual(2);
    for (const r of res.routes) {
      expect(passes(r, proce)).toBeLessThan(120);
      expect(Math.abs(r.lengthM - 12000) / 12000).toBeLessThan(0.15);
    }
  }, 90000);

  it('boucle trop courte pour le point de passage : proposée quand même, avec une remarque', async () => {
    const res = await run({ sport: 'run', distanceKm: 3 }, undefined, proce);
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    expect(passes(res.routes[0], proce)).toBeLessThan(120);
    expect(res.note).toContain('Pour passer par Parc de Procé');
  }, 90000);

  it('aller-retour de 10 km par un point de passage', async () => {
    const res = await run({ sport: 'run', distanceKm: 10, shape: 'outback' }, undefined, jardin);
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    for (const r of res.routes) expect(passes(r, jardin)).toBeLessThan(120);
  }, 90000);

  it('vers un lieu par un point de passage', async () => {
    const res = await run({ sport: 'run', distanceKm: 6, shape: 'oneway' }, proce, jardin);
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
    for (const r of res.routes) expect(passes(r, jardin)).toBeLessThan(120);
  }, 90000);

  it('gravel 40 km chemins', async () => {
    const res = await run({ sport: 'gravel', distanceKm: 40, surface: 'b' });
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
  }, 90000);
});
