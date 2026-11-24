import { describe, expect, it } from 'vitest';
import { localIdeas } from '../../src/lib/shapes';

describe('idées de dessins', () => {
  it('« vache » dessine une vache, pas le mot', async () => {
    const ideas = await localIdeas('une vache');
    expect(ideas[0].name).toBe('Vache');
    expect(ideas.some((i) => i.name === 'VACHE')).toBe(false);
    // Des traits dans le carnet (0 à 1).
    const pts = ideas[0].drawing.strokes.flat();
    expect(pts.length).toBeGreaterThan(20);
    expect(Math.min(...pts.flat())).toBeGreaterThanOrEqual(0);
    expect(Math.max(...pts.flat())).toBeLessThanOrEqual(1);
  });
  it('pluriels, synonymes et petites fautes', async () => {
    expect((await localIdeas('des chevaux'))[0].name).toBe('Cheval');
    expect((await localIdeas('un taureau'))[0].name).toBe('Vache');
    expect((await localIdeas('une fussée'))[0].name).toBe('Fusée');
    expect((await localIdeas('mon chiot'))[0].name).toBe('Chien');
  });
  it('un nombre ou un prénom inconnu s’écrit au trait', async () => {
    expect((await localIdeas('2027'))[0].name).toBe('2027');
    expect((await localIdeas('Romain'))[0].name).toBe('ROMAIN');
  });
});
