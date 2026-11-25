import { afterEach, describe, expect, it, vi } from 'vitest';
import { classify, discover, resetDiscover } from '../../src/lib/discover';

// Un extrait de ce qu'OpenStreetMap répond pour le centre de Nantes.
const ELEMENTS = [
  { type: 'way', id: 1, bounds: { minlat: 47.2052, minlon: -1.5652, maxlat: 47.2072, maxlon: -1.5622 }, tags: { name: 'Les Machines de l’Île', tourism: 'attraction', wikipedia: "fr:Les Machines de l'île", opening_hours: 'Tu-Su 10:00-18:00' } },
  { type: 'node', id: 7, lat: 47.2063, lon: -1.5641, tags: { name: 'Galerie des Machines', tourism: 'attraction', wikipedia: "fr:Les Machines de l'île" } },
  { type: 'node', id: 2, lat: 47.2041, lon: -1.5639, tags: { name: 'Grue Titan Jaune', man_made: 'crane', wikipedia: 'fr:Grues Titan de Nantes' } },
  { type: 'way', id: 3, bounds: { minlat: 47.2178, minlon: -1.5602, maxlat: 47.2183, maxlon: -1.5594 }, tags: { name: 'Tour Bretagne', building: 'office', wikipedia: 'fr:Tour Bretagne' } },
  { type: 'way', id: 4, bounds: { minlat: 47.2185, minlon: -1.5440, maxlat: 47.2215, maxlon: -1.5400 }, tags: { name: 'Jardin des Plantes', leisure: 'park', wikipedia: 'fr:Jardin des plantes de Nantes', opening_hours: '08:30-20:00' } },
  { type: 'node', id: 5, lat: 47.2160, lon: -1.5500, tags: { name: 'Pierre Cambronne', historic: 'tomb', wikipedia: 'fr:Pierre Cambronne' } },
  { type: 'way', id: 6, bounds: { minlat: 47.2130, minlon: -1.5590, maxlat: 47.2131, maxlon: -1.5589 }, tags: { name: 'Immeuble au 3, rue Gresset', building: 'apartments', wikipedia: 'fr:Immeuble au 3, rue Gresset de Nantes' } },
];
const PAGES = [
  { title: "Les Machines de l'île", length: 62000, thumbnail: { source: 'https://example.org/machines.jpg' }, description: 'espace d’exposition et d’animation à Nantes' },
  { title: 'Grues Titan de Nantes', length: 31000, thumbnail: { source: 'https://example.org/grue.jpg' } },
  { title: 'Tour Bretagne', length: 41000, thumbnail: { source: 'https://example.org/tour.jpg' } },
  { title: 'Jardin des plantes de Nantes', length: 28000, thumbnail: { source: 'https://example.org/jardin.jpg' } },
];

