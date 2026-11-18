/* Test réel contre les services publics (réseau requis) : LIVE=1 npx vitest run tests/unit/live.test.ts */
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/lib/generator';
import { defaultParams, DEFAULT_SETTINGS } from '../../src/lib/sports';
import type { Params, Place } from '../../src/lib/types';

declare const process: { env: Record<string, string | undefined> };
const live = process.env.LIVE === '1';
const start: Place = { name: 'Nantes', coord: [-1.5536, 47.2184], kind: 'map' };

async function run(p: Partial<Params>, destination?: Place) {
  const params = { ...defaultParams(p.sport ?? 'run'), ...p };
  const t = Date.now();
  const res = await generate({ start, destination, params, settings: DEFAULT_SETTINGS, seed: 42 });
  const ms = Date.now() - t;
  console.log(
    `${params.sport}/${params.shape} ${params.distanceKm} km D+${params.elevation ?? '-'} → ${res.routes
      .map((r) => `${(r.lengthM / 1000).toFixed(2)} km +${r.ascent} m ov ${(r.overlap * 100).toFixed(0)}% surf ${r.surface ? Math.round(r.surface.paved * 100) + '% bitume' : '?'} « ${r.name} » [${r.tags?.join(', ')}]`)
      .join(' | ')} (${ms} ms)${res.note ? ' — ' + res.note : ''}`,
  );
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

  it('gravel 40 km chemins', async () => {
    const res = await run({ sport: 'gravel', distanceKm: 40, surface: 'b' });
    expect(res.routes.length).toBeGreaterThanOrEqual(1);
  }, 90000);
});
