import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createGradientRenderer, hexToRgb } from '../lib/gradient';
import { prefersReducedMotion } from '../lib/motion';
import { readTheme, themeInfo } from '../lib/theme';
/** O degradê é liso: desenhar em ~40% da resolução é invisível e custa 6x menos. */
const RENDER_SCALE = 0.4;
/** 30 quadros por segundo bastam para uma deriva lenta. */
const FRAME_MS = 1000 / 30;
function readPalette() {
    const css = getComputedStyle(document.documentElement);
    return ['--bg-1', '--bg-2', '--bg-3'].map((name) => hexToRgb(css.getPropertyValue(name).trim() || '#000000'));
}
/** Fundo atual, acompanhando `data-theme` (o seletor de tema muda o atributo). */
function useCurrentTheme() {
    const [theme, setTheme] = useState(() => readTheme());
    useEffect(() => {
        const html = document.documentElement;
        const sync = () => setTheme(html.dataset.theme ?? readTheme());
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);
    return theme;
}
/** Degradê WebGL que deriva devagar (o do AWS Hub). Sem WebGL, fica o degradê em CSS. */
function GradientCanvas() {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const gl = createGradientRenderer(canvas);
        if (!gl)
            return;
        const still = prefersReducedMotion();
        let raf = 0;
        let last = 0;
        // Começa num ponto qualquer da deriva, para cada visita ter um desenho diferente.
        const t0 = performance.now() - Math.random() * 60_000;
        const size = () => gl.resize(Math.max(1, Math.round(window.innerWidth * RENDER_SCALE)), Math.max(1, Math.round(window.innerHeight * RENDER_SCALE)));
        const paint = (now) => {
            gl.draw((now - t0) / 1000);
            canvas.dataset.ready = 'true';
        };
        const loop = (now) => {
            raf = requestAnimationFrame(loop);
            if (now - last < FRAME_MS)
                return;
            last = now;
            paint(now);
        };
        const start = () => {
            cancelAnimationFrame(raf);
            if (still)
                paint(performance.now());
            else
                raf = requestAnimationFrame(loop);
        };
        size();
        gl.setColors(readPalette());
        start();
        const onResize = () => {
            size();
            if (still)
                paint(performance.now());
        };
        const onVisibility = () => {
            if (document.hidden)
                cancelAnimationFrame(raf);
            else
                start();
        };
        // Trocou de degradê: lê as cores novas do CSS.
        const observer = new MutationObserver(() => {
            gl.setColors(readPalette());
            if (still)
                paint(performance.now());
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            window.removeEventListener('resize', onResize);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);
    return _jsx("canvas", { ref: canvasRef, className: "backdrop-canvas" });
}
/**
 * Fundo da página, conforme o tema: degradê animado (com granulado) ou foto. Puramente
 * decorativo.
 */
export function Backdrop() {
    const theme = useCurrentTheme();
    const photo = themeInfo(theme).photo;
    return (_jsxs("div", { "aria-hidden": "true", className: "backdrop", children: [photo ? (_jsx("img", { src: photo, alt: "", decoding: "async", className: "backdrop-photo" }, photo)) : (_jsx(GradientCanvas, {})), _jsx("div", { className: "grain" })] }));
}
