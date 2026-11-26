import { describe, expect, it } from 'vitest';
import { ALL_EMOJIS, searchEmojis } from '../../src/lib/emojis';

describe('émojis : recherche en mots', () => {
  it('trouve le bon émoji en tête, sans accent ni pluriel', () => {
    expect(searchEmojis('boulangerie')[0]).toBe('🥖');
    expect(searchEmojis('piscine')[0]).toBe('🏊');
    expect(searchEmojis('mamie')[0]).toBe('👵');
    expect(searchEmojis('ecole')).toContain('🏫');
    expect(searchEmojis('salle sport')[0]).toBe('🏋️');
    expect(searchEmojis('plages')).toContain('🏖️');
  });
  it('rien pour un mot inconnu ; beaucoup d’émojis, sans doublon', () => {
    expect(searchEmojis('zzzz')).toEqual([]);
    expect(ALL_EMOJIS.length).toBeGreaterThan(200);
    expect(new Set(ALL_EMOJIS.map(([e]) => e)).size).toBe(ALL_EMOJIS.length);
  });
});
