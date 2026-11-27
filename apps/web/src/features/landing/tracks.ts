import type { Theme } from '../../shared/lib/theme';

/*
 * Uma faixa por tema (todas originais, geradas na hora): andamento, acordes, a escala dos botões
 * (qualquer nota dela combina com a faixa), o dedilhado e o timbre. Trocar o tema troca a música
 * no começo do próximo compasso. O modo claro deixa a faixa mais leve e aberta.
 */

export interface Track {
  id: string;
  /** Nome que aparece para quem ouve (leitores de tela e o indicador da TV). */
  name: string;
  bpm: number;
  /** Quatro acordes (MIDI), um por compasso, repetindo. */
  chords: readonly (readonly number[])[];
  /** Notas dos botões (uma escala que sempre combina com os acordes). */
  scale: readonly number[];
  /** Dedilhado: [semicolcheia do compasso, índice da nota no acorde]. */
  plucks: readonly (readonly [number, number])[];
  /** Timbre do dedilhado e do pad. */
  pluckWave: OscillatorType;
  padWave: OscillatorType;
  /** Abertura do filtro do pad (Hz): fechado e aberto. */
  padCutoff: readonly [number, number];
  /** Bumbo: 0 = sem bumbo; 2 = no 1 e no 3; 4 = os quatro tempos. */
  kicks: 0 | 2 | 4;
  kickLevel: number;
  /** Chiado no contratempo (0 = sem). */
  shaker: number;
  /** Quanto de reverb e de eco. */
  reverb: number;
  echo: number;
  /** Volume do dedilhado. */
  pluckLevel: number;
  /**
   * Pegada anos 80 (synthpop animado): baixo pulsando em colcheias, caixa no 2 e no 4 com
   * reverb grande e chimbal nos contratempos. Sem isso, a faixa é ambiente e calma.
   */
  drive?: { bass8ths: boolean; snare: number; hats: number };
}

/** Noturna e calma (a de sempre): lá menor, 76 BPM. */
const NIGHT: Track = {
  id: 'night',
  name: 'Noite na cidade',
  bpm: 76,
  chords: [
    [57, 60, 64, 67], // Am7
    [53, 57, 60, 64], // Fmaj7
    [48, 52, 55, 59], // Cmaj7
    [55, 59, 62, 64], // G6
  ],
  scale: [69, 72, 74, 76, 79, 81, 84],
  plucks: [
    [0, 0],
    [3, 2],
    [6, 3],
    [10, 1],
    [12, 2],
  ],
  pluckWave: 'triangle',
  padWave: 'sawtooth',
  padCutoff: [500, 1100],
  kicks: 2,
  kickLevel: 0.55,
  shaker: 0.025,
  reverb: 0.45,
  echo: 0.35,
  pluckLevel: 0.05,
};

/**
 * Neon: synthpop anos 80 para cima (no clima de hino de abertura de desenho), original: dó maior,
 * 116 BPM, bumbo nos quatro tempos, baixo pulsando, caixa com reverb e arpejo brilhante.
 */
const NEON: Track = {
  id: 'neon',
  name: 'A noite começa',
  bpm: 116,
  chords: [
    [48, 52, 55, 60], // C
    [43, 47, 50, 55], // G
    [45, 48, 52, 57], // Am
    [41, 45, 48, 53], // F
  ],
  scale: [60, 62, 64, 67, 69, 72, 74],
  plucks: [
    [0, 0],
    [2, 2],
    [4, 1],
    [6, 3],
    [8, 0],
    [10, 2],
    [12, 1],
    [14, 3],
  ],
  pluckWave: 'sawtooth',
  padWave: 'sawtooth',
  padCutoff: [700, 1700],
  kicks: 4,
  kickLevel: 0.5,
  shaker: 0,
  reverb: 0.38,
  echo: 0.26,
  pluckLevel: 0.03,
  drive: { bass8ths: true, snare: 0.22, hats: 0.03 },
};

