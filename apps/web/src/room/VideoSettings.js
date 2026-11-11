import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { setVideoPrefs, useVideoPrefs } from '../lib/videoPrefs';
/** Um grupo de escolhas: cada opção é um desenho de como o vídeo fica + o nome. */
function Choice({ legend, value, options, onChange, columns, }) {
    const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns];
    return (_jsxs("fieldset", { className: "space-y-2", children: [_jsx("legend", { className: "px-1 text-xs font-semibold text-zinc-400", children: legend }), _jsx("div", { className: `grid gap-2 ${cols}`, children: options.map((o) => {
                    const on = value === o.value;
                    return (_jsxs("button", { type: "button", "aria-pressed": on, onClick: () => onChange(o.value), className: `layout-option ${on ? 'layout-option-on' : ''}`, children: [_jsx("span", { "aria-hidden": "true", className: "video-preview", children: o.preview }), _jsx("span", { className: "text-[12px] font-semibold leading-tight", children: o.label })] }, o.value));
                }) })] }));
}
/* ---- Desenhos (só formas; a "pessoa" é um círculo e um ombro) ---- */
const Person = ({ className = '' }) => (_jsxs("span", { className: `video-person ${className}`, children: [_jsx("span", { className: "video-person-head" }), _jsx("span", { className: "video-person-body" })] }));
/** Preencher: a imagem ocupa o quadro todo (pode cortar as bordas). */
const FitCover = () => (_jsxs("span", { className: "video-frame", children: [_jsx("span", { className: "video-image inset-0" }), _jsx(Person, {})] }));
/** Mostrar tudo: a imagem inteira aparece, com faixas onde sobra. */
const FitContain = () => (_jsxs("span", { className: "video-frame", children: [_jsx("span", { className: "video-image inset-x-[22%] inset-y-0" }), _jsx(Person, { className: "scale-75" })] }));
const Position = ({ at }) => (_jsxs("span", { className: "video-frame", children: [_jsx("span", { className: "video-image inset-0" }), _jsx(Person, { className: at === 'top' ? '-translate-y-[22%]' : at === 'bottom' ? 'translate-y-[22%]' : '' })] }));
const Shape = ({ ratio }) => {
    if (ratio === 'auto') {
        return (_jsx("span", { className: "flex h-full items-center justify-center text-brand-300", children: _jsx(Icon, { name: "auto_awesome_mosaic", size: "1.4rem" }) }));
    }
    const size = {
        landscape: 'h-[58%] w-[86%]',
        portrait: 'h-[86%] w-[40%]',
        square: 'h-[72%] aspect-square',
    }[ratio];
    return (_jsx("span", { className: "flex h-full items-center justify-center", children: _jsx("span", { className: `video-shape ${size}` }) }));
};
/** Ajustes de como os vídeos aparecem NA SUA TELA (preencher, posição e formato do quadro). */
export function VideoSettings() {
    const [open, setOpen] = useState(false);
    const prefs = useVideoPrefs();
    const set = (key) => (value) => setVideoPrefs({ [key]: value });
    return (_jsxs("div", { children: [_jsx("button", { type: "button", onClick: () => setOpen((v) => !v), "aria-expanded": open, "aria-label": "Ajustes do v\u00EDdeo", "data-tip": "V\u00EDdeo", className: "ctl-button", children: _jsx("span", { className: "ctl", "data-on": open || undefined, children: _jsx(Icon, { name: "settings", size: "1.35rem" }) }) }), open && (_jsxs(Sheet, { title: "Como ver o v\u00EDdeo", onClose: () => setOpen(false), children: [_jsxs("p", { className: "px-1 text-xs text-zinc-500", children: [_jsx("strong", { className: "text-zinc-300", children: "Vale s\u00F3 para a sua tela." }), " N\u00E3o muda o que os outros veem."] }), _jsx(Choice, { legend: "Enquadramento", columns: 2, value: prefs.fit, onChange: set('fit'), options: [
                            { value: 'cover', label: 'Preencher', preview: _jsx(FitCover, {}) },
                            { value: 'contain', label: 'Mostrar tudo', preview: _jsx(FitContain, {}) },
                        ] }), _jsx(Choice, { legend: "Parte da imagem (quando preenche)", columns: 3, value: prefs.position, onChange: set('position'), options: [
                            { value: 'top', label: 'Cima', preview: _jsx(Position, { at: "top" }) },
                            { value: 'center', label: 'Centro', preview: _jsx(Position, { at: "center" }) },
                            { value: 'bottom', label: 'Baixo', preview: _jsx(Position, { at: "bottom" }) },
                        ] }), _jsx(Choice, { legend: "Formato do quadro", columns: 4, value: prefs.shape, onChange: set('shape'), options: [
                            { value: 'auto', label: 'Automático', preview: _jsx(Shape, { ratio: "auto" }) },
                            { value: 'landscape', label: 'Horizontal', preview: _jsx(Shape, { ratio: "landscape" }) },
                            { value: 'portrait', label: 'Vertical', preview: _jsx(Shape, { ratio: "portrait" }) },
                            { value: 'square', label: 'Quadrado', preview: _jsx(Shape, { ratio: "square" }) },
                        ] }), _jsxs("p", { className: "px-1 text-xs leading-relaxed text-zinc-500", children: [_jsx("strong", { className: "text-zinc-300", children: "Autom\u00E1tico" }), " segue a transmiss\u00E3o: quem transmite na vertical aparece na vertical; se deitar o celular, o quadro deita junto."] })] }))] }));
}
