import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { MODES, THEMES, applyMode, applyTheme, readMode, readMotion, readTheme, saveMode, saveMotion, saveTheme, themeInfo, } from '../lib/theme';
import { Sheet } from './Sheet';
/**
 * Botão de tema: mostra a amostra do fundo atual e abre uma janela para escolher o fundo, o
 * modo (escuro/claro) e se as animações ficam ligadas. Vale na hora e fica salvo.
 */
export function ThemeToggle({ withLabel = false, variant = 'icon', }) {
    const [open, setOpen] = useState(false);
    const [theme, setTheme] = useState(() => readTheme());
    const [mode, setMode] = useState(() => readMode());
    const [motion, setMotion] = useState(() => readMotion());
    useEffect(() => applyTheme(theme), [theme]);
    useEffect(() => applyMode(mode), [mode]);
    const info = themeInfo(theme);
    const swatch = (t) => t.photo
        ? `url(${t.photo}) center / cover`
        : `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})`;
    return (_jsxs(_Fragment, { children: [variant === 'menu' ? (_jsxs("button", { type: "button", onClick: () => setOpen(true), "aria-haspopup": "dialog", "aria-label": `Tema: ${info.label}. Trocar tema`, className: "hub-link", children: [_jsx("span", { "aria-hidden": "true", className: "h-[18px] w-[18px] flex-none rounded-full", style: { background: swatch(info) } }), _jsx("span", { children: "Tema" })] })) : variant === 'ctl' ? (_jsx("button", { type: "button", onClick: () => setOpen(true), "aria-haspopup": "dialog", "aria-label": `Tema: ${info.label}. Trocar tema`, "data-tip": "Tema", className: "ctl-button", children: _jsx("span", { className: "ctl", children: _jsx("span", { "aria-hidden": "true", className: "h-5 w-5 rounded-full", style: { background: swatch(info) } }) }) })) : (_jsxs("button", { type: "button", onClick: () => setOpen(true), "aria-haspopup": "dialog", "aria-label": `Tema: ${info.label}. Trocar tema`, className: withLabel ? 'btn btn-ghost btn-sm' : 'icon-button', children: [_jsx("span", { "aria-hidden": "true", className: "h-4 w-4 rounded-full", style: { background: swatch(info) } }), withLabel && _jsx("span", { "aria-hidden": "true", children: info.label })] })), open && (_jsxs(Sheet, { title: "Tema", onClose: () => setOpen(false), children: [_jsxs("div", { className: "theme-row", children: [_jsx("p", { className: "theme-row-label", children: "Modo" }), _jsx("div", { role: "radiogroup", "aria-label": "Modo", className: "pref-segment", children: MODES.map((m) => (_jsx("button", { type: "button", role: "radio", "aria-checked": m.value === mode, onClick: () => {
                                        saveMode(m.value);
                                        setMode(m.value);
                                    }, children: m.label }, m.value))) })] }), _jsxs("div", { className: "theme-row theme-row-stack", children: [_jsx("p", { className: "theme-row-label", children: "Cor dos detalhes" }), _jsx("div", { role: "radiogroup", "aria-label": "Cor dos detalhes", className: "theme-dots", children: THEMES.map((t) => {
                                    const on = t.value === theme;
                                    return (_jsxs("button", { type: "button", role: "radio", "aria-checked": on, onClick: () => {
                                            saveTheme(t.value);
                                            setTheme(t.value);
                                        }, className: "theme-dot", children: [_jsx("span", { "aria-hidden": "true", style: { background: swatch(t) } }), t.label] }, t.value));
                                }) })] }), _jsxs("button", { type: "button", role: "switch", "aria-checked": motion === 'on', onClick: () => {
                            const next = motion === 'on' ? 'off' : 'on';
                            saveMotion(next);
                            setMotion(next);
                        }, className: "flex w-full items-center justify-between gap-3 rounded-2xl px-1 text-left", children: [_jsxs("span", { children: [_jsx("span", { className: "block text-sm font-semibold text-zinc-50", children: "Anima\u00E7\u00F5es" }), _jsx("span", { className: "block text-xs text-zinc-500", children: motion === 'on' ? 'Ligadas' : 'Desligadas: tudo fica parado' })] }), _jsx("span", { "aria-hidden": "true", className: "switch", "data-on": motion === 'on' || undefined, children: _jsx("span", { className: "switch-knob" }) })] })] }))] }));
}
