import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from 'react';
import { Icon } from './Icon';
/** Botão em pílula. Primário = branco (um por tela); o resto é discreto. */
export function Button({ variant = 'secondary', size = 'md', loading = false, disabled, className = '', children, ...rest }) {
    return (_jsxs("button", { type: "button", disabled: disabled || loading, "aria-busy": loading || undefined, className: `btn btn-${variant} ${size === 'md' ? '' : `btn-${size}`} ${className}`, ...rest, children: [loading && _jsx(Spinner, { size: "sm" }), children] }));
}
export function Spinner({ size = 'md', label }) {
    const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    return (_jsxs("span", { role: "status", "aria-label": label ?? 'Carregando', className: "inline-flex items-center gap-2.5", children: [_jsxs("svg", { viewBox: "0 0 24 24", className: `${dim} animate-spin`, fill: "none", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "9", className: "stroke-white/10", strokeWidth: "2.5" }), _jsx("path", { d: "M21 12a9 9 0 0 0-9-9", className: "stroke-brand-400", strokeWidth: "2.5", strokeLinecap: "round" })] }), label && _jsx("span", { className: "text-sm text-zinc-400", children: label })] }));
}
const ALERTS = {
    error: { icon: 'error', color: 'text-red-300' },
    warning: {
        icon: 'warning',
        color: 'text-amber-300',
    },
    info: { icon: 'info', color: 'text-brand-300' },
    success: {
        icon: 'check_circle',
        color: 'text-emerald-300',
    },
};
/** Aviso em linha: ícone semântico, título curto e o que fazer. */
export function Alert({ tone = 'info', title, children, }) {
    const t = ALERTS[tone];
    return (_jsxs("div", { role: tone === 'error' ? 'alert' : 'status', className: "surface pop-in flex gap-3 rounded-2xl px-3.5 py-3 text-sm", children: [_jsx(Icon, { name: t.icon, size: "1.15rem", className: `mt-0.5 ${t.color}` }), _jsxs("div", { className: "min-w-0 text-zinc-200", children: [title && _jsx("p", { className: "font-semibold text-zinc-50", children: title }), children && _jsx("div", { className: title ? 'mt-0.5 text-zinc-300' : '', children: children })] })] }));
}
/** Superfície discreta para formulários e blocos (vidro escuro, sem moldura pesada). */
export function Card({ children, className = '', ...rest }) {
    return (_jsx("section", { className: `surface p-4 sm:p-5 ${className}`, ...rest, children: children }));
}
const BADGES = {
    neutral: 'bg-white/10 text-zinc-300',
    live: 'bg-[#c8352a] text-[#fff]', // 5:1 com o branco
    open: 'bg-[#2fbf71] text-[#03140a]',
    scheduled: 'bg-brand-400 text-[#1a0b0e]',
    warn: 'bg-[#f8cb74] text-[#2a1a00]',
};
export function Badge({ tone = 'neutral', children, }) {
    return (_jsx("span", { className: `inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ${BADGES[tone]}`, children: children }));
}
/** Ponto de estado. `live` pulsa; é o único elemento animado sem ação da pessoa. */
export function StatusDot({ tone }) {
    const color = {
        live: 'bg-red-500 signal-live',
        open: 'bg-emerald-400',
        idle: 'bg-amber-400',
        scheduled: 'bg-brand-400',
        off: 'bg-zinc-600',
    }[tone];
    return (_jsx("span", { "aria-hidden": "true", className: `inline-block h-2 w-2 shrink-0 rounded-full ${color}` }));
}
export function Field({ label, hint, children, htmlFor, }) {
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { htmlFor: htmlFor, className: "block text-[13px] font-medium text-zinc-200", children: label }), children, hint && _jsx("p", { className: "text-xs text-zinc-500", children: hint })] }));
}
/** Classe única para input, select e textarea: mesma altura, borda e foco em todo o produto. */
export const inputClass = 'w-full rounded-xl bg-black/30 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 transition-colors focus:bg-black/45 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
/** Cabeçalho de página: título pequeno e firme à esquerda, ações à direita. */
export function PageTitle({ children, action, description, }) {
    return (_jsxs("div", { className: "page-title rise", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h1", { className: "ink text-2xl font-bold tracking-[-0.02em] sm:text-3xl", children: children }), description && _jsx("p", { className: "ink-soft mt-1 max-w-prose text-sm", children: description })] }), action && _jsx("div", { className: "ink-soft shrink-0", children: action })] }));
}
/**
 * Seção dentro de uma página: título em negrito (com a contagem, se tiver), uma linha dizendo
 * para que serve e o conteúdo. O cabeçalho fica alinhado à esquerda, na mesma linha da grade
 * de cards, para tudo começar no mesmo lugar. A seção é nomeada pelo título (leitores de tela).
 */
export function Section({ title, description, action, count, children, }) {
    const id = useId();
    return (_jsxs("section", { "aria-labelledby": id, className: "section rise rise-2", children: [_jsxs("div", { className: "section-head", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("h2", { id: id, className: "ink flex items-center gap-2 text-lg font-bold tracking-[-0.01em]", children: [title, count !== undefined && (_jsx("span", { className: "section-count tabular", "aria-label": `${count} no total`, children: count }))] }), description && _jsx("p", { className: "ink-soft mt-0.5 text-[13px]", children: description })] }), action && _jsx("div", { className: "ink-soft shrink-0", children: action })] }), children] }));
}
/** Estado vazio: diz o que falta e o que fazer. Sem ilustração. */
export function EmptyState({ title, children, action, }) {
    return (_jsxs("div", { className: "surface px-5 py-8 text-center", children: [_jsx("p", { className: "text-sm font-medium text-zinc-200", children: title }), children && (_jsx("div", { className: "mx-auto mt-1 max-w-sm text-[13px] text-zinc-500", children: children })), action && _jsx("div", { className: "mt-4", children: action })] }));
}
export function Avatar({ name, url, size = 'md', }) {
    const dim = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' }[size];
    if (url) {
        return (_jsx("img", { src: url, alt: "", loading: "lazy", className: `${dim} shrink-0 rounded-full object-cover` }));
    }
    const letters = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0] ?? '')
        .join('')
        .toUpperCase();
    return (_jsx("span", { "aria-hidden": "true", className: `${dim} inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-700 font-semibold text-zinc-200`, children: letters || '?' }));
}
