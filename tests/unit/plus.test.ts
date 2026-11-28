import { describe, expect, it } from 'vitest';
import { advance, cancel, priceFor, priceOfMonth, PLUS_FLOOR_MONTH, streakAt, subscribe, type PlusSim } from '../../src/lib/plus';
import { ADS, contextual, pickAds, type AdSignals } from '../../src/lib/ads';

describe('Boucle+ dégressif', () => {
  it('baisse de 0,25 € par mois d’affilée jusqu’au plancher', () => {
    expect(priceOfMonth(1)).toBe(4.99);
    expect(priceOfMonth(2)).toBe(4.74);
    expect(priceOfMonth(12)).toBe(2.24);
    expect(PLUS_FLOOR_MONTH).toBe(13);
    expect(priceOfMonth(13)).toBe(1.99);
    expect(priceOfMonth(40)).toBe(1.99);
  });
  it('un mois sauté remet le prix de départ', () => {
    let s: PlusSim = { active: false, paid: [], now: '2026-11' };
    s = subscribe(s);
    s = advance(s); // décembre payé
    s = advance(s); // janvier payé
    expect(streakAt(s.paid, s.now)).toBe(3);
    expect(priceFor(s, '2027-02')).toBe(priceOfMonth(4));
    s = cancel(s);
    s = advance(s); // février : rien de payé
    expect(s.now).toBe('2027-02');
    // Reprendre en février garde la série (aucun mois entier manqué)…
    expect(priceFor(s)).toBe(priceOfMonth(4));
    s = advance(s); // …mais février entier sans abonnement : en mars, retour à 4,99 €
    expect(priceFor(s)).toBe(4.99);
    s = subscribe(s);
    expect(streakAt(s.paid, s.now)).toBe(1);
  });
});

describe('publicités simulées', () => {
  const base: AdSignals = { sport: 'run', weekKm: 25, darkShare: 0.6, distanceKm: 18, climbPerKm: 4, envs: [], temp: 6, rain: false, totalKm: 700 };
  it('choisit d’après le profil', () => {
    const ids = pickAds(base).map((a) => a.id);
    expect(ids.slice(0, 3)).toContain('veste-nuit');
    expect(ids).toContain('chaussures');
    expect(ids).not.toContain('barres-velo');
    expect(pickAds({ ...base, sport: 'road' }).map((a) => a.id)).toContain('barres-velo');
    expect(pickAds({ ...base, sport: 'walk', darkShare: 0 })[0].id).toBe('marche');
  });
  it('sans accord, seulement la sortie affichée', () => {
    const ids = pickAds(contextual(base)).map((a) => a.id);
    expect(ids).not.toContain('veste-nuit');
    expect(ids).toContain('gels');
  });
  it('chaque pub dit pourquoi elle est là', () => {
    for (const a of ADS) expect(a.why(base).length).toBeGreaterThan(5);
  });
});
