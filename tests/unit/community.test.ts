import { describe, expect, it } from 'vitest';
import { destination, haversine } from '../../src/lib/geo';
import { hidePrivateZone } from '../../src/lib/community/privacy';
import { checkText } from '../../src/lib/community/moderation';
import { createLocalBackend, DEMO_CODE } from '../../src/lib/community/local';
import { ago } from '../../src/lib/community/time';
import type { LngLat } from '../../src/lib/types';

const HOME: LngLat = [-1.5536, 47.2184];

describe('zone privée', () => {
  it('le parcours publié commence et finit hors du cercle autour du départ', () => {
    const side = (from: LngLat, brg: number) => Array.from({ length: 30 }, (_, k) => destination(from, brg, (k + 1) * 50));
    const a = side(HOME, 0);
    const b = side(a[29], 90);
    const c = side(b[29], 180);
    const d = side(c[29], 270);
    const coords = [HOME, ...a, ...b, ...c, ...d];
    const prof = { step: 30, ele: Array.from({ length: 202 }, (_, i) => 10 + (i % 5)) };
    const t = hidePrivateZone(coords, prof, 300);
    expect(haversine(t.coords[0], HOME)).toBeGreaterThanOrEqual(300);
    expect(haversine(t.coords[t.coords.length - 1], HOME)).toBeGreaterThanOrEqual(300);
    expect(t.removed).toBeGreaterThan(550);
    expect(t.profile.ele.length).toBeGreaterThan(150);
  });
  it('un parcours trop court reste entier', () => {
    const coords = [HOME, destination(HOME, 0, 200), destination(HOME, 45, 250), HOME];
    expect(hidePrivateZone(coords, { step: 30, ele: [1, 2] }, 300).removed).toBe(0);
  });
});

describe('modération des textes', () => {
  it('refuse insultes, déguisées ou non, et les liens', () => {
    expect(checkText('Quel connard')).not.toBeNull();
    expect(checkText('C0NNARD !')).not.toBeNull();
    expect(checkText('Voir www.exemple.com')).not.toBeNull();
  });
  it('laisse passer les mots ordinaires', () => {
    expect(checkText('Arrivé avec du retard, mais superbe parcours !')).toBeNull();
    expect(checkText('Sentier du raton laveur, conseillé le matin')).toBeNull();
  });
});

describe('date relative', () => {
  it('parle comme un fil', () => {
    const now = Date.UTC(2026, 10, 20, 12);
    expect(ago(now - 30_000, now)).toBe('à l’instant');
    expect(ago(now - 3 * 3600_000, now)).toBe('il y a 3 h');
    expect(ago(now - 86400_000 * 1.2, now)).toBe('hier');
    expect(ago(now - 86400_000 * 4, now)).toBe('il y a 4 j');
  });
});

describe('Communauté de démonstration', () => {
  it('compte, profil, fil, j’aime, commentaire, abonnement, publication, suppression', async () => {
    const b = await createLocalBackend();
    expect(b.demo).toBe(true);
    const nearby = await b.feed({ kind: 'nearby', center: HOME });
    expect(nearby.length).toBeGreaterThanOrEqual(5);
    // Du plus proche au plus loin.
    for (let i = 1; i < nearby.length; i++) expect(haversine(HOME, nearby[i].start)).toBeGreaterThanOrEqual(haversine(HOME, nearby[i - 1].start));

    await expect(b.like(nearby[0].id, true)).rejects.toThrow(/Connecte-toi/);
    await b.sendCode('moi@exemple.fr');
    await expect(b.verifyCode('moi@exemple.fr', '000000')).rejects.toThrow(/Code incorrect/);
    const s = await b.verifyCode('moi@exemple.fr', DEMO_CODE);
    expect(s.email).toBe('moi@exemple.fr');
    await expect(b.saveProfile({ firstName: 'Ado', city: null, sports: ['run'], level: 'debut', practiceYears: null, bio: null, avatar: null }, { birthYear: new Date().getFullYear() - 12 })).rejects.toThrow(/15 ans/);
    const me = await b.saveProfile({ firstName: 'Romain', city: 'Nantes', sports: ['run'], level: 'regular', practiceYears: 3, bio: null, avatar: null }, { birthYear: 2004 });

    const r = nearby[0];
    await b.like(r.id, true);
    expect((await b.route(r.id))!.likedByMe).toBe(true);
    expect((await b.route(r.id))!.likes).toBe(r.likes + 1);
    const c = await b.comment(r.id, 'Très beau parcours');
    expect((await b.comments(r.id)).some((x) => x.id === c.id && x.authorName === 'Romain')).toBe(true);

    await b.follow(r.authorId, true);
    expect((await b.feed({ kind: 'following' })).every((x) => x.authorId === r.authorId)).toBe(true);
    expect((await b.profile(r.authorId))!.stats.followedByMe).toBe(true);

    const pub = await b.publish({ name: 'Ma boucle', description: null, sport: 'run', shape: 'loop', distanceM: 5000, ascentM: 30, start: HOME, data: r.data });
    expect((await b.routesBy(me.id)).map((x) => x.id)).toContain(pub.id);

    await b.block(r.authorId, true);
    expect(await b.blocked()).toContain(r.authorId);

    await b.deleteAccount();
    expect(await b.session()).toBeNull();
    expect(await b.route(pub.id)).toBeNull();
    expect((await b.comments(r.id)).some((x) => x.id === c.id)).toBe(false);
  });
});
