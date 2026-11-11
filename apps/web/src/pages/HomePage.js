import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { CallsSection } from '../components/CallsSection';
import { Icon } from '../components/Icon';
import { RoomCard } from '../components/RoomCard';
import { Alert, Button, EmptyState, PageTitle, Section } from '../components/ui';
import { Loader } from '../components/Loader';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { useAsync } from '../lib/useAsync';
import { useCooldown } from '../lib/useCooldown';
/** Quantas colunas de card a seção ocupa (1 a 4). */
function cols4(n) {
    return { '--n': Math.min(4, Math.max(1, n)) };
}
/** Cards de salas numa grade; cada sala mostra quem está na call ligada a ela. */
function RoomGrid({ rooms, calls, onChanged, }) {
    return (_jsx("ul", { className: "widget-grid stagger", children: rooms.map((room) => (_jsx("li", { className: "flex", children: _jsx(RoomCard, { room: room, onChanged: onChanged, members: calls?.find((c) => c.roomId === room.id)?.members }) }, room.id))) }));
}
/** Resumo de uma linha: "2 abertas · 1 agendada". */
function summary(open, scheduled) {
    const parts = [
        `${open} ${open === 1 ? 'aberta' : 'abertas'}`,
        `${scheduled} ${scheduled === 1 ? 'agendada' : 'agendadas'}`,
    ];
    return parts.join(' · ');
}
/**
 * Início: o que está acontecendo agora. Calls com gente, salas abertas e reuniões
 * agendadas, e nada mais (o "como funciona" mora no Guia).
 */
export function HomePage() {
    const { state, reload } = useAsync(async () => (await api.rooms.list({ limit: 50 })).data);
    // As calls são buscadas uma vez só e servem às duas seções (sem pedir de novo ao servidor).
    const callsReq = useAsync(() => api.calls.list());
    const calls = callsReq.state.status === 'ready' ? callsReq.state.data : null;
    const cooldown = useCooldown(4000);
    const rooms = state.status === 'ready' ? state.data : [];
    const open = rooms.filter((room) => room.status === 'OPEN').length;
    const scheduled = rooms.filter((room) => room.status === 'SCHEDULED').length;
    const live = rooms.filter((room) => room.status === 'OPEN');
    const later = rooms.filter((room) => room.status !== 'OPEN');
    const roomIds = rooms.map((room) => room.id);
    const extraCalls = (calls ?? []).filter((c) => c.members.length > 0 && (!c.roomId || !roomIds.includes(c.roomId))).length;
    // As seções ficam lado a lado, cada uma com a largura dos seus cards (até 4 por linha). O
    // bloco inteiro (título da página junto) tem a largura da fileira e fica no meio.
    const counts = [live.length, extraCalls, later.length].filter((n) => n > 0);
    const cols = counts.map((n) => Math.min(4, n));
    const cards = cols.reduce((sum, n) => sum + n, 0) || 1;
    const innerGaps = cols.reduce((sum, n) => sum + n - 1, 0);
    const sectionGaps = Math.max(0, cols.length - 1);
    const boardWidth = `calc(${cards} * var(--card) + ${innerGaps} * 14px + ${sectionGaps} * var(--board-gap))`;
    // Cards da mesma altura entre as seções só quando cada seção cabe numa linha só.
    const oneRow = counts.every((n) => n <= 4);
    return (_jsxs("div", { className: "board", style: counts.length > 0 ? { '--board-w': boardWidth } : undefined, children: [_jsx(PageTitle, { description: state.status === 'ready'
                    ? summary(open, scheduled)
                    : 'Lives das calls e reuniões da comunidade.', action: _jsxs(Button, { variant: "ghost", size: "sm", disabled: cooldown.active, onClick: () => cooldown.run(() => {
                        void reload();
                        void callsReq.reload({ silent: true });
                    }), children: [_jsx(Icon, { name: "refresh", size: "1rem" }), "Atualizar"] }), children: "Salas" }), _jsxs("div", { className: "board-row", "data-even": oneRow || undefined, children: [state.status === 'loading' && _jsx(Loader, { label: "Carregando salas\u2026" }), state.status === 'error' && (_jsx(Alert, { tone: "error", title: "N\u00E3o foi poss\u00EDvel carregar as salas", children: describeError(state.error) })), state.status === 'ready' && live.length > 0 && (_jsx("div", { className: "board-col", style: cols4(live.length), children: _jsx(Section, { title: "Ao vivo agora", count: live.length, description: "Entre para falar, mostrar a tela ou s\u00F3 assistir.", children: _jsx(RoomGrid, { rooms: live, calls: calls, onChanged: reload }) }) })), state.status === 'ready' && (_jsx("div", { className: "board-col", style: cols4(extraCalls), children: _jsx(CallsSection, { calls: calls, shownRoomIds: roomIds }) })), state.status === 'ready' && later.length > 0 && (_jsx("div", { className: "board-col", style: cols4(later.length), children: _jsx(Section, { title: "Agendadas", count: later.length, description: "Reuni\u00F5es marcadas. A sala abre no hor\u00E1rio.", children: _jsx(RoomGrid, { rooms: later, calls: calls, onChanged: reload }) }) })), state.status === 'ready' && state.data.length === 0 && (_jsxs(EmptyState, { title: "Nenhuma sala aberta agora.", children: ["Entre num canal de voz da categoria de lives no Discord: o bot abre a sala e manda o link. Reuni\u00F5es marcadas ficam em", ' ', _jsx(Link, { to: "/reunioes", className: "link-quiet", children: "Reuni\u00F5es" }), "."] }))] })] }));
}
