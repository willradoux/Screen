import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useId, useState } from 'react';
import { PageTitle } from '../components/ui';
import { playSound, readSounds, saveSounds } from '../lib/sounds';
import { MODES, THEMES, readMode, readMotion, readTheme, saveMode, saveMotion, saveTheme, } from '../lib/theme';
/** Um grupo de ajustes: título em negrito e as linhas embaixo (como as configurações de um app). */
function Group({ title, children }) {
    const id = useId();
    return (_jsxs("section", { "aria-labelledby": id, className: "pref-group", children: [_jsx("h2", { id: id, className: "pref-group-title", children: title }), children] }));
}
/** Uma linha: nome e explicação à esquerda, o controle à direita. */
function Row({ label, hint, control, labelId, }) {
    return (_jsxs("div", { className: "pref-row", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { id: labelId, className: "pref-label", children: label }), hint && _jsx("p", { className: "pref-hint", children: hint })] }), _jsx("div", { className: "pref-control", children: control })] }));
}
function Switch({ on, onChange, labelledBy, }) {
    return (_jsx("button", { type: "button", role: "switch", "aria-checked": on, "aria-labelledby": labelledBy, onClick: onChange, className: "switch", "data-on": on || undefined, children: _jsx("span", { className: "switch-knob" }) }));
}
/** Preferências de quem usa: modo, tema, animações e sons. Ficam salvas neste navegador. */
export function PreferencesPage() {
    const [theme, setTheme] = useState(() => readTheme());
    const [mode, setMode] = useState(() => readMode());
    const [motion, setMotion] = useState(() => readMotion());
    const [sounds, setSounds] = useState(() => readSounds());
    const motionId = useId();
    const soundsId = useId();
    const modeId = useId();
    function choose(next) {
        saveTheme(next);
        setTheme(next);
        setMode(readMode()); // modo e cor são independentes; relê só por garantia
    }
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "Valem s\u00F3 para voc\u00EA, neste navegador.", children: "Prefer\u00EAncias" }), _jsxs("div", { className: "pref-list", children: [_jsxs(Group, { title: "Apar\u00EAncia", children: [_jsx(Row, { label: "Modo", labelId: modeId, hint: "Escuro deixa os pain\u00E9is pretos; claro, brancos.", control: _jsx("div", { role: "radiogroup", "aria-labelledby": modeId, className: "pref-segment", children: MODES.map((o) => (_jsx("button", { type: "button", role: "radio", "aria-checked": mode === o.value, onClick: () => {
                                            saveMode(o.value);
                                            setMode(o.value);
                                        }, children: o.label }, o.value))) }) }), _jsx("div", { className: "pref-row pt-3", children: _jsxs("div", { children: [_jsx("p", { className: "pref-label", children: "Cor dos detalhes" }), _jsx("p", { className: "pref-hint", children: "Vale no escuro e no claro: bot\u00E3o de entrar, chaves, item ativo e capas." })] }) }), _jsx("div", { role: "radiogroup", "aria-label": "Cor dos detalhes", className: "pref-themes", children: THEMES.map((o) => {
                                    const on = theme === o.value;
                                    return (_jsxs("button", { type: "button", role: "radio", "aria-checked": on, onClick: () => choose(o.value), className: "pref-theme", children: [_jsx("span", { "aria-hidden": "true", className: "pref-theme-swatch", style: {
                                                    backgroundImage: `linear-gradient(135deg, ${o.swatch[0]}, ${o.swatch[1]})`,
                                                } }), _jsx("span", { className: "pref-theme-name", children: o.label }), _jsx("span", { className: "pref-theme-text", children: o.text })] }, o.value));
                                }) })] }), _jsx(Group, { title: "Movimento", children: _jsx(Row, { label: "Anima\u00E7\u00F5es", labelId: motionId, hint: "Desligue se o movimento incomodar ou se o aparelho for mais lento. A abertura, as transi\u00E7\u00F5es e o fundo ficam parados.", control: _jsx(Switch, { on: motion === 'on', labelledBy: motionId, onChange: () => {
                                    const next = motion === 'on' ? 'off' : 'on';
                                    saveMotion(next);
                                    setMotion(next);
                                } }) }) }), _jsx(Group, { title: "Sons", children: _jsx(Row, { label: "Sons da sala", labelId: soundsId, hint: "Um toque curto quando algu\u00E9m entra ou sai da sala e quando chega um aviso.", control: _jsx(Switch, { on: sounds, labelledBy: soundsId, onChange: () => {
                                    saveSounds(!sounds);
                                    setSounds(!sounds);
                                    if (!sounds)
                                        playSound('notify');
                                } }) }) }), _jsx(Group, { title: "Conta", children: _jsx(Row, { label: "Login pelo Discord", hint: "O Screen n\u00E3o guarda senha: quem voc\u00EA \u00E9 e seus cargos v\u00EAm do Discord.", control: _jsx("span", { className: "pref-value", children: "Conectado" }) }) })] })] }));
}
