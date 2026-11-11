import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { STAGE_LAYOUTS } from './Stage';
const ICON = {
    auto: 'auto_awesome_mosaic',
    mosaic: 'grid_view',
    focus: 'featured_video',
};
/** Um retângulo do desenho: cinza (câmera) ou com a cor do tema (tela compartilhada). */
const Box = ({ screen = false, className = '' }) => (_jsx("span", { className: `block rounded-[5px] ${screen ? 'bg-brand-400/80' : 'bg-white/25'} ${className}` }));
/** Desenho de cada layout: mostra como a tela fica, sem texto. */
function Preview({ value }) {
    if (value === 'mosaic') {
        return (_jsxs("span", { className: "grid h-full grid-cols-2 grid-rows-2 gap-1", children: [_jsx(Box, {}), _jsx(Box, {}), _jsx(Box, {}), _jsx(Box, {})] }));
    }
    if (value === 'focus') {
        return (_jsxs("span", { className: "grid h-full grid-rows-[1fr_26%] gap-1", children: [_jsx(Box, { screen: true }), _jsxs("span", { className: "grid grid-cols-3 gap-1", children: [_jsx(Box, {}), _jsx(Box, {}), _jsx(Box, {})] })] }));
    }
    // Automático: sem tela compartilhada vira mosaico; com tela, destaque.
    return (_jsxs("span", { className: "grid h-full grid-cols-2 gap-2", children: [_jsxs("span", { className: "grid grid-cols-2 grid-rows-2 gap-1", children: [_jsx(Box, {}), _jsx(Box, {}), _jsx(Box, {}), _jsx(Box, {})] }), _jsxs("span", { className: "grid grid-rows-[1fr_30%] gap-1", children: [_jsx(Box, { screen: true }), _jsxs("span", { className: "grid grid-cols-2 gap-1", children: [_jsx(Box, {}), _jsx(Box, {})] })] })] }));
}
/**
 * Botão de layout do palco: abre uma janela com os três jeitos de organizar a tela, cada um
 * com um desenho e o nome. Escolher aplica na hora e fecha.
 */
export function LayoutPicker({ value, onChange, }) {
    const [open, setOpen] = useState(false);
    const current = STAGE_LAYOUTS.find((l) => l.value === value)?.label ?? value;
    return (_jsxs("div", { children: [_jsx("button", { type: "button", onClick: () => setOpen(true), "aria-haspopup": "dialog", "aria-expanded": open, "aria-label": `Layout: ${current}`, "data-tip": `Layout: ${current}`, className: "ctl-button", children: _jsx("span", { className: "ctl", "data-on": open || undefined, children: _jsx(Icon, { name: ICON[value], size: "1.35rem" }) }) }), open && (_jsx(Sheet, { title: "Layout", onClose: () => setOpen(false), children: _jsx("div", { role: "radiogroup", "aria-label": "Layout", className: "grid grid-cols-3 gap-2", children: STAGE_LAYOUTS.map((l) => {
                        const on = l.value === value;
                        return (_jsxs("button", { type: "button", role: "radio", "aria-checked": on, onClick: () => {
                                onChange(l.value);
                                setOpen(false);
                            }, className: `layout-option ${on ? 'layout-option-on' : ''}`, children: [_jsx("span", { "aria-hidden": "true", className: "layout-preview", children: _jsx(Preview, { value: l.value }) }), _jsx("span", { className: "text-[13px] font-medium", children: l.label })] }, l.value));
                    }) }) }))] }));
}
