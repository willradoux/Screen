import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Creature } from './Creature';
import { Icon } from './Icon';
import { Spinner } from './ui';
/**
 * Tela de estado (erro, espera, bloqueio, sala encerrada…): uma peça centralizada com ícone
 * grande na cor do caso, título em negrito, o que aconteceu, o que fazer e os botões.
 * `waiting` mostra um "verificando…" quando a tela resolve sozinha (fora da call, lotada).
 */
export function StatusCard({ icon, tone = 'neutral', title, children, waiting, actions, headingLevel = 2, }) {
    const Heading = headingLevel === 1 ? 'h1' : 'h2';
    return (_jsxs("section", { role: tone === 'error' ? 'alert' : undefined, className: "status-card surface rise", children: [tone === 'wait' ? (_jsx("span", { className: "mb-1 text-zinc-100", "aria-hidden": "true", children: _jsx(Creature, { className: "h-12" }) })) : (_jsx("span", { className: "status-icon", "data-tone": tone, "aria-hidden": "true", children: _jsx(Icon, { name: icon, size: "1.6rem" }) })), _jsx(Heading, { className: "text-xl font-bold leading-tight text-zinc-50", children: title }), children && (_jsx("div", { className: "space-y-1 text-[14px] leading-relaxed text-zinc-400", children: children })), waiting && (_jsx("div", { className: "status-waiting", children: _jsx(Spinner, { size: "sm", label: waiting }) })), actions && (_jsx("div", { className: "flex flex-wrap items-center justify-center gap-2 pt-1", children: actions }))] }));
}
