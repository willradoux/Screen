import { describe, expect, it } from 'vitest';
import { BPM, PENTATONIC, STEP, chordFor, midiToHz } from './synthwave';

describe('trilha da página de apresentação', () => {
  it('afina no lá 440 e anda calma, a 76 BPM', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(57)).toBeCloseTo(220);
    expect(BPM).toBe(76);
    expect(STEP).toBeCloseTo(60 / 76 / 4);
  });

  it('a progressão é Am7, Fmaj7, Cmaj7, G6 e repete a cada 4 compassos', () => {
    expect(chordFor(0)).toEqual([57, 60, 64, 67]);
    expect(chordFor(1)).toEqual([53, 57, 60, 64]);
    expect(chordFor(2)).toEqual([48, 52, 55, 59]);
    expect(chordFor(3)).toEqual([55, 59, 62, 64]);
    expect(chordFor(4)).toEqual(chordFor(0));
  });

  it('os botões tocam só notas da pentatônica de lá menor (sempre combinam com a música)', () => {
    const scale = new Set([9, 0, 2, 4, 7]); // lá, dó, ré, mi, sol
    for (const n of PENTATONIC) expect(scale.has(n % 12)).toBe(true);
  });
});
