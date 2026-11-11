import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { QrCode } from '../components/QrCode';
import { Button } from '../components/ui';
import { Loader } from '../components/Loader';
import { StatusCard } from '../components/StatusCard';
import { CoverChip, WidgetCover, WidgetStat } from '../components/Widget';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDateTime, formatDuration, timeUntil } from '../lib/format';
import { messageFor } from '../lib/errors';
import { useNow } from '../pages/MeetingsPage';
/** Centraliza os estados da sala na área do painel, com respiro em cima e embaixo. */
function Center({ children }) {
    return (_jsx("div", { className: "rise mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-md flex-col justify-center gap-4 py-6", children: children }));
}
const BackHome = () => (_jsxs(Link, { to: "/", className: "btn btn-ghost btn-sm w-fit", children: [_jsx(Icon, { name: "arrow_back", size: "1rem" }), "Voltar para as salas"] }));
export function CheckingScreen() {
    return (_jsx(Center, { children: _jsx(Loader, { label: "Verificando seu acesso", children: "Conferindo se voc\u00EA pode entrar nesta sala." }) }));
}
/** Por que não dá para entrar agora, e o que fazer. */
export function BlockedScreen({ access, room }) {
    const now = useNow();
    const left = timeUntil(access.startsAt, now);
    switch (access.reason) {
        case 'NOT_IN_VOICE':
            return (_jsx(Center, { children: _jsx(StatusCard, { icon: "mic", tone: "wait", title: "Entre na call para participar", waiting: "Verificando a cada poucos segundos \u2014 voc\u00EA entra sozinho assim que estiver na call.", actions: _jsx(BackHome, {}), children: _jsxs("p", { children: [access.voiceChannelName
                                ? `Entre no canal de voz “${access.voiceChannelName}” no Discord.`
                                : 'Entre no canal de voz desta live no Discord.', ' ', "S\u00F3 quem est\u00E1 na call pode assistir e transmitir."] }) }) }));
        case 'ROOM_NOT_OPEN':
            if (access.status === 'SCHEDULED') {
                return (_jsx(Center, { children: _jsx(StatusCard, { icon: "schedule", tone: "info", title: room?.title ?? 'Reunião', waiting: "A sala abre sozinha no hor\u00E1rio.", actions: _jsx(BackHome, {}), children: _jsxs("p", { children: ["Come\u00E7a em ", formatDateTime(access.startsAt), left !== null && (_jsxs("strong", { className: "text-zinc-50", children: [" \u00B7 faltam ", formatDuration(left)] })), "."] }) }) }));
            }
            return (_jsx(Center, { children: _jsx(StatusCard, { icon: access.status === 'CANCELED' ? 'cancel' : 'call_end', tone: "warning", title: access.status === 'CANCELED' ? 'Reunião cancelada' : 'Sala encerrada', actions: _jsx(BackHome, {}), children: _jsx("p", { children: access.status === 'CANCELED'
                            ? 'Esta reunião foi cancelada.'
                            : 'Esta sala já foi encerrada.' }) }) }));
        case 'BANNED_FROM_ROOM':
            return (_jsx(Center, { children: _jsx(StatusCard, { icon: "block", tone: "error", title: "Voc\u00EA foi removido desta sala", actions: _jsx(BackHome, {}), children: _jsx("p", { children: access.expiresAt
                            ? `Você poderá voltar depois de ${formatDateTime(access.expiresAt)}.`
                            : 'Você não poderá voltar a esta sala.' }) }) }));
        case 'ROLE_NOT_ALLOWED':
            return (_jsx(Center, { children: _jsx(StatusCard, { icon: "lock", tone: "warning", title: "Reuni\u00E3o restrita", actions: _jsx(BackHome, {}), children: _jsx("p", { children: messageFor('ROLE_NOT_ALLOWED') }) }) }));
        case 'ROOM_FULL':
            return (_jsx(Center, { children: _jsx(StatusCard, { icon: "group", tone: "wait", title: "A sala est\u00E1 lotada", waiting: "Tentando de novo a cada poucos segundos.", actions: _jsx(BackHome, {}), children: _jsxs("p", { children: ["Limite de ", access.maxParticipants ?? room?.maxParticipants, " pessoas."] }) }) }));
        default:
            return (_jsx(Center, { children: _jsx(StatusCard, { icon: "warning", tone: "warning", title: "N\u00E3o \u00E9 poss\u00EDvel entrar agora", actions: _jsx(BackHome, {}), children: _jsx("p", { children: access.hint ?? 'Tente novamente em instantes.' }) }) }));
    }
}
/**
 * Antes de conectar: uma peça só, com o que a pessoa precisa saber e um botão. O clique em
 * "Entrar" é o gesto que libera áudio e captura no navegador.
 */
