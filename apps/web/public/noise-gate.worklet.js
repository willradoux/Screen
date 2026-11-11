/*
 * Filtro de barulho (noise gate) do microfone, rodando na thread de áudio do navegador.
 * Mede o volume em blocos de 128 amostras; abaixo do limite (barulho de fundo), fecha o som
 * suavemente; voz acima do limite abre na hora. Segura aberto um pouco depois da última
 * palavra, para não cortar o fim das frases.
 */
class NoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: 0.01, minValue: 0, maxValue: 1 }];
  }

  constructor() {
    super();
    this.env = 0; // volume medido, suavizado
    this.gain = 1; // ganho aplicado agora (0 = fechado)
    this.hold = 0; // amostras que ainda ficam abertas depois da voz
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const threshold = parameters.threshold[0];
    const block = input[0].length;

    let sum = 0;
    for (const channel of input) for (let i = 0; i < block; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / (block * input.length));
    this.env = Math.max(rms, this.env * 0.95);

    const holdSamples = sampleRate * 0.25;
    if (this.env > threshold) this.hold = holdSamples;
    else this.hold = Math.max(0, this.hold - block);
    const target = this.hold > 0 ? 1 : 0;
    // Abre rápido (não corta o começo da palavra) e fecha devagar (sem "clique").
    const speed = target > this.gain ? 0.5 : 0.04;

    for (let c = 0; c < output.length; c++) {
      const src = input[c] ?? input[0];
      const dst = output[c];
      let g = this.gain;
      for (let i = 0; i < block; i++) {
        g += (target - g) * (speed / 32);
        dst[i] = src[i] * g;
      }
      if (c === output.length - 1) this.gain = g;
    }
    return true;
  }
}

registerProcessor('screen-noise-gate', NoiseGate);
