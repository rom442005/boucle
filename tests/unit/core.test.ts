import { describe, expect, it } from 'vitest';
import { cumulative, decodePolyline, destination, encodePolyline, haversine, nearestOnRoute, overlapRatio, pointAt, simplify, similarity } from '../../src/lib/geo';
import { elevationStats, gradeClass, grades, reverseProfile } from '../../src/lib/elevation';
import { routeName } from '../../src/lib/naming';
import { slopeRuns, slopeSegments, segmentsToGeoJSON, reverseRoute } from '../../src/lib/routegeo';
import { deserialize, serialize, toGPX } from '../../src/lib/persist';
import { estimateDuration, elevationLevel, DEFAULT_SETTINGS, defaultParams } from '../../src/lib/sports';
import { costingFor, hillPreference } from '../../src/lib/valhalla';
import { duration, km, pace } from '../../src/lib/format';
import type { LngLat, Route } from '../../src/lib/types';

const NANTES: LngLat = [-1.5536, 47.2184];

function squareLoop(sideM: number): LngLat[] {
  const a = NANTES;
  const b = destination(a, 90, sideM);
  const c = destination(b, 0, sideM);
  const d = destination(c, 270, sideM);
  const pts: LngLat[] = [];
  for (const [p, q] of [
    [a, b],
    [b, c],
    [c, d],
    [d, a],
  ] as [LngLat, LngLat][]) {
    for (let i = 0; i < 20; i++) pts.push([p[0] + ((q[0] - p[0]) * i) / 20, p[1] + ((q[1] - p[1]) * i) / 20]);
  }
  pts.push(a);
  return pts;
}

function fakeRoute(coords: LngLat[], ele: number[]): Route {
  const cum = cumulative(coords);
  const lengthM = cum[cum.length - 1];
  const profile = { step: lengthM / (ele.length - 1), ele };
  const st = elevationStats(profile);
  return {
    id: 'x',
    name: 'Test',
    sport: 'run',
    shape: 'loop',
    coords,
    profile,
    lengthM,
    ...st,
    env: { forest: 0.5, other: 0.5 },
    surface: { paved: 0.7, compacted: 0.2, dirt: 0.1 },
    busy: 0.05,
    overlap: 0,
    waterPoints: [],
    durationS: 3000,
    createdAt: 1,
  };
}

describe('géométrie', () => {
  it('mesure et projette correctement', () => {
    const p = destination(NANTES, 45, 1000);
    expect(haversine(NANTES, p)).toBeCloseTo(1000, 0);
    const loop = squareLoop(1000);
    const cum = cumulative(loop);
    expect(cum[cum.length - 1]).toBeGreaterThan(3990);
    expect(cum[cum.length - 1]).toBeLessThan(4010);
    const mid = pointAt(loop, cum, 1500).coord;
    const hit = nearestOnRoute(loop, cum, mid);
    expect(hit.dist).toBeLessThan(1);
    expect(hit.s).toBeCloseTo(1500, -1);
  });

  it('encode et décode une polyligne sans perte notable', () => {
    const loop = squareLoop(800);
    for (const q of [5, 6]) {
      const back = decodePolyline(encodePolyline(loop, q), q);
      expect(back.length).toBe(loop.length);
      expect(haversine(back[17], loop[17])).toBeLessThan(q === 5 ? 1.5 : 0.2);
    }
  });

  it('simplifie sans déformer', () => {
    const loop = squareLoop(1000);
    const s = simplify(loop, 2);
    expect(s.length).toBeLessThan(10);
    expect(Math.abs(cumulative(s).at(-1)! - cumulative(loop).at(-1)!)).toBeLessThan(5);
  });

  it('repère les allers-retours dans une boucle', () => {
    const loop = squareLoop(1000);
    expect(overlapRatio(loop)).toBeLessThan(0.02);
    const a = NANTES;
    const b = destination(a, 90, 2000);
    const out: LngLat[] = Array.from({ length: 40 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 39, a[1]]);
    const outBack = [...out, ...out.slice(0, -1).reverse()];
    expect(overlapRatio(outBack)).toBeGreaterThan(0.4);
    expect(similarity(loop, loop)).toBeCloseTo(1, 5);
  });
});

describe('altitude', () => {
  it('ignore le bruit et compte les vraies montées', () => {
    const noisy = Array.from({ length: 200 }, (_, i) => 20 + Math.sin(i) * 0.6);
    expect(elevationStats({ step: 30, ele: noisy }).ascent).toBeLessThan(8);
    const hill = Array.from({ length: 101 }, (_, i) => (i <= 50 ? i * 2 : 200 - i * 2));
    const st = elevationStats({ step: 30, ele: hill });
    expect(st.ascent).toBeGreaterThan(90);
    expect(st.ascent).toBeLessThan(101);
    expect(st.maxGrade).toBeGreaterThan(6);
    expect(st.maxGrade).toBeLessThan(7.5);
  });

  it('classe les pentes et inverse un profil', () => {
    expect(gradeClass(1)).toBe(0);
    expect(gradeClass(6)).toBe(2);
    expect(gradeClass(15)).toBe(4);
    const prof = { step: 30, ele: [0, 3, 6, 9, 12] };
    expect(grades(prof)[0]).toBeGreaterThan(9);
    const rev = reverseProfile(prof, 120);
    expect(rev.ele[0]).toBeCloseTo(12);
    expect(rev.ele.at(-1)).toBeCloseTo(0);
  });
});

