import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { Alert, Badge, EmptyState, PageTitle, Section, Spinner, StatusDot, } from '../../components/ui';
import { StatTile } from '../../components/Widget';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { isAdmin } from '../../lib/moderation-rules';
import { useAsync } from '../../lib/useAsync';
/** O que ainda falta configurar, em frases que dizem onde ir. */
export function setupChecklist(s) {
    return [
        {
            done: s.liveChannelIds.length > 0 || s.liveCategoryId !== null,
            text: 'Escolher as calls onde as lives acontecem',
        },
        { done: s.announceChannelId !== null, text: 'Escolher o canal de avisos das reuniões' },
        { done: s.logChannelId !== null, text: 'Escolher o canal de logs (opcional, mas ajuda muito)' },
    ];
}
function LiveRow({ room }) {
    const active = room.mediaState === 'ACTIVE';
    return (_jsxs("li", { className: "surface flex items-center gap-4 px-4 py-3", children: [_jsx(StatusDot, { tone: active ? 'live' : 'idle' }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate font-medium text-zinc-50", children: room.title }), _jsxs("p", { className: "tabular text-sm text-zinc-500", children: [active ? 'Em uso' : 'Em espera', " \u00B7 ", room.participantCount, ' ', room.participantCount === 1 ? 'pessoa conectada' : 'pessoas conectadas'] })] }), _jsx(Link, { to: `/r/${room.id}`, className: "btn btn-secondary btn-sm", children: "Abrir" })] }));
}
function MeetingRow({ meeting }) {
    return (_jsxs("li", { className: "surface flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3", children: [_jsx(StatusDot, { tone: meeting.status === 'OPEN' ? 'open' : 'scheduled' }), _jsx("p", { className: "min-w-0 flex-1 truncate font-medium text-zinc-50", children: meeting.title }), meeting.announced ? (_jsx(Badge, { tone: "open", children: "Divulgada" })) : (_jsx(Badge, { tone: "warn", children: "N\u00E3o divulgada" })), _jsx("span", { className: "tabular text-sm text-zinc-500", children: formatDateTime(meeting.startsAt ?? meeting.openedAt) })] }));
}
/** Atalhos para o que o admin mais faz (só para admin: são páginas só dele). */
function Shortcuts() {
    const items = [
        ['/admin/reunioes', 'Nova reunião', 'campaign', 'Criar, agendar e divulgar'],
        ['/admin/pessoas', 'Pessoas', 'group', 'Quem modera e administra'],
        ['/admin/estatisticas', 'Estatísticas', 'bar_chart', 'Participação no período'],
        ['/admin/config', 'Configurações', 'settings', 'Canais, cargos e limites'],
    ];
    return (_jsx("nav", { "aria-label": "Atalhos", className: "shortcuts", children: items.map(([to, label, icon, text]) => (_jsxs(Link, { to: to, className: "shortcut", children: [_jsx("span", { "aria-hidden": "true", className: "shortcut-icon", children: _jsx(Icon, { name: icon, size: "1.3rem" }) }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "shortcut-label", children: label }), _jsx("span", { className: "shortcut-text", children: text })] })] }, to))) }));
}
/**
 * Três números no topo, a partir do que a página já buscou (sem pedir nada a mais): lives no ar,
 * pessoas conectadas e a próxima reunião.
 */
function Summary({ lives, meetings }) {
    const people = lives.reduce((sum, room) => sum + room.participantCount, 0);
    const next = meetings
        .filter((m) => m.status === 'SCHEDULED' && m.startsAt)
        .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))[0];
    return (_jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsx(StatTile, { icon: "videocam", label: "Lives no ar", value: String(lives.length) }), _jsx(StatTile, { icon: "group", label: "Pessoas conectadas", value: String(people), hint: "nas lives abertas" }), _jsx(StatTile, { icon: "calendar_month", label: "Pr\u00F3xima reuni\u00E3o", value: next ? formatDateTime(next.startsAt) : '—', hint: next ? next.title : 'Nenhuma agendada' })] }));
}
/** Visão geral do servidor para quem administra ou modera. */
export function AdminHomePage() {
    const { user } = useAuth();
    const admin = !!user && isAdmin(user.role);
    const { state } = useAsync(async () => {
        const [lives, meetings, settings] = await Promise.all([
            api.rooms.list({ type: 'LIVE', status: 'OPEN', limit: 50 }),
            api.meetings.list({ limit: 20 }),
            admin ? api.settings.get() : Promise.resolve(null),
        ]);
        return { lives: lives.data, meetings, settings };
    });
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "O que est\u00E1 no ar e o que ainda falta configurar.", children: "Painel" }), state.status === 'loading' && _jsx(Spinner, { label: "Carregando\u2026" }), state.status === 'error' && (_jsx(Alert, { tone: "error", title: "N\u00E3o foi poss\u00EDvel carregar o painel", children: describeError(state.error) })), state.status === 'ready' && (_jsxs("div", { className: "space-y-10", children: [state.data.settings && setupChecklist(state.data.settings).some((i) => !i.done) && (_jsxs(Alert, { tone: "warning", title: "Falta configurar", children: [_jsx("ul", { className: "list-disc pl-5", children: setupChecklist(state.data.settings)
                                    .filter((i) => !i.done)
                                    .map((i) => (_jsx("li", { children: i.text }, i.text))) }), _jsx(Link, { to: "/admin/config", className: "mt-2 inline-block underline underline-offset-2", children: "Ir para Configura\u00E7\u00F5es" })] })), _jsx(Summary, { lives: state.data.lives, meetings: state.data.meetings }), admin && _jsx(Shortcuts, {}), _jsx(Section, { title: "Sess\u00F5es de live agora", count: state.data.lives.length, description: "Lives abertas e quantas pessoas est\u00E3o em cada uma.", children: state.data.lives.length === 0 ? (_jsx(EmptyState, { title: "Nenhuma live aberta.", children: "Elas abrem sozinhas quando algu\u00E9m entra numa call habilitada." })) : (_jsx("ul", { className: "stagger space-y-2", children: state.data.lives.map((r) => (_jsx(LiveRow, { room: r }, r.id))) })) }), _jsx(Section, { title: "Reuni\u00F5es", count: state.data.meetings.length, description: "Abertas e agendadas; o selo diz se o aviso j\u00E1 foi para o Discord.", action: admin ? (_jsx(Link, { to: "/admin/reunioes", className: "inline-flex min-h-6 items-center text-sm font-medium text-brand-300 underline underline-offset-2", children: "Gerenciar" })) : undefined, children: state.data.meetings.length === 0 ? (_jsx(EmptyState, { title: "Nenhuma reuni\u00E3o aberta ou agendada." })) : (_jsx("ul", { className: "stagger space-y-2", children: state.data.meetings.map((m) => (_jsx(MeetingRow, { meeting: m }, m.id))) })) }), !admin && (_jsx("p", { className: "text-sm text-zinc-500", children: "Como moderador voc\u00EA acompanha as sess\u00F5es e modera dentro das reuni\u00F5es. Configura\u00E7\u00F5es e reuni\u00F5es s\u00E3o s\u00F3 para administradores." }))] }))] }));
}
