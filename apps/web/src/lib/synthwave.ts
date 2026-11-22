/*
 * Trilha e efeitos da página de apresentação, gerados na hora com Web Audio (nada de arquivo de
 * música). Uma faixa ambiente original e calma, no clima synthwave: 76 BPM em lá menor
 * (Am7, Fmaj7, Cmaj7, G), com pad longo, baixo macio, um dedilhado espaçado com eco e um bumbo
 * abafado. Os botões tocam notas da mesma escala, no tempo da música.
 *
 * O núcleo (`createVoices` + `playStep`) recebe qualquer BaseAudioContext, então dá para renderizar
 * offline (OfflineAudioContext) e medir. `Synthwave` cuida do relógio, do liga/desliga e dos efeitos.
 */

export const BPM = 76;
/** Duração de uma semicolcheia (1/16), em segundos. */
export const STEP = 60 / BPM / 4;
export const STEPS_PER_BAR = 16;
const LOOP_BARS = 8;

/** Lá menor, com sétimas (soa mais "ambiente"): Am7, Fmaj7, Cmaj7, G6. Notas em MIDI. */
const PROGRESSION = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62, 64], // G6
] as const;

/** Pentatônica de lá menor (as notas dos botões; qualquer uma soa bem com a trilha). */
export const PENTATONIC = [69, 72, 74, 76, 79, 81, 84] as const;

/** Dedilhado: em que semicolcheias do compasso toca e qual nota do acorde (índice). */
const PLUCKS: [number, number][] = [
  [0, 0],
  [3, 2],
  [6, 3],
  [10, 1],
  [12, 2],
];

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function chordFor(bar: number): readonly number[] {
  return PROGRESSION[((bar % 4) + 4) % 4]!;
}

/** Piso para rampas exponenciais (não aceitam zero). */
const FLOOR = 0.0001;

function noiseBuffer(ctx: BaseAudioContext, seconds = 1): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Reverb: resposta ao impulso de ruído que decai (estéreo). */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

/** Envelope sem estalo: sobe linear do zero, desce exponencial até quase zero. */
function envelope(
  g: AudioParam,
  t: number,
  peak: number,
  attack: number,
  decay: number,
  hold = 0,
): number {
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.setValueAtTime(peak, t + attack + hold);
  const end = t + attack + hold + decay;
  g.exponentialRampToValueAtTime(FLOOR, end);
  g.linearRampToValueAtTime(0, end + 0.01);
  return end + 0.02;
}

export interface Voices {
  ctx: BaseAudioContext;
  /** Entrada da música (antes do compressor). */
  bus: GainNode;
  reverb: GainNode;
  echo: GainNode;
  noise: AudioBuffer;
  /** Quando o bumbo tocou (para a tela pulsar junto). */
  kicks: number[];
}

/** Monta os efeitos (reverb longo, eco) e liga tudo em `destination`. */
export function createVoices(ctx: BaseAudioContext, destination: AudioNode): Voices {
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(destination);

  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, 3.6, 2.2);
  const reverb = ctx.createGain();
  reverb.gain.value = 0.45;
  reverb.connect(conv).connect(bus);

  // Eco de 3/16 com o retorno abafado (soa como fita).
  const delay = ctx.createDelay(2);
  delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.42;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2000;
  const echo = ctx.createGain();
  echo.gain.value = 0.35;
  echo.connect(delay);
  delay.connect(tone).connect(fb).connect(delay);
  tone.connect(bus);

  return { ctx, bus, reverb, echo, noise: noiseBuffer(ctx), kicks: [] };
}

function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  freq: number,
  t: number,
  stop: number,
  out: AudioNode,
  detune = 0,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.connect(out);
  o.start(t);
  o.stop(stop);
  o.onended = () => o.disconnect();
  return o;
}

/** Bumbo macio e abafado (sem estalo de ataque). */
function kick(v: Voices, t: number, level: number) {
  const lp = v.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 180;
  const g = v.ctx.createGain();
  lp.connect(g).connect(v.bus);
  const end = envelope(g.gain, t, level, 0.008, 0.4);
  const o = osc(v.ctx, 'sine', 110, t, end, lp);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  v.kicks.push(t);
  if (v.kicks.length > 16) v.kicks.shift();
}