describe('tracé coloré', () => {
  it('découpe le tracé en tronçons contigus qui couvrent toute la longueur', () => {
    const loop = squareLoop(1000);
    const ele = Array.from({ length: 134 }, (_, i) => (i < 40 ? 10 : i < 60 ? 10 + (i - 40) * 3 : 70 - (i - 60) * 0.8));
    const r = fakeRoute(loop, ele);
    const runs = slopeRuns(r);
    expect(runs[0].a).toBe(0);
    expect(runs.at(-1)!.b).toBeCloseTo(r.lengthM, 0);
    for (let i = 1; i < runs.length; i++) expect(runs[i].a).toBeCloseTo(runs[i - 1].b, 6);
    expect(runs.some((x) => x.c >= 3)).toBe(true);
    const segs = slopeSegments(r);
    const total = segs.reduce((s, g) => s + cumulative(g.coords).at(-1)!, 0);
    expect(Math.abs(total - r.lengthM)).toBeLessThan(5);
    const half = segmentsToGeoJSON(segs, r.lengthM / 2);
    const drawn = half.features.reduce((s, f) => s + cumulative(f.geometry.coordinates as LngLat[]).at(-1)!, 0);
    expect(Math.abs(drawn - r.lengthM / 2)).toBeLessThan(5);
  });

  it('inverse le sens en échangeant montée et descente', () => {
    const r = fakeRoute(squareLoop(500), [0, 10, 20, 30, 20, 10, 0, 0, 0]);
    const rev = reverseRoute(r);
    expect(rev.ascent).toBe(r.descent);
    expect(rev.coords[0]).toEqual(r.coords.at(-1));
  });
});

describe('noms et formats', () => {
  it('nomme un parcours d’après les voies les plus parcourues', () => {
    const name = routeName(
      [
        { names: ['Rue de Strasbourg'], length: 300 },
        { names: ['Quai de Versailles'], length: 1800 },
        { names: ['Parc de Procé'], length: 1200 },
      ],
      'loop',
      NANTES,
      destination(NANTES, 300, 2000),
    );
    expect(name).toBe('Quai de Versailles et parc de Procé');
    expect(routeName([], 'loop', NANTES, destination(NANTES, 0, 2000))).toBe('Boucle par le nord');
  });

  it('formate à la française', () => {
    expect(km(10123)).toBe('10,1 km');
    expect(duration(3900)).toBe('1 h 05');
    expect(duration(1500)).toBe('25 min');
    expect(pace(330)).toBe('5:30 /km');
  });

  it('estime durée et niveau de dénivelé', () => {
    expect(estimateDuration('run', 10000, 100, DEFAULT_SETTINGS)).toBe(330 * 11);
    expect(elevationLevel(30, 10)).toBe('Plat');
    expect(elevationLevel(300, 10)).toBe('Montagneux');
  });
});

describe('réglages du calcul', () => {
  it('traduit la demande en options de calcul', () => {
    const p = { ...defaultParams('road'), elevation: 1200, distanceKm: 60 };
    expect(hillPreference(p)).toBe(0.8);
    const c = costingFor(p, DEFAULT_SETTINGS);
    expect(c.costing).toBe('bicycle');
    expect(c.options.bicycle_type).toBe('Road');
    const t = costingFor({ ...defaultParams('trail'), surface: 'c' }, DEFAULT_SETTINGS);
    expect(t.options.max_hiking_difficulty).toBe(4);
    const g = costingFor({ ...defaultParams('gravel'), surface: 'c' }, DEFAULT_SETTINGS);
    expect(g.options.bicycle_type).toBe('Mountain');
  });
});

describe('enregistrement, partage et GPX', () => {
  it('reconstruit un parcours enregistré', () => {
    const r = fakeRoute(squareLoop(1000), Array.from({ length: 60 }, (_, i) => 20 + i));
    const back = deserialize(JSON.parse(JSON.stringify(serialize(r))), DEFAULT_SETTINGS);
    expect(back.name).toBe('Test');
    expect(Math.abs(back.lengthM - r.lengthM)).toBeLessThan(1);
    expect(Math.abs(back.ascent - r.ascent)).toBeLessThan(3);
    expect(back.surface?.paved).toBeCloseTo(0.7, 2);
    const compact = serialize(r, true);
    expect(compact.q).toBe(5);
    expect(compact.p.length).toBeLessThan(serialize(r).p.length);
  });

  it('écrit un GPX valide', () => {
    const r = fakeRoute(squareLoop(300), [0, 5, 10, 5, 0]);
    r.name = 'Boucle <test> & co';
    const gpx = toGPX(r);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('Boucle &lt;test&gt; &amp; co');
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(r.coords.length);
    expect(gpx).toContain('<type>running</type>');
  });
});