export function ReadyScreen({ room, onJoin }) {
    const link = room.url || (typeof location !== 'undefined' ? location.href : '');
    const [qr, setQr] = useState(false);
    const idle = room.type === 'LIVE' && room.mediaState === 'IDLE';
    const people = room.participantCount;
    // Quem está na call do Discord agora (só lives). Busca uma vez, sem repetir.
    const calls = useAsync(() => room.type === 'LIVE' ? api.calls.list() : Promise.resolve([]));
    const members = calls.state.status === 'ready'
        ? calls.state.data.find((c) => c.roomId === room.id)?.members
        : undefined;
    return (_jsx(Center, { children: _jsxs("article", { className: "widget widget-hero", children: [_jsx(WidgetCover, { tone: idle ? 'idle' : 'live', people: members, left: _jsx(CoverChip, { icon: room.type === 'LIVE' ? 'videocam' : 'calendar_month', children: room.type === 'LIVE' ? 'Live' : 'Reunião' }), right: _jsx(CoverChip, { icon: "lock", children: "Acesso verificado" }) }), _jsxs("div", { className: "widget-body", "data-people": members && members.length > 0 ? 'true' : undefined, children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold leading-tight text-zinc-50 sm:text-2xl", children: room.title }), room.description && (_jsx("p", { className: "mt-1.5 text-[13px] leading-relaxed text-zinc-400", children: room.description }))] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(WidgetStat, { icon: "group", value: people === 0 ? 'ninguém ainda' : `${people} ${people === 1 ? 'pessoa' : 'pessoas'}`, label: "na sala" }), _jsx(WidgetStat, { icon: "videocam_off", value: "Tudo desligado", label: "ao entrar" })] }), _jsxs("p", { className: "text-xs leading-relaxed text-zinc-500", children: [_jsx("strong", { className: "text-zinc-300", children: "C\u00E2mera e microfone come\u00E7am desligados." }), " Voc\u00EA liga o que quiser l\u00E1 dentro."] }), idle && (_jsxs("p", { className: "rounded-xl bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200", children: [_jsx("strong", { children: "Sess\u00E3o em espera:" }), " ao entrar voc\u00EA a ativa. Comece a transmitir em alguns minutos para ela n\u00E3o voltar para a espera."] })), _jsx(Button, { variant: "primary", size: "lg", className: "w-full", onClick: onJoin, children: "Entrar na sala" }), _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx(BackHome, {}), _jsxs("button", { type: "button", "aria-expanded": qr, onClick: () => setQr((v) => !v), className: "btn btn-ghost btn-sm", children: [_jsx(Icon, { name: "qr_code_2", size: "1rem" }), "Abrir no celular"] })] }), qr && (_jsxs("div", { className: "pop-in flex flex-col items-center gap-2 pt-1", children: [_jsx(QrCode, { value: link, size: 160 }), _jsx("p", { className: "text-xs text-zinc-500", children: "Aponte a c\u00E2mera do celular para o c\u00F3digo." })] }))] })] }) }));
}
/** Conectando. Se a live estava em espera, o próprio clique ativa a sessão: avisa isso. */
export function JoiningScreen({ activating = false }) {
    return (_jsx(Center, { children: _jsx(Loader, { label: activating ? 'Ativando a sessão' : 'Entrando na sala', children: activating
                ? 'A sessão estava em espera porque ninguém estava usando. Em instantes você entra.'
                : 'Conectando ao vídeo e ao áudio da sala.' }) }));
}
/** A sessão ficou em espera: o link continua valendo, é só ativar de novo. */
export function IdleScreen({ reason, onActivate, }) {
    return (_jsx(Center, { children: _jsxs(StatusCard, { icon: "bedtime", tone: "info", title: "Sess\u00E3o em espera", actions: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "primary", size: "lg", onClick: onActivate, children: "Ativar sess\u00E3o" }), _jsx(BackHome, {})] }), children: [_jsxs("p", { children: [reason === 'NOBODY_CONNECTED'
                            ? 'Ninguém estava conectado, então a sessão de vídeo foi pausada.'
                            : 'Ninguém estava transmitindo câmera ou tela, então a sessão de vídeo foi pausada.', ' ', "A live continua aberta no Discord."] }), _jsx("p", { className: "text-[13px] text-zinc-500", children: "Ao ativar de novo, algu\u00E9m precisa come\u00E7ar a transmitir em alguns minutos, sen\u00E3o ela volta para a espera." })] }) }));
}
const END_TEXT = {
    ENDED_BY_MOD: 'Um moderador encerrou a sala.',
    ENDED_BY_ADMIN: 'Um administrador encerrou a sala.',
    VOICE_EMPTY: 'Todo mundo saiu do canal de voz, então a live foi encerrada.',
    MEETING_FINISHED: 'A reunião terminou.',
    CANCELED: 'A reunião foi cancelada.',
};
export function EndedScreen({ reason }) {
    return (_jsx(Center, { children: _jsx(StatusCard, { icon: "call_end", tone: "info", title: "Sala encerrada", actions: _jsx(BackHome, {}), children: _jsx("p", { children: END_TEXT[reason] ?? 'A sala foi encerrada.' }) }) }));
}
export function RemovedScreen({ action, reason, expiresAt, }) {
    return (_jsx(Center, { children: _jsxs(StatusCard, { icon: action === 'BANNED' ? 'block' : 'person_remove', tone: "error", title: action === 'BANNED' ? 'Você foi banido desta sala' : 'Você foi removido da sala', actions: _jsx(BackHome, {}), children: [reason && _jsxs("p", { children: ["Motivo: ", reason] }), action === 'BANNED' && (_jsx("p", { children: expiresAt
                        ? `Você poderá voltar depois de ${formatDateTime(expiresAt)}.`
                        : 'Você não poderá voltar a esta sala.' })), action === 'KICKED' && _jsx("p", { children: "Voc\u00EA pode entrar de novo, se ainda tiver acesso." })] }) }));
}
export function ErrorScreen({ code, message, onRetry, }) {
    const retryable = !['ROOM_NOT_FOUND', 'UNAUTHENTICATED'].includes(code);
    return (_jsx(Center, { children: _jsx(StatusCard, { icon: code === 'NETWORK_ERROR' ? 'wifi_off' : 'error', tone: "error", title: "N\u00E3o foi poss\u00EDvel entrar na sala", actions: _jsxs(_Fragment, { children: [retryable && (_jsx(Button, { variant: "primary", onClick: onRetry, children: "Tentar de novo" })), _jsx(BackHome, {})] }), children: _jsx("p", { children: message }) }) }));
}
