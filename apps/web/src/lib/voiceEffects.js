export const VOICE_PRESETS = [
    { value: 'none', label: 'Normal', hint: 'Sua voz como ela é.' },
    { value: 'robot', label: 'Robô', hint: 'Voz metálica de robô.' },
    { value: 'echo', label: 'Eco', hint: 'Sua voz repete de leve, como num salão.' },
    { value: 'radio', label: 'Rádio', hint: 'Soa como num rádio antigo.' },
];
/** Curva de distorção suave, usada no efeito de rádio. */
function distortionCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
}
/**
 * Monta o efeito como um processador de faixa do LiveKit: recebe o microfone, passa por nós do
 * Web Audio e devolve a faixa já modificada, que é a que vai para a sala.
 */
export function createVoiceProcessor(preset) {
    let nodes = [];
    let osc = null;
    let processed;
    function build(opts) {
        const ctx = opts.audioContext;
        const source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
        const dest = ctx.createMediaStreamDestination();
        nodes = [source, dest];
        if (preset === 'robot') {
            // Modulação em anel: multiplica a voz por uma onda de 50 Hz.
            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc = ctx.createOscillator();
            osc.frequency.value = 50;
            osc.type = 'sine';
            osc.connect(gain.gain);
            osc.start();
            source.connect(gain);
            gain.connect(dest);
            nodes.push(gain, osc);
        }
        else if (preset === 'echo') {
            const dry = ctx.createGain();
            const delay = ctx.createDelay(1);
            const feedback = ctx.createGain();
            delay.delayTime.value = 0.28;
            feedback.gain.value = 0.35;
            source.connect(dry);
            dry.connect(dest);
            source.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            delay.connect(dest);
            nodes.push(dry, delay, feedback);
        }
        else {
            const band = ctx.createBiquadFilter();
            band.type = 'bandpass';
            band.frequency.value = 1400;
            band.Q.value = 0.8;
            const shaper = ctx.createWaveShaper();
            shaper.curve = distortionCurve(20);
            source.connect(band);
            band.connect(shaper);
            shaper.connect(dest);
            nodes.push(band, shaper);
        }
        processed = dest.stream.getAudioTracks()[0];
    }
    async function teardown() {
        try {
            osc?.stop();
        }
        catch {
            // Já parado.
        }
        osc = null;
        for (const n of nodes) {
            try {
                n.disconnect();
            }
            catch {
                // Já desconectado.
            }
        }
        nodes = [];
    }
    return {
        name: `screem-voice-${preset}`,
        async init(opts) {
            build(opts);
        },
        async restart(opts) {
            await teardown();
            build(opts);
        },
        async destroy() {
            await teardown();
            processed = undefined;
        },
        get processedTrack() {
            return processed;
        },
    };
}
