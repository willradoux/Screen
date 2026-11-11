const KEY = 'screem-sounds';
export function readSounds() {
    try {
        return localStorage.getItem(KEY) !== 'off';
    }
    catch {
        return true;
    }
}
export function saveSounds(on) {
    try {
        localStorage.setItem(KEY, on ? 'on' : 'off');
    }
    catch {
        // Sem armazenamento: vale só nesta visita.
    }
}
/** Notas de cada som: frequência (Hz), início e duração (s). */
const NOTES = {
    join: [
        { f: 660, at: 0, dur: 0.12 },
        { f: 990, at: 0.09, dur: 0.18 },
    ],
    leave: [
        { f: 880, at: 0, dur: 0.12 },
        { f: 587, at: 0.09, dur: 0.2 },
    ],
    notify: [{ f: 1046, at: 0, dur: 0.16 }],
    error: [
        { f: 330, at: 0, dur: 0.12 },
        { f: 262, at: 0.12, dur: 0.18 },
    ],
};
let ctx = null;
let lastAt = 0;
/** Toca um som (se ligados). Nunca lança erro: sem áudio, apenas não toca. */
export function playSound(name) {
    if (!readSounds())
        return;
    if (typeof window === 'undefined' || !('AudioContext' in window))
        return;
    // Vários eventos juntos (várias pessoas entrando): um som só.
    const now = performance.now();
    if (now - lastAt < 250)
        return;
    lastAt = now;
    try {
        ctx ??= new AudioContext();
        if (ctx.state === 'suspended')
            void ctx.resume();
        const t0 = ctx.currentTime + 0.01;
        for (const n of NOTES[name]) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = n.f;
            gain.gain.setValueAtTime(0, t0 + n.at);
            gain.gain.linearRampToValueAtTime(0.08, t0 + n.at + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0 + n.at);
            osc.stop(t0 + n.at + n.dur + 0.02);
        }
    }
    catch {
        // Navegador sem áudio ou bloqueado: segue sem som.
    }
}
