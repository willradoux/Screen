import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader } from '../components/Loader';
import { Alert, EmptyState, PageTitle, Section } from '../components/ui';
import { RoomCard } from '../components/RoomCard';
import { CoverChip, WidgetCover, WidgetStat } from '../components/Widget';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { formatDateTime, formatDuration, formatReminder, timeUntil } from '../lib/format';
import { useAsync } from '../lib/useAsync';
/** Relógio que atualiza a cada segundo (para a contagem regressiva). */
export function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
/** Quebra o tempo que falta em blocos grandes (dias, horas, minutos, segundos). */
function countdownParts(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86_400);
    const h = Math.floor((total % 86_400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    const parts = [
        { value: pad(h), unit: h === 1 ? 'hora' : 'horas' },
        { value: pad(m), unit: 'min' },
        { value: pad(sec), unit: 'seg' },
    ];
    return d > 0 ? [{ value: String(d), unit: d === 1 ? 'dia' : 'dias' }, ...parts] : parts;
}
/**
 * A próxima reunião em destaque, grande, à esquerda: capa, título, a contagem regressiva em
 * blocos, data, lembretes e o botão da sala.
 */
function NextMeeting({ meeting }) {
    const now = useNow();
    const left = timeUntil(meeting.startsAt, now);
    return (_jsxs("section", { "aria-label": "Pr\u00F3xima reuni\u00E3o", className: "widget meet-feature rise", children: [_jsx(WidgetCover, { left: _jsx(CoverChip, { icon: "schedule", children: "Pr\u00F3xima reuni\u00E3o" }), right: _jsx(CoverChip, { icon: "calendar_month", children: "Reuni\u00E3o" }) }), _jsxs("div", { className: "widget-body gap-4", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("h2", { className: "text-2xl font-bold tracking-[-0.02em] text-zinc-50 sm:text-[1.75rem]", children: meeting.title }), meeting.description && (_jsx("p", { className: "mx-auto max-w-[44ch] text-sm text-zinc-400", children: meeting.description }))] }), left !== null && (_jsxs("div", { children: [_jsxs("p", { className: "sr-only", children: ["come\u00E7a em ", formatDuration(left)] }), _jsx("ol", { "aria-hidden": "true", className: "countdown", children: countdownParts(left).map((p) => (_jsxs("li", { children: [_jsx("span", { className: "countdown-value tabular", children: p.value }, p.value), _jsx("span", { className: "countdown-unit", children: p.unit })] }, p.unit))) })] })), _jsxs("div", { className: "flex flex-wrap justify-center gap-x-8 gap-y-3", children: [_jsx(WidgetStat, { icon: "schedule", value: formatDateTime(meeting.startsAt), label: "come\u00E7a" }), _jsx(WidgetStat, { icon: "group", value: `${meeting.participantCount}/${meeting.maxParticipants}`, label: "vagas usadas" })] }), meeting.reminders.length > 0 && (_jsxs("p", { className: "text-xs text-zinc-500", children: ["Lembretes no Discord:", ' ', meeting.reminders.map((r) => formatReminder(r.minutesBefore)).join(', '), " antes."] })), _jsx("div", { className: "mt-auto flex justify-center pt-1", children: _jsx(Link, { to: `/r/${meeting.id}`, className: "btn btn-primary", children: "Ver sala" }) })] })] }));
}
/** Reuniões abertas e agendadas, para qualquer membro. */
export function MeetingsPage() {
    const { state, reload } = useAsync(() => api.meetings.list({ limit: 50 }));
    const next = state.status === 'ready' ? state.data.find((m) => m.status === 'SCHEDULED') : undefined;
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "As pr\u00F3ximas reuni\u00F5es da comunidade e as que j\u00E1 est\u00E3o abertas.", children: "Reuni\u00F5es" }), state.status === 'loading' && _jsx(Loader, { label: "Carregando reuni\u00F5es\u2026" }), state.status === 'error' && (_jsx(Alert, { tone: "error", title: "N\u00E3o foi poss\u00EDvel carregar as reuni\u00F5es", children: describeError(state.error) })), state.status === 'ready' && state.data.length === 0 && (_jsx(EmptyState, { title: "Nenhuma reuni\u00E3o agendada.", children: "Os avisos aparecem no canal de avisos do Discord." })), state.status === 'ready' && state.data.length > 0 && (_jsxs("div", { className: "meet-layout", "data-feature": next ? 'true' : undefined, children: [next && _jsx(NextMeeting, { meeting: next }), _jsx(Section, { title: "Todas", count: state.data.length, description: "Reuni\u00F5es abertas e agendadas da comunidade.", children: _jsx("ul", { className: "widget-grid stagger", children: state.data.map((m) => (_jsx("li", { className: "flex", children: _jsx(RoomCard, { room: m, onChanged: reload }) }, m.id))) }) })] }))] }));
}
