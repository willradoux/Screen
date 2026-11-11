import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from 'react';
/*
 * Logo do Screen em SVG (o formato da arte original): retângulo de cantos bem redondos com o
 * "|<" vazado. Preto por padrão (usa `currentColor`); o "|<" é um recorte, então mostra o que
 * estiver atrás (o fundo do tema). Medidas em unidades da arte: 302 × 238, cantos de raio 62,
 * traços de 32.
 *
 * As peças têm classes para animar por CSS: `logo-glyph` (o "|<", que olha para os lados) e
 * `logo-eye` (a barra, que pisca).
 */
export const LOGO_W = 302;
export const LOGO_H = 238;
export function ScreenLogo({ className = 'h-10 w-auto', title, }) {
    const id = useId().replace(/:/g, '');
    const mask = `screen-glyph-${id}`;
    const a11y = title
        ? { role: 'img', 'aria-label': title }
        : { 'aria-hidden': true };
    return (_jsxs("svg", { viewBox: `0 0 ${LOGO_W} ${LOGO_H}`, className: `screen-logo ${className}`, ...a11y, children: [_jsx("defs", { children: _jsxs("mask", { id: mask, maskUnits: "userSpaceOnUse", x: "0", y: "0", width: LOGO_W, height: LOGO_H, children: [_jsx("rect", { width: LOGO_W, height: LOGO_H, rx: "62", fill: "#fff" }), _jsxs("g", { className: "logo-glyph", children: [_jsx("rect", { className: "logo-eye", x: "84", y: "74", width: "32", height: "90", rx: "16", fill: "#000" }), _jsx("path", { className: "logo-chev", d: "M208 97 175 123 208 149", fill: "none", stroke: "#000", strokeWidth: "32", strokeLinecap: "round", strokeLinejoin: "round" })] })] }) }), _jsx("rect", { width: LOGO_W, height: LOGO_H, rx: "62", fill: "currentColor", mask: `url(#${mask})` })] }));
}
