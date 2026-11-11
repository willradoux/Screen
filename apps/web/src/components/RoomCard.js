import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { isAdmin } from '../lib/moderation-rules';
import { formatDateTime } from '../lib/format';
import { Badge } from './ui';
import { Icon } from './Icon';
import { AvatarStack } from './Widget';
export function StatusBadge({ room }) {
    if (room.status === 'OPEN') {
        return room.type === 'LIVE' ? (_jsx(Badge, { tone: "live", children: "Ao vivo" })) : (_jsx(Badge, { tone: "open", children: "Aberta" }));
    }
    if (room.status === 'SCHEDULED')
        return _jsx(Badge, { tone: "scheduled", children: "Agendada" });
    if (room.status === 'CANCELED')
        return _jsx(Badge, { tone: "warn", children: "Cancelada" });
    return _jsx(Badge, { children: "Encerrada" });
}
/**
 * Uma sala (live ou reunião) como card: capa com o degradê do tema, o estado e quem está na
 * call; embaixo, o nome em negrito e as informações em cinza. O botão redondo de entrar aparece
 * na capa ao passar o mouse (sempre visível no toque e no foco); clicar no card também entra.
 */
export function RoomCard({ room, onChanged, members, }) {
    const auth = useOptionalAuth();
    const canCancel = room.status === 'SCHEDULED' && !!auth?.user && isAdmin(auth.user.role);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState(null);
    const titleId = useId();
    const navigate = useNavigate();
    async function cancel() {
        setBusy(true);
        setFailure(null);
        try {
            await api.meetings.cancel(room.id);
            onChanged?.();
        }
        catch (err) {
            setFailure(describeError(err));
            setBusy(false);
        }
    }
    const when = room.status === 'SCHEDULED'
        ? `Começa em ${formatDateTime(room.startsAt)}`
        : room.openedAt
            ? `Aberta desde ${formatDateTime(room.openedAt)}`
            : '';
    const session = room.type === 'LIVE' && room.status === 'OPEN'
        ? room.mediaState === 'ACTIVE'
            ? 'Sessão em uso.'
            : 'Sessão em espera: ao entrar você a ativa.'
        : null;
    const tone = room.status === 'OPEN'
        ? room.type === 'LIVE' && room.mediaState !== 'ACTIVE'
            ? 'idle'
            : 'live'
        : room.status === 'SCHEDULED'
            ? 'live'
            : 'off';
    const open = room.status === 'OPEN';
    const people = `${room.participantCount}/${room.maxParticipants} ${room.participantCount === 1 ? 'pessoa' : 'pessoas'}`;
    return (_jsxs("article", { className: "sp-card", "data-testid": "room-row", "aria-labelledby": titleId, onClick: (e) => {
            // O card inteiro leva para a sala (o botão redondo é o caminho do teclado).
            if (e.target.closest('a, button'))
                return;
            navigate(`/r/${room.id}`);
        }, children: [_jsxs("div", { className: "sp-cover", "data-tone": tone, children: [_jsx("span", { className: "sp-cover-badge", children: _jsx(StatusBadge, { room: room }) }), members && members.length > 0 ? (_jsx(AvatarStack, { people: members, max: 4 })) : (_jsx("span", { "aria-hidden": "true", className: "sp-cover-icon", children: _jsx(Icon, { name: room.type === 'LIVE' ? 'videocam' : 'calendar_month', size: "2rem" }) })), _jsx(Link, { to: `/r/${room.id}`, "aria-label": open ? 'Entrar' : 'Ver sala', "aria-describedby": titleId, title: open ? 'Entrar' : 'Ver sala', className: "sp-play", "data-open": open || undefined, children: _jsx(Icon, { name: open ? 'play_arrow' : 'arrow_forward', size: "1.5rem" }) })] }), _jsx("h3", { id: titleId, className: "sp-card-title", children: room.title }), _jsxs("p", { className: "sp-card-sub", children: [room.type === 'LIVE' ? 'Live' : 'Reunião', " \u00B7 ", people] }), when && _jsx("p", { className: "sp-card-sub", children: when }), room.description && _jsx("p", { className: "sp-card-desc", children: room.description }), session && _jsx("p", { className: "sp-card-note", children: session }), failure && _jsx("p", { className: "sp-card-note text-red-400", children: failure }), canCancel && (_jsx("div", { className: "sp-card-actions", children: confirming ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", disabled: busy, onClick: () => void cancel(), className: "btn btn-danger btn-sm", children: "Cancelar mesmo" }), _jsx("button", { type: "button", onClick: () => setConfirming(false), className: "btn btn-ghost btn-sm", children: "Voltar" })] })) : (_jsx("button", { type: "button", onClick: () => setConfirming(true), className: "btn btn-ghost btn-sm text-red-300!", children: "Cancelar" })) }))] }));
}
