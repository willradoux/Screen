/*
 * Movimento do Screem. A mesma mola do laboratório de animação (animation-app-teste,
 * lib/doux/motion.ts): resolvida pela fórmula exata, então o resultado não depende de fps e
 * não acumula erro. Sem biblioteca: rAF + uma função.
 */
/** Estado devolvido pela mola (reutilizado para não alocar por quadro). */
const out = { x: 0, v: 0 };
/** Mola exata: dado o estado agora, devolve o estado depois de `dt` segundos. */
export function spring(x0, v0, target, w, z, dt) {
    const x = x0 - target;
    const e = Math.exp(-z * w * dt);
    if (z >= 1) {
        const b = v0 + w * x;
        out.x = target + (x + b * dt) * e;
        out.v = (b - w * (x + b * dt)) * e;
        return out;
    }
    const wd = w * Math.sqrt(1 - z * z);
    const b = (v0 + z * w * x) / wd;
    const c = Math.cos(wd * dt);
    const s = Math.sin(wd * dt);
    const q = x * c + b * s;
    out.x = target + e * q;
    out.v = e * (-z * w * q + wd * (b * c - x * s));
    return out;
}
/** Sem animação: o sistema pede menos movimento ou a pessoa desligou em Preferências. */
export function prefersReducedMotion() {
    if (typeof window === 'undefined')
        return false;
    if (document.documentElement.dataset.motion === 'off')
        return true;
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
/**
 * Anima um número com a mola até parar. `freq` em rad/s (quanto maior, mais rápido) e
 * `damp` (1 = sem repique; 0,6 = um repique leve). Devolve a função que cancela.
 */
export function animateSpring({ from, to, freq = 14, damp = 0.8, delay = 0, onUpdate, onDone, }) {
    let x = from;
    let v = 0;
    let last = 0;
    let waited = 0;
    let raf = 0;
    const frame = (now) => {
        // Limite de dt: voltar de uma aba escondida não "pula" a animação inteira de uma vez.
        const dt = last ? Math.min(0.064, (now - last) / 1000) : 0;
        last = now;
        if (waited < delay) {
            waited += dt;
            raf = requestAnimationFrame(frame);
            return;
        }
        const r = spring(x, v, to, freq, damp, dt);
        x = r.x;
        v = r.v;
        const settled = Math.abs(x - to) < 0.0005 && Math.abs(v) < 0.001;
        onUpdate(settled ? to : x);
        if (settled)
            onDone?.();
        else
            raf = requestAnimationFrame(frame);
    };
    onUpdate(from);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
}
