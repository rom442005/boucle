import { describe, expect, it } from 'vitest';
import { sunTimes } from '../../src/lib/sun';
import { daylightLine, sky, windText } from '../../src/lib/conditions';
import { NNBSP } from '../../src/lib/format';

const NANTES = { lat: 47.2184, lng: -1.5536 };
const utc = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString().slice(11, 16));

describe('soleil', () => {
  it('lever et coucher à Nantes le 19 novembre 2026 (à quelques minutes près)', () => {
    const t = sunTimes(Date.UTC(2026, 10, 19, 12), NANTES.lat, NANTES.lng);
    // Référence NOAA : lever 8 h 16, coucher 17 h 27 (heure de Paris, UTC+1).
    const min = (hhmm: string | null) => {
      const [h, m] = hhmm!.split(':').map(Number);
      return h * 60 + m;
    };
    expect(Math.abs(min(utc(t.sunrise)) - (7 * 60 + 16))).toBeLessThanOrEqual(4);
    expect(Math.abs(min(utc(t.sunset)) - (16 * 60 + 27))).toBeLessThanOrEqual(4);
    // Le crépuscule civil vient une demi-heure environ après le coucher.
    expect((t.dusk! - t.sunset!) / 60000).toBeGreaterThan(25);
    expect((t.dusk! - t.sunset!) / 60000).toBeLessThan(45);
  });

  it('jour polaire : pas de coucher', () => {
    const t = sunTimes(Date.UTC(2026, 5, 21, 12), 78.2, 15.6);
    expect(t.sunset).toBeNull();
  });

  it('retour de jour, au crépuscule ou de nuit', () => {
    const t = sunTimes(Date.UTC(2026, 10, 19, 12), NANTES.lat, NANTES.lng);
    const day = daylightLine(t.sunset! - 3 * 3600_000, NANTES.lat, NANTES.lng, 3600);
    expect(day?.title).toMatch(/^Retour vers .+, de jour$/);
    expect(day?.warn).toBeFalsy();
    const dusk = daylightLine(t.sunset! - 20 * 60_000, NANTES.lat, NANTES.lng, 1800);
    expect(dusk?.title).toMatch(/au crépuscule$/);
    const night = daylightLine(t.sunset! - 10 * 60_000, NANTES.lat, NANTES.lng, 3 * 3600);
    expect(night?.title).toMatch(/de nuit$/);
    expect(night?.warn).toBe(true);
    const dark = daylightLine(t.dusk! + 3600_000, NANTES.lat, NANTES.lng, 1800);
    expect(dark?.title).toBe('Départ de nuit');
  });
});

describe('météo en clair', () => {
  it('ciel et vent', () => {
    expect(sky(0, true).label).toBe('Ciel clair');
    expect(sky(61, true).icon).toBe('rain');
    expect(windText({ windFrom: 300, windKmh: 18.4, temperature: 9, isDay: true, code: 3 })).toBe(`Vent du nord-ouest à 18${NNBSP}km/h`);
    expect(windText({ windFrom: 270, windKmh: 25, temperature: 9, isDay: true, code: 3 })).toBe(`Vent d’ouest à 25${NNBSP}km/h`);
    expect(windText({ windFrom: 90, windKmh: 3, temperature: 9, isDay: true, code: 3 })).toBe('Vent faible');
  });
});
