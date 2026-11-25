import { describe, expect, it } from 'vitest';
import { readHours } from '../../src/lib/hours';

// Horaires réels d'OpenStreetMap à Nantes. Le 25 novembre 2026 est un mercredi.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('horaires d’ouverture', () => {
  it('24/7', () => {
    expect(readHours('24/7')).toMatchObject({ open: true, label: 'Ouvert 24 h/24', short: 'Ouvert 24 h/24' });
  });
  it('un parc aux horaires de saison (Procé)', () => {
    const oh = '08:30-20:00; Oct 23-Nov 17,Jan 15-Mar 19 08:30-18:30; Nov 18-Jan 14 08:30-17:30';
    expect(readHours(oh, at(2026, 11, 25, 12))).toEqual({ open: true, label: 'Ouvert · jusqu’à 17 h 30', today: '8 h 30 – 17 h 30', short: 'Ouvert · 17 h 30' });
    expect(readHours(oh, at(2026, 11, 25, 18))?.short).toBe('Ouvre demain 8 h 30');
    expect(readHours(oh, at(2026, 11, 25, 18))?.label).toBe('Fermé · ouvre demain à 8 h 30');
    expect(readHours(oh, at(2026, 7, 10, 19))?.label).toBe('Ouvert · jusqu’à 20 h');
    expect(readHours(oh, at(2026, 11, 1, 18))?.label).toBe('Ouvert · jusqu’à 18 h 30');
  });
  it('un musée fermé le samedi l’été (Imprimerie)', () => {
    const oh = 'Mo-Sa 10:00-12:00,14:00-17:30; Jul-Aug Sa off';
    expect(readHours(oh, at(2026, 7, 11, 11))).toMatchObject({ open: false, today: 'fermé' });
    expect(readHours(oh, at(2026, 11, 25, 13))?.label).toBe('Fermé · ouvre à 14 h');
    expect(readHours(oh, at(2026, 11, 25, 13))?.today).toBe('10 h – 12 h, 14 h – 17 h 30');
  });
  it('une règle plus loin remplace les précédentes (Jules-Verne)', () => {
    const oh = '14:00-18:00; Tu off; Sa 10:00-12:00,14:00-18:00; Jul-Aug Mo-Su 10:00-19:00';
    expect(readHours(oh, at(2026, 11, 24, 15))?.open).toBe(false);
    expect(readHours(oh, at(2026, 11, 28, 11))?.label).toBe('Ouvert · jusqu’à 12 h');
    expect(readHours(oh, at(2026, 7, 14, 11))?.label).toBe('Ouvert · jusqu’à 19 h');
  });
  it('les règles additionnelles s’ajoutent (Maillé-Brézé)', () => {
    const oh = 'Jul-Aug: Mo-Su,PH 14:30-17:00, Jul-Aug: Tu-Th 10:30-11:00, Sep-Jun: Tu-Fr 14:30-15:00, Sep-Jun: Sa,Su,PH 14:30-16:00';
    expect(readHours(oh, at(2026, 7, 15, 10, 45))).toMatchObject({ open: true, label: 'Ouvert · jusqu’à 11 h', today: '10 h 30 – 11 h, 14 h 30 – 17 h' });
    expect(readHours(oh, at(2026, 11, 25, 14, 40))?.label).toBe('Ouvert · jusqu’à 15 h');
  });
  it('jours fermés à date fixe (Dobrée)', () => {
    const oh = 'Sep-Jun We-Su 10:00-18:00; May 22-Aug 31 We-Su 10:00-19:00; Jan 01,May 01,Jul 14,Dec 25 off';
    expect(readHours(oh, at(2026, 12, 25, 11))?.today).toBe('fermé');
    expect(readHours(oh, at(2026, 11, 25, 11))?.today).toBe('10 h – 18 h');
    expect(readHours(oh, at(2026, 6, 10, 18, 30))?.open).toBe(true);
  });
  it('une forme inconnue est montrée telle quelle, en français', () => {
    const h = readHours('Mo-Su sunrise-sunset');
    expect(h?.open).toBeNull();
    expect(h?.label).toBe('tous les jours lever du soleil-coucher du soleil');
  });
});