/** Chiado de fita bem baixinho no contratempo (dá movimento sem bateria). */
function shaker(v: Voices, t: number, level: number) {
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  const bp = v.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 6000;
  bp.Q.value = 0.8;
  const g = v.ctx.createGain();
  const end = envelope(g.gain, t, level, 0.02, 0.08);
  src.connect(bp).connect(g);
  g.connect(v.bus);
  g.connect(v.reverb);
  src.start(t, Math.random() * 0.5);
  src.stop(end);
  src.onended = () => src.disconnect();
}

/** Baixo longo e redondo (uma nota por meio compasso). */
function bass(v: Voices, t: number, midi: number, seconds: number) {
  const lp = v.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = v.ctx.createGain();
  const end = envelope(g.gain, t, 0.22, 0.06, 0.5, seconds - 0.4);
  lp.connect(g).connect(v.bus);
  osc(v.ctx, 'triangle', midiToHz(midi), t, end, lp);
  osc(v.ctx, 'sawtooth', midiToHz(midi), t, end, lp, 6);
}

/** Dedilhado: nota curta e macia, com eco e reverb. */
function pluck(
  ctx: BaseAudioContext,
  out: AudioNode,
  sends: AudioNode[],
  t: number,
  midi: number,
  level: number,
) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.3);
  const g = ctx.createGain();
  const end = envelope(g.gain, t, level, 0.004, 0.55);
  lp.connect(g);
  g.connect(out);
  for (const s of sends) g.connect(s);
  osc(ctx, 'triangle', midiToHz(midi), t, end, lp);
  osc(ctx, 'sine', midiToHz(midi + 12), t, end, lp, 3);
}

/** Pad: o acorde inteiro, longo, abrindo devagar. */
function pad(v: Voices, t: number, chord: readonly number[], seconds: number) {
  const lp = v.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.linearRampToValueAtTime(1100, t + seconds * 0.6);
  lp.frequency.linearRampToValueAtTime(600, t + seconds);
  const g = v.ctx.createGain();
  const end = envelope(g.gain, t, 0.035, 1.1, 1.4, seconds - 1.1);
  lp.connect(g);
  g.connect(v.bus);
  g.connect(v.reverb);
  for (const m of chord) {
    osc(v.ctx, 'sawtooth', midiToHz(m - 12), t, end, lp, -7);
    osc(v.ctx, 'sawtooth', midiToHz(m - 12), t, end, lp, 7);
  }
}

/** Toca a semicolcheia `step` da faixa no tempo `t`. */
export function playStep(v: Voices, step: number, t: number) {
  const bar = Math.floor(step / STEPS_PER_BAR) % LOOP_BARS;
  const i = step % STEPS_PER_BAR;
  const chord = chordFor(bar);
  const bar16 = STEP * STEPS_PER_BAR;

  // A trilha "entra" aos poucos: só pad e baixo nos 2 primeiros compassos de cada volta.
  const full = bar >= 2;
  if (i === 0) pad(v, t, chord, bar16 + 0.6);
  if (i === 0 || i === 8) bass(v, t, chord[0]! - 24, bar16 / 2);
  if (full && (i === 0 || i === 8)) kick(v, t, i === 0 ? 0.55 : 0.35);
  if (full && i % 4 === 2) shaker(v, t, 0.025);
  for (const [at, idx] of PLUCKS) {
    if (at === i) pluck(v.ctx, v.bus, [v.echo, v.reverb], t, chord[idx]! + 12, full ? 0.05 : 0.035);
  }
}

export type Sfx = 'channel' | 'power' | 'click' | 'hover';

