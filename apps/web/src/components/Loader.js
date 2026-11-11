import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Creature } from './Creature';
/**
 * Carregando: o bichinho (o logo do Screen, vivo) na cor do tema e o que está acontecendo, em
 * texto curto. Aparece com um pequeno atraso (CSS), para um carregamento rápido não piscar.
 * `label` também vai para leitores de tela; `children` é uma explicação opcional embaixo.
 */
export function Loader({ label = 'Carregando', children, }) {
    return (_jsxs("div", { role: "status", "aria-label": label, className: "loader flex min-h-[40dvh] flex-col items-center justify-center gap-4 text-center", children: [_jsx(Creature, { className: "loader-pet h-14" }), _jsxs("div", { className: "space-y-1", children: [_jsx("p", { "aria-hidden": "true", className: "ink text-[15px] font-bold", children: label.endsWith('…') ? label : `${label}…` }), children && _jsx("div", { className: "ink-soft max-w-sm text-[13px]", children: children })] })] }));
}
