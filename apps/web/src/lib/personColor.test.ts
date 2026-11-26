import { describe, expect, it } from 'vitest';
import { tintFor, tintStyle } from './personColor';

/* Cor da pessoa (miniatura sem câmera e capa da sala): pastel, fixa por pessoa. */
describe('cor da pessoa', () => {
  it('a mesma pessoa tem sempre a mesma cor', () => {
    expect(tintFor('Vinicius')).toEqual(tintFor('Vinicius'));
  });

  it('pessoas diferentes se espalham pela paleta (não fica tudo da mesma cor)', () => {
    const names = ['Will', 'Ana', 'Beto', 'Caio', 'Duda', 'Lucas', 'Bárbara', 'Jacob', 'Flazo'];
    const hues = new Set(names.map((n) => tintFor(n).hue));
    expect(hues.size).toBeGreaterThanOrEqual(4);
  });

  it('é pastel: saturação baixa, nunca neon', () => {
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      expect(tintFor(n).sat).toBeLessThanOrEqual(0.55);
    }
  });

  it('vira as variáveis do degradê: alto, baixo (mais escuro) e a bolinha', () => {
    const style = tintStyle({ hue: 280, sat: 0.32 }) as Record<string, string>;
    expect(style['--tint-1']).toBe('hsl(280 32% 50%)');
    expect(style['--tint-2']).toBe('hsl(280 26% 28%)');
    expect(style['--tint-ring']).toMatch(/^hsl\(280 /);
  });
});