/** Fim de tarde: ré maior, quente e devagar, sem chiado. */
const SUNSET: Track = {
  id: 'sunset',
  name: 'Fim de tarde',
  bpm: 70,
  chords: [
    [50, 54, 57, 61], // Dmaj7
    [47, 50, 54, 57], // Bm7
    [43, 47, 50, 54], // Gmaj7
    [45, 49, 52, 54], // A6
  ],
  scale: [62, 64, 66, 69, 71, 74, 76],
  plucks: [
    [0, 0],
    [4, 2],
    [7, 3],
    [11, 1],
  ],
  pluckWave: 'sine',
  padWave: 'triangle',
  padCutoff: [600, 1400],
  kicks: 2,
  kickLevel: 0.42,
  shaker: 0,
  reverb: 0.55,
  echo: 0.4,
  pluckLevel: 0.07,
};

/** Acelera: dó maior, leve e para cima. */
const UPLIFT: Track = {
  id: 'uplift',
  name: 'Pra frente',
  bpm: 82,
  chords: [
    [48, 52, 55, 59], // Cmaj7
    [45, 48, 52, 55], // Am7
    [41, 45, 48, 52], // Fmaj7
    [43, 47, 50, 53], // G7
  ],
  scale: [60, 62, 64, 67, 69, 72, 74],
  plucks: [
    [0, 0],
    [3, 1],
    [6, 2],
    [8, 3],
    [11, 2],
    [14, 1],
  ],
  pluckWave: 'triangle',
  padWave: 'sawtooth',
  padCutoff: [600, 1500],
  kicks: 2,
  kickLevel: 0.5,
  shaker: 0.028,
  reverb: 0.4,
  echo: 0.32,
  pluckLevel: 0.05,
};

/** Gelo: fá menor, quase sem batida, sinos longos com muito reverb. */
const ICE: Track = {
  id: 'ice',
  name: 'Cristal',
  bpm: 64,
  chords: [
    [53, 56, 60, 63], // Fm7
    [49, 53, 56, 60], // Dbmaj7
    [56, 60, 63, 67], // Abmaj7
    [51, 55, 58, 60], // Eb6
  ],
  scale: [65, 68, 70, 72, 75, 77, 80],
  plucks: [
    [0, 3],
    [6, 1],
    [10, 2],
  ],
  pluckWave: 'sine',
  padWave: 'triangle',
  padCutoff: [800, 2000],
  kicks: 0,
  kickLevel: 0,
  shaker: 0,
  reverb: 0.7,
  echo: 0.45,
  pluckLevel: 0.075,
};

/** Clássico (o tema de antes, laranja e rosa): synthpop anos 80, lá menor, animado. */
const RETRO: Track = {
  id: 'retro',
  name: 'Anos 80',
  bpm: 112,
  chords: [
    [57, 60, 64, 67], // Am7
    [53, 57, 60, 65], // F
    [48, 52, 55, 60], // C
    [55, 59, 62, 67], // G
  ],
  scale: [69, 72, 74, 76, 79, 81, 84],
  plucks: [
    [0, 0],
    [3, 1],
    [6, 2],
    [8, 3],
    [12, 2],
  ],
  pluckWave: 'square',
  padWave: 'sawtooth',
  padCutoff: [650, 1500],
  kicks: 4,
  kickLevel: 0.5,
  shaker: 0,
  reverb: 0.42,
  echo: 0.3,
  pluckLevel: 0.028,
  drive: { bass8ths: true, snare: 0.2, hats: 0.028 },
};

const BY_THEME: Record<Theme, Track> = {
  screem: NIGHT,
  synthwave: NEON,
  sunset: SUNSET,
  acelera: UPLIFT,
  gelo: ICE,
  classico: RETRO,
};

/** A faixa do tema; no modo claro, um pouco mais rápida, aberta e com menos peso. */
export function trackFor(theme: Theme, mode: 'dark' | 'light' = 'dark'): Track {
  const t = BY_THEME[theme] ?? NIGHT;
  if (mode === 'dark') return t;
  return {
    ...t,
    id: `${t.id}-dia`,
    name: `${t.name} (de dia)`,
    bpm: t.bpm + 6,
    padCutoff: [t.padCutoff[0] * 1.5, t.padCutoff[1] * 1.6],
    kickLevel: t.kickLevel * 0.7,
    reverb: t.reverb * 0.8,
    pluckLevel: t.pluckLevel * 1.15,
  };
}

export const DEFAULT_TRACK = NIGHT;