/** Efeitos da TV e dos botões. `note`: índice na pentatônica (botões). */
export function playSfx(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  kind: Sfx,
  t = ctx.currentTime,
  note = 0,
  sends: AudioNode[] = [],
) {
  if (kind === 'hover' || kind === 'click') {
    const midi = PENTATONIC[((note % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length]!;
    pluck(ctx, out, sends, t, kind === 'click' ? midi - 12 : midi, kind === 'click' ? 0.16 : 0.07);
    return;
  }
  const g = ctx.createGain();
  g.connect(out);
  if (kind === 'channel') {
    // Chuvisco curto e abafado + "tum" do botão.
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1;
    const end = envelope(g.gain, t, 0.1, 0.01, 0.3, 0.06);
    src.connect(bp).connect(g);
    src.start(t, Math.random() * 0.4);
    src.stop(end);
    src.onended = () => src.disconnect();
    const thump = ctx.createGain();
    thump.connect(out);
    const tEnd = envelope(thump.gain, t, 0.25, 0.004, 0.12);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    o.connect(thump);
    o.start(t);
    o.stop(tEnd);
    o.onended = () => o.disconnect();
    return;
  }
  // Ligar a TV: "tum" grave e um acorde que abre.
  const end = envelope(g.gain, t, 0.12, 0.05, 1.4, 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(2400, t + 0.8);
  lp.connect(g);
  for (const m of [57, 64, 69, 72]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midiToHz(m);
    o.connect(lp);
    o.start(t);
    o.stop(end);
    o.onended = () => o.disconnect();
  }
  const thump = ctx.createGain();
  thump.connect(out);
  const tEnd = envelope(thump.gain, t, 0.4, 0.005, 0.3);
  const k = ctx.createOscillator();
  k.type = 'sine';
  k.frequency.setValueAtTime(90, t);
  k.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  k.connect(thump);
  k.start(t);
  k.stop(tEnd);
  k.onended = () => k.disconnect();
}

/** A trilha tocando de verdade: relógio com folga (lookahead), liga/desliga suave e efeitos. */
export class Synthwave {
  readonly ctx: AudioContext;
  private master: GainNode;
  private music: GainNode;
  private sfx: GainNode;
  private voices: Voices;
  private step = 0;
  private next = 0;
  private timer = 0;
  private lastHover = 0;
  playing = false;

  constructor() {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    comp.connect(this.master).connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(comp);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 1.6;
    this.sfx.connect(comp);
    this.voices = createVoices(this.ctx, this.music);
  }

  async start() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.playing) return;
    this.playing = true;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(0.9, t + 3);
    this.next = t + 0.08;
    this.step = 0;
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(0, t + 0.8);
    window.setTimeout(() => {
      if (!this.playing) window.clearInterval(this.timer);
    }, 900);
  }

  private tick() {
    // Agenda o que cai nos próximos 150 ms (o relógio do áudio é que manda, não o setInterval).
    while (this.next < this.ctx.currentTime + 0.15) {
      playStep(this.voices, this.step, this.next);
      this.next += STEP;
      this.step = (this.step + 1) % (STEPS_PER_BAR * LOOP_BARS);
    }
  }

  /**
   * Efeito de botão ou da TV. Com a música tocando, as notas dos botões caem na próxima
   * semicolcheia (ficam no tempo); sem música, tocam na hora.
   */
  sound(kind: Sfx, note = 0) {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (kind === 'hover') {
      if (now - this.lastHover < 0.09) return; // passar o mouse rápido não vira metralhadora
      this.lastHover = now;
    }
    let t = now;
    if (this.playing && (kind === 'hover' || kind === 'click')) {
      const ahead = this.next - now; // a próxima semicolcheia já agendada
      t = ahead > 0 && ahead < STEP ? this.next : now;
    }
    playSfx(this.ctx, this.sfx, this.voices.noise, kind, t, note, [this.voices.echo]);
  }

  /** 0 a 1: quão perto do último bumbo estamos (a tela pulsa com isso). */
  beat(): number {
    if (!this.playing) return 0;
    const now = this.ctx.currentTime;
    let last = -1;
    for (const k of this.voices.kicks) if (k <= now) last = k;
    return last < 0 ? 0 : Math.exp(-(now - last) * 4);
  }

  suspend() {
    void this.ctx.suspend();
  }

  resume() {
    void this.ctx.resume();
  }

  close() {
    window.clearInterval(this.timer);
    void this.ctx.close();
  }
}
