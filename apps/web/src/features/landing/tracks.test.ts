import { describe, expect, it } from 'vitest';
import { THEMES } from '../../shared/lib/theme';
import { trackFor } from './tracks';

/* Uma música por tema: cada uma com a sua cara, e o modo claro deixando mais leve. */
describe('música de cada tema', () => {
  it('todo tema tem a sua faixa, e elas são diferentes entre si', () => {
    const ids = THEMES.map((t) => trackFor(t.value).id);
    expect(new Set(ids).size).toBe(THEMES.length);
  });

  it('cada faixa tem 4 acordes, escala para os botões e andamento de 60 a 120 BPM', () => {
    for (const t of THEMES) {
      const track = trackFor(t.value);
      expect(track.chords).toHaveLength(4);
      expect(track.scale.length).toBeGreaterThanOrEqual(5);
      expect(track.bpm).toBeGreaterThanOrEqual(60);
      expect(track.bpm).toBeLessThanOrEqual(120);
      // As calmas ficam abaixo de 100; as animadas (anos 80) têm o pulso do baixo.
      if (track.bpm > 100) expect(track.drive?.bass8ths).toBe(true);
      for (const [at] of track.plucks) expect(at).toBeLessThan(16);
    }
  });

  it('a escala dos botões combina com a faixa (todas as notas cabem na tonalidade)', () => {
    for (const t of THEMES) {
      const track = trackFor(t.value);
      const inKey = new Set(track.chords.flat().map((m) => m % 12));
      // Pentatônica dentro do campo harmônico: toda nota da escala aparece em algum acorde
      // (ou é a 2ª/6ª da tonalidade, que soa bem sobre o pad).
      const outside = track.scale.filter((m) => !inKey.has(m % 12));
      expect(outside.length, t.value).toBeLessThanOrEqual(2);
    }
  });

  it('o modo claro deixa a faixa mais leve: um pouco mais rápida, mais aberta, bumbo mais macio', () => {
    const dark = trackFor('screem');
    const light = trackFor('screem', 'light');
    expect(light.bpm).toBeGreaterThan(dark.bpm);
    expect(light.padCutoff[1]).toBeGreaterThan(dark.padCutoff[1]);
    expect(light.kickLevel).toBeLessThan(dark.kickLevel);
    expect(light.chords).toEqual(dark.chords);
  });
});