describe('découverte : les lieux emblématiques', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetDiscover();
  });

  it('garde ce qui se visite, écarte tombes et immeubles', () => {
    expect(classify({ name: 'Pierre Cambronne', historic: 'tomb' })).toBeNull();
    expect(classify({ name: 'Immeuble au 3, rue Gresset', building: 'apartments' })).toBeNull();
    expect(classify({ name: 'Lycée Clemenceau', building: 'school', amenity: 'school' })).toBeNull();
    expect(classify({ name: 'Grue Titan grise', historic: 'technical_monument' })?.k).toBe('Grue');
    expect(classify({ name: 'Tour LU', tourism: 'attraction' })?.k).toBe('À voir');
    expect(classify({ name: 'Tour Bretagne', building: 'office' })?.k).toBe('Tour');
    expect(classify({ name: 'Jardin des Plantes', leisure: 'park' })?.k).toBe('Jardin');
    expect(classify({ name: 'Parc de Procé', leisure: 'park' })?.k).toBe('Parc');
    expect(classify({ name: 'Cathédrale Saint-Pierre', amenity: 'place_of_worship' })?.k).toBe('Cathédrale');
    expect(classify({ name: 'Château des Ducs', historic: 'castle' })?.k).toBe('Château');
  });

  it('deux requêtes pour une zone nouvelle, aucune pour une zone déjà vue', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        calls.push(u.includes('overpass') ? 'overpass' : 'wikipedia');
        const body = u.includes('overpass') ? { elements: ELEMENTS } : { query: { pages: PAGES } };
        return { ok: true, json: async () => body } as Response;
      }),
    );
    const view: [number, number, number, number] = [-1.58, 47.2, -1.53, 47.23];
    const spots = await discover(view);
    expect(calls).toEqual(['overpass', 'wikipedia']);
    const names = spots.map((s) => s.name);
    // Les Machines une seule fois (deux objets, un même article), en tête ; ni tombe ni immeuble.
    expect(names.filter((n) => /Machines/.test(n))).toHaveLength(1);
    expect(names[0]).toBe('Les Machines de l’Île');
    expect(names).not.toContain('Pierre Cambronne');
    expect(names.some((n) => /Immeuble/.test(n))).toBe(false);
    expect(spots[0]).toMatchObject({ image: 'https://example.org/machines.jpg', hours: 'Tu-Su 10:00-18:00', emoji: '✨' });
    expect(spots.find((s) => s.name === 'Jardin des Plantes')?.bounds).toEqual([-1.544, 47.2185, -1.54, 47.2215]);
    // La même zone, puis une zone voisine déjà couverte : tout vient de l'appareil.
    await discover(view);
    await discover([-1.575, 47.205, -1.535, 47.225]);
    expect(calls).toHaveLength(2);
  });

  it('la Tour LU, sans article français : sa fiche Wikidata, sa photo venue avec les articles', async () => {
    const TOUR_LU = { type: 'node', id: 9, lat: 47.2153, lon: -1.5437, tags: { name: 'Tour LU', tourism: 'attraction', wikidata: 'Q1637288', opening_hours: 'Su 15:00-19:00; We-Sa 14:00-19:00' } };
    const calls: string[] = [];
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        const kind = u.hostname.includes('wikidata') ? 'wikidata' : u.hostname.includes('wikipedia') ? 'wikipedia' : 'overpass';
        calls.push(kind);
        if (kind === 'wikipedia') asked.push(...u.searchParams.get('titles')!.split('|'));
        const body =
          kind === 'overpass'
            ? { elements: [...ELEMENTS, TOUR_LU] }
            : kind === 'wikidata'
              ? {
                  entities: {
                    Q1637288: {
                      sitelinks: { dewiki: { title: 'Tour LU' }, commonswiki: { title: 'Category:Tour LU' } },
                      descriptions: { fr: { value: 'tour située à Nantes, en France' } },
                      claims: { P18: [{ mainsnak: { datavalue: { value: 'Nantes-TourLU.jpg' } } }] },
                    },
                  },
                }
              : {
                  query: {
                    normalized: [{ from: 'File:Nantes-TourLU.jpg', to: 'Fichier:Nantes-TourLU.jpg' }],
                    pages: [...PAGES, { title: 'Fichier:Nantes-TourLU.jpg', missing: true, thumbnail: { source: 'https://example.org/tourlu.jpg' } }],
                  },
                };
        return { ok: true, json: async () => body } as Response;
      }),
    );
    const view: [number, number, number, number] = [-1.58, 47.2, -1.53, 47.23];
    const spots = await discover(view);
    // Une requête Wikidata de plus, et la photo demandée à Wikipédia dans le même appel que les articles.
    expect(calls).toEqual(['overpass', 'wikidata', 'wikipedia']);
    expect(asked).toContain('File:Nantes-TourLU.jpg');
    expect(spots.find((s) => s.name === 'Tour LU')).toMatchObject({
      image: 'https://example.org/tourlu.jpg',
      desc: 'tour située à Nantes, en France',
      kind: 'À voir',
      size: 8000,
    });
    await discover(view);
    expect(calls).toHaveLength(3);
  });

  it('au-delà de 50 lieux, Wikipédia seulement pour ceux qui peuvent encore entrer dans la liste', async () => {
    const els: unknown[] = [];
    for (let i = 0; i < 60; i++) els.push({ type: 'node', id: 100 + i, lat: 47.21 + i * 1e-4, lon: -1.55, tags: { name: `Musée ${i}`, tourism: 'museum', wikipedia: `fr:Musée ${i}` } });
    for (let i = 0; i < 40; i++) els.push({ type: 'node', id: 300 + i, lat: 47.21 + i * 1e-4, lon: -1.56, tags: { name: `Église ${i}`, amenity: 'place_of_worship', wikipedia: `fr:Église ${i}` } });
    const asked: string[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (!u.hostname.includes('wikipedia')) return { ok: true, json: async () => ({ elements: els }) } as Response;
        const titles = u.searchParams.get('titles')!.split('|');
        asked.push(titles);
        const pages = titles.map((t) => ({ title: t, length: 100000, thumbnail: { source: `https://example.org/${encodeURIComponent(t)}.jpg` } }));
        return { ok: true, json: async () => ({ query: { pages } }) } as Response;
      }),
    );
    const spots = await discover([-1.58, 47.2, -1.53, 47.23]);
    // Les 50 premiers musées, puis les 10 autres ; aucune des 40 églises (même avec un très long article, elles
    // ne passeraient pas devant les musées déjà connus).
    expect(asked.map((a) => a.length)).toEqual([50, 10]);
    expect(asked.flat().some((t) => t.startsWith('Église'))).toBe(false);
    expect(spots).toHaveLength(24);
    expect(spots.every((s) => s.kind === 'Musée' && s.image)).toBe(true);
  });

  it('sans réseau : une erreur (« ne répond pas »), pas une liste vide trompeuse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(discover([-1.58, 47.2, -1.53, 47.23])).rejects.toThrow('overpass');
  });
});
