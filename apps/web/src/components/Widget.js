import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Icon } from './Icon';
import { Avatar } from './ui';
/**
 * Capa do widget: o degradê do tema com granulado, selos em cima e, se houver, as pessoas
 * sobrepondo a borda de baixo (como um cartão de perfil).
 * `tone`: `live` (no ar), `idle` (em espera, mais apagada) ou `off` (encerrada, sem cor).
 */
export function WidgetCover({ tone = 'live', left, right, people, }) {
    return (_jsxs("div", { className: "widget-cover", "data-tone": tone, children: [_jsxs("div", { className: "widget-chips", children: [_jsx("span", { className: "flex min-w-0 flex-wrap items-center gap-1.5", children: left }), _jsx("span", { className: "flex items-center gap-1.5", children: right })] }), people && people.length > 0 && _jsx(AvatarStack, { people: people })] }));
}
/** Avatares empilhados; passa de `max`, mostra "+N". */
export function AvatarStack({ people, max = 5 }) {
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;
    return (_jsxs("ul", { className: "avatar-stack", "aria-label": `${people.length} na call`, children: [shown.map((p) => (_jsx("li", { title: p.displayName ?? p.userId, children: _jsx(Avatar, { name: p.displayName ?? '?', url: p.avatarUrl, size: "md" }) }, p.userId))), rest > 0 && (_jsx("li", { children: _jsxs("span", { className: "avatar-more", children: ["+", rest] }) }))] }));
}
/** Selo escuro em cima da capa (tipo da sala, por exemplo). */
export function CoverChip({ icon, children }) {
    return (_jsxs("span", { className: "cover-chip", children: [icon && _jsx(Icon, { name: icon, size: "0.9rem" }), children] }));
}
/** Um número do widget: ícone na cor do tema, valor em negrito e o rótulo embaixo. */
export function WidgetStat({ icon, value, label, }) {
    return (_jsxs("div", { className: "flex min-w-0 flex-col items-center gap-1 text-center", children: [_jsx(Icon, { name: icon, size: "1.1rem", className: "shrink-0 text-brand-300" }), _jsxs("div", { className: "min-w-0 leading-tight", children: [_jsx("p", { className: "tabular truncate text-[13px] font-bold text-zinc-50", children: value }), _jsx("p", { className: "text-[11px] text-zinc-500", children: label })] })] }));
}
/** Número grande com rótulo e ícone (resumos de painel e estatísticas). */
export function StatTile({ icon, label, value, hint, }) {
    return (_jsxs("div", { className: "surface p-4", children: [_jsxs("p", { className: "flex items-center gap-2 text-[13px] text-zinc-400", children: [_jsx(Icon, { name: icon, size: "1.05rem", className: "text-brand-300" }), label] }), _jsx("p", { className: "tabular mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-zinc-50 sm:text-3xl", children: value }), hint && _jsx("p", { className: "mt-0.5 truncate text-xs text-zinc-500", children: hint })] }));
}
