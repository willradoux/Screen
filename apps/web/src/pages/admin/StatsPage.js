import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Alert, Avatar, Card, PageTitle, Spinner } from '../../components/ui';
import { StatTile } from '../../components/Widget';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { useAsync } from '../../lib/useAsync';
const PERIODS = [
    { days: 7, label: '7 dias' },
    { days: 30, label: '30 dias' },
    { days: 90, label: '90 dias' },
];
/** "135" vira "2 h 15 min"; "40" vira "40 min". */
export function formatMinutes(total) {
    if (total < 60)
        return `${total} min`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}
/** Barras por dia, em CSS puro (sem biblioteca de gráfico). */
export function DayBars({ days }) {
    const max = Math.max(1, ...days.map((d) => d.minutes));
    return (_jsxs(_Fragment, { children: [_jsx("div", { role: "img", "aria-label": "Tempo conectado por dia", className: "flex h-40 items-end gap-1", children: days.map((d) => (_jsx("div", { title: `${d.date}: ${formatMinutes(d.minutes)} · ${d.participants} pessoas`, className: "min-w-0 flex-1 rounded-t bg-brand-500/70 transition-colors hover:bg-brand-400", style: { height: `${Math.max(2, (d.minutes / max) * 100)}%` } }, d.date))) }), _jsxs("table", { className: "sr-only", children: [_jsx("caption", { children: "Tempo conectado por dia" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Dia" }), _jsx("th", { scope: "col", children: "Tempo conectado" }), _jsx("th", { scope: "col", children: "Pessoas" })] }) }), _jsx("tbody", { children: days.map((d) => (_jsxs("tr", { children: [_jsx("th", { scope: "row", children: d.date }), _jsx("td", { children: formatMinutes(d.minutes) }), _jsx("td", { children: d.participants })] }, d.date))) })] })] }));
}
/** Números do servidor no período escolhido (ADMIN). */
export function StatsPage() {
    const [days, setDays] = useState(30);
    const { state } = useAsync(() => api.stats.get(days), [days]);
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "Participa\u00E7\u00E3o no servidor no per\u00EDodo escolhido.", action: _jsx("div", { role: "group", "aria-label": "Per\u00EDodo", className: "flex gap-1 rounded-full bg-zinc-900 p-1", children: PERIODS.map((p) => (_jsx("button", { type: "button", "aria-pressed": days === p.days, onClick: () => setDays(p.days), className: `rounded-full px-3 py-1 text-sm font-medium ${days === p.days ? 'bg-zinc-50 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'}`, children: p.label }, p.days))) }), children: "Estat\u00EDsticas" }), state.status === 'loading' && _jsx(Spinner, { label: "Calculando\u2026" }), state.status === 'error' && _jsx(Alert, { tone: "error", children: describeError(state.error) }), state.status === 'ready' && (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "stagger grid grid-cols-2 gap-2 lg:grid-cols-3", children: [_jsx(StatTile, { icon: "videocam", label: "Lives abertas", value: String(state.data.livesOpened) }), _jsx(StatTile, { icon: "calendar_month", label: "Reuni\u00F5es", value: String(state.data.meetingsHeld) }), _jsx(StatTile, { icon: "group", label: "Pessoas diferentes", value: String(state.data.uniqueParticipants) }), _jsx(StatTile, { icon: "schedule", label: "Tempo total conectado", value: formatMinutes(state.data.participantMinutes) }), _jsx(StatTile, { icon: "history", label: "Entradas em sala", value: String(state.data.sessions) }), _jsx(StatTile, { icon: "bar_chart", label: "M\u00E9dia por entrada", value: formatMinutes(state.data.avgSessionMinutes) })] }), _jsxs(Card, { className: "space-y-3", children: [_jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Tempo conectado por dia" }), state.data.sessions === 0 ? (_jsx("p", { className: "text-sm text-zinc-500", children: "Ningu\u00E9m entrou em sala neste per\u00EDodo." })) : (_jsx(DayBars, { days: state.data.perDay }))] }), _jsxs(Card, { className: "space-y-3", children: [_jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Quem mais participou" }), state.data.topPeople.length === 0 ? (_jsx("p", { className: "text-sm text-zinc-500", children: "Sem dados ainda." })) : (_jsx("ol", { className: "space-y-2", children: state.data.topPeople.map((p, i) => (_jsxs("li", { className: "flex items-center gap-3", "data-testid": "top-person", children: [_jsxs("span", { className: "w-5 text-sm text-zinc-500", children: [i + 1, "."] }), _jsx(Avatar, { name: p.displayName, url: null, size: "sm" }), _jsx("span", { className: "flex-1 truncate text-zinc-100", children: p.displayName }), _jsx("span", { className: "text-sm text-zinc-400", children: formatMinutes(p.minutes) })] }, p.userId))) }))] })] }))] }));
}
