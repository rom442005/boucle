import { describe, expect, it } from 'vitest';
import { lanesOf, lapLength, trackFacts, trackFeatures, tracksIn, type TrackRec } from '../../src/lib/tracks';
import { shapeOf } from '../../src/lib/zones';
import { saved } from '../../src/lib/saved.svelte';

const track = (o: Partial<TrackRec> = {}): TrackRec => ({ id: 1, c: [-1.55, 47.22], L: 177, W: 92, a: 30, lanes: 0, name: null, surf: 't', ...o });

describe('pistes redessinées', () => {
  it('une grande piste : anneau, couloirs, ligne d’arrivée et terrain au centre', () => {
    const parts = trackFeatures(track()).map((f) => f.properties!.part);
    expect(parts).toEqual(['hit', 'infield', 'ring', 'edge', 'lane', 'finish', 'pitch']);
    expect(lanesOf(track())).toBe(8);
    expect(lapLength(track())).toBe(400);
    expect(trackFacts(track())).toBe('400 m · 8 couloirs · synthétique');
  });
  it('une petite piste : moins de couloirs, pas de terrain', () => {
    const t = track({ L: 110, W: 55, surf: '' });
    const parts = trackFeatures(t).map((f) => f.properties!.part);
    expect(parts).not.toContain('pitch');
    expect(lanesOf(t)).toBe(4);
    expect(lapLength(t)).toBe(250);
  });
  it('la piste suit son orientation et reste à sa place', () => {
    const f = trackFeatures(track({ a: 90 }))[0].geometry as GeoJSON.Polygon;
    const xs = f.coordinates[0].map((p) => p[0]);
    const ys = f.coordinates[0].map((p) => p[1]);
    // Grand axe nord-sud : plus haute que large (en mètres).
    const h = (Math.max(...ys) - Math.min(...ys)) * 110540;
    const w = (Math.max(...xs) - Math.min(...xs)) * 111320 * Math.cos((47.22 * Math.PI) / 180);
    expect(h).toBeGreaterThan(170);
    expect(w).toBeLessThan(95);
    expect(tracksIn([-1.6, 47.2, -1.5, 47.3], [track()])).toHaveLength(1);
    expect(tracksIn([-1.5, 47.2, -1.4, 47.3], [track()])).toHaveLength(0);
  });
  it('mesure l’orientation et le centre d’un contour tourné', () => {
    const c: [number, number] = [-1.55, 47.22];
    const kx = 111320 * Math.cos((c[1] * Math.PI) / 180);
    const a = (30 * Math.PI) / 180;
    const ring = [
      [-80, -40],
      [80, -40],
      [80, 40],
      [-80, 40],
      [-80, -40],
    ].map(([x, y]) => [c[0] + (x * Math.cos(a) - y * Math.sin(a)) / kx, c[1] + (x * Math.sin(a) + y * Math.cos(a)) / 110540] as [number, number]);
    const s = shapeOf(ring);
    expect(Math.round(s.L)).toBe(160);
    expect(Math.round(s.W)).toBe(80);
    expect(Math.abs(s.angle - 30)).toBeLessThanOrEqual(3);
    expect(Math.abs(s.center[0] - c[0]) * kx).toBeLessThan(2);
    expect(Math.abs(s.center[1] - c[1]) * 110540).toBeLessThan(2);
  });
});

describe('mes lieux', () => {
  it('enregistre, retrouve, modifie et retire un lieu', () => {
    expect(saved.lists.map((l) => l.id)).toEqual(['adresses', 'favoris', 'essayer']);
    saved.edit({ name: 'Domicile', coord: [-1.5536, 47.2184], emoji: '🏠', list: 'adresses' });
    const p = saved.commit(saved.draft!);
    expect(saved.draft).toBeNull();
    expect(saved.placesIn('adresses')).toHaveLength(1);
    // À 10 m près, c'est le même lieu.
    expect(saved.near([-1.55355, 47.21845])?.id).toBe(p.id);
    expect(saved.near([-1.56, 47.22])).toBeNull();
    saved.edit({ id: p.id, name: p.name, coord: p.coord });
    expect(saved.draft).toMatchObject({ emoji: '🏠', list: 'adresses' });
    saved.commit({ ...saved.draft!, name: 'Maison', list: 'favoris' });
    expect(saved.places[0]).toMatchObject({ id: p.id, name: 'Maison', list: 'favoris' });
    saved.remove(p.id);
    expect(saved.places).toHaveLength(0);
  });
  it('crée une liste, et la supprimer retire ses lieux', () => {
    const l = saved.addList('Proches', '👪');
    saved.commit({ name: 'Chez un ami', coord: [-1.5, 47.2], emoji: '❤️', list: l.id });
    expect(saved.placesIn(l.id)).toHaveLength(1);
    saved.removeList(l.id);
    expect(saved.lists.some((x) => x.id === l.id)).toBe(false);
    expect(saved.places).toHaveLength(0);
  });
});
