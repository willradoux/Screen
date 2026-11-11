import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { ToastViewport, useToasts } from '../components/Toasts';
import { useImmersive } from '../components/immersive';
import { Alert, Avatar, Badge, Button } from '../components/ui';
import { ROLE_LABEL } from '../lib/moderation-rules';
import { publishRestriction } from '../room/publish-rules';
import { CaptionsOverlay, useSpeechCaptions } from '../room/captions';
import { Controls } from '../room/Controls';
import { useNow } from './MeetingsPage';
import { ParticipantsPanel } from '../room/ParticipantsPanel';
import { BlockedScreen, CheckingScreen, EndedScreen, ErrorScreen, IdleScreen, JoiningScreen, ReadyScreen, RemovedScreen, } from '../room/Screens';
import { RemoteAudio, STAGE_LAYOUTS, Stage } from '../room/Stage';
import { useIdle } from '../room/useIdle';
import { playSound } from '../lib/sounds';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/RoomCard';
import { secondsLeft } from '../room/sessionReducer';
import { defaultSessionDeps, useRoomSession } from '../room/useRoomSession';
import { useAudienceSubscriptions } from '../room/useAudienceSubscriptions';
import { useParticipants } from '../room/useParticipants';
import { isBigRoom, profileFor, wantedVideo } from '../lib/bigRoom';
/** Avisa que a pessoa saiu da call e será removida da live em instantes. */
function VoiceWarning({ warning }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
    }, []);
    const left = secondsLeft(warning, now);
    return (_jsxs(Alert, { tone: "warning", title: "Voc\u00EA saiu do canal de voz", children: ["Volte para a call em ", left, "s ou voc\u00EA ser\u00E1 removido(a) da live."] }));
}
const LAYOUT_KEY = 'screem-stage-layout';
function readPref(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function writePref(key, value) {
    try {
        localStorage.setItem(key, value);
    }
    catch {
        // Sem armazenamento: vale só nesta visita.
    }
}
/**
 * Dentro da chamada: a moldura preta, a tela transparente com desfoque (palco, avisos e
 * pessoas) e a barra preta embaixo com você e os controles.
 */
function ConnectedRoom({ session, me, onLeave, toast, }) {
    const { media, room, state, permissions, participantsVersion } = session;
    const { tiles, remote, local } = useParticipants(media);
    // Sons: você entrou; alguém entrou ou saiu (um som só para várias pessoas juntas).
    const remoteCount = remote.length;
    const lastCount = useRef(null);
    useEffect(() => {
        if (!media)
            return;
        const before = lastCount.current;
        if (before === null)
            playSound('join');
        else if (remoteCount > before)
            playSound('join');
        else if (remoteCount < before)
            playSound('leave');
        lastCount.current = remoteCount;
    }, [remoteCount, media]);
    // Painel de pessoas: fechado por padrão, para o palco ficar limpo.
    const [side, setSide] = useState(null);
    // Sempre começa minimizada (só o essencial, flutuando).
    const [expanded, setExpanded] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1100px)').matches === true);
    const [layout, setLayout] = useState(() => {
        const saved = readPref(LAYOUT_KEY);
        return STAGE_LAYOUTS.some((l) => l.value === saved) ? saved : 'auto';
    });
    const [handBusy, setHandBusy] = useState(false);
    const [captionsOn, setCaptionsOn] = useState(false);
    // Controles minimizados (padrão): flutuam sobre a tela e somem com o mouse parado por 3 s.
    // "Mais opções" abre a barra preta completa embaixo, que fica até a pessoa minimizar.
    // Com o ponteiro ou o foco nos controles (ou um painel aberto), eles não somem.
    const [holdBar, setHoldBar] = useState(false);
    const idle = useIdle(3000, { hold: holdBar || side !== null });
    const hideFloating = idle;
    const holdHandlers = {
        onPointerEnter: () => setHoldBar(true),
        onPointerLeave: () => setHoldBar(false),
        onFocus: () => setHoldBar(true),
        onBlur: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget))
                setHoldBar(false);
        },
    };
    const now = useNow(1000);
    // Transcreve a própria fala só com legendas ligadas e microfone aberto.
    useSpeechCaptions(captionsOn && local?.isMicrophoneEnabled === true, session.sendCaption, toast.error);
    const [pinnedId, setPinnedId] = useState(null);
    // Sala grande e eu só assistindo: recebo um único vídeo (o fixado, a tela, ou quem falou por último).
    const lastSpeaker = useRef(null);
    const speaking = tiles.find((t) => t.canPublish && t.isSpeaking && !t.isLocal);
    if (speaking)
        lastSpeaker.current = speaking.identity;
    const audienceOfBigRoom = Boolean(room && isBigRoom(room.maxParticipants)) && local?.permissions?.canPublish !== true;
    useAudienceSubscriptions(media, audienceOfBigRoom, audienceOfBigRoom ? wantedVideo(tiles, pinnedId, lastSpeaker.current) : null);
    const raised = session.hands.some((h) => h.userId === me.id);
    async function toggleHand() {
        if (!room)
            return;
        setHandBusy(true);
        try {
            if (raised)
                await api.rooms.lowerHand(room.id);
            else
                await api.rooms.raiseHand(room.id);
        }
        catch (err) {
            toast.error(describeError(err));
        }
        finally {
            setHandBusy(false);
        }
    }
    async function stageSelf() {
        if (!room)
            return;
        try {
            await api.moderation.promote(room.id, me.id);
        }
        catch (err) {
            toast.error(describeError(err));
        }
    }
    if (!media || !local || !room)
        return _jsx(JoiningScreen, {});
    const restriction = publishRestriction(state, me.role, permissions?.canPublishSources);
    const controlsFor = (variant) => (_jsx(Controls, { variant: variant, room: media, hand: room.type === 'MEETING'
            ? { raised, busy: handBusy, onToggle: () => void toggleHand() }
            : undefined, captions: { on: captionsOn, onToggle: () => setCaptionsOn((v) => !v) }, local: local, profile: profileFor(room.maxParticipants), allowedSources: permissions?.canPublishSources, restriction: restriction, panelOpen: side === 'people', onTogglePanel: () => setSide((v) => (v === 'people' ? null : 'people')), layout: {
            value: layout,
            onChange: (next) => {
                writePref(LAYOUT_KEY, next);
                setLayout(next);
            },
        }, onLeave: () => {
            playSound('leave');
            onLeave();
        }, onError: toast.error }));
    return (_jsxs("div", { className: "call-frame", "data-rail": expanded ? 'open' : undefined, "data-idle": hideFloating || undefined, "data-panel": side ? 'open' : undefined, children: [_jsx("div", { className: "call-rail", "data-open": expanded || undefined, "data-idle": hideFloating || undefined, children: _jsxs("div", { className: "call-rail-inner", ...holdHandlers, children: [_jsx("button", { type: "button", onClick: () => {
                                setHoldBar(false);
                                setExpanded((v) => !v);
                            }, "aria-expanded": expanded, "aria-label": expanded ? 'Fechar opções' : 'Mais opções', title: expanded ? 'Recolher' : 'Expandir', className: "rail-toggle", children: _jsx(Icon, { name: expanded ? 'right_panel_close' : 'right_panel_open', size: "1.25rem" }) }), _jsxs("div", { className: "rail-room", children: [_jsx("p", { className: "rail-room-title", children: room.title }), _jsxs("p", { className: "rail-room-sub", children: [_jsx(StatusBadge, { room: room }), _jsxs("span", { children: [tiles.length, " ", tiles.length === 1 ? 'pessoa' : 'pessoas'] })] })] }), controlsFor('rail'), _jsxs("div", { className: "rail-people", children: [_jsxs("p", { className: "rail-heading", children: ["Na chamada \u00B7 ", tiles.length] }), _jsx("ul", { "aria-label": "Na chamada", children: tiles.slice(0, 40).map((t) => (_jsxs("li", { "data-speaking": t.isSpeaking || undefined, children: [_jsx(Avatar, { name: t.name, url: t.avatarUrl, size: "sm" }), _jsxs("span", { className: "min-w-0 flex-1 truncate", children: [t.name, t.isLocal && ' (você)'] }), _jsx(Icon, { name: t.micOn ? 'mic' : 'mic_off', size: "0.95rem", label: t.micOn ? 'microfone ligado' : 'microfone desligado' })] }, t.identity))) }), tiles.length > 40 && _jsxs("p", { className: "rail-more", children: ["e mais ", tiles.length - 40, " pessoas"] })] }), _jsxs("div", { className: "rail-me", title: `${me.displayName} · ${ROLE_LABEL[me.role]}`, children: [_jsx(Avatar, { name: me.displayName, url: me.avatarUrl, size: "sm" }), _jsxs("span", { className: "min-w-0 leading-tight", children: [_jsx("span", { className: "block truncate text-[13px] font-semibold", children: me.displayName }), _jsx("span", { className: "block text-[11px] text-zinc-500", children: ROLE_LABEL[me.role] })] })] })] }) }), _jsxs("div", { className: "call-main", "data-panel": side ? 'open' : undefined, children: [_jsxs("section", { "aria-label": "Chamada", className: "call-screen", children: [_jsx("h1", { className: "sr-only", children: room.title }), state.lectureMode && (_jsx("div", { className: "mb-2 flex justify-end", children: _jsx(Badge, { tone: "warn", children: "Palco ligado" }) })), _jsxs("div", { className: "space-y-2 empty:hidden", children: [session.recording && (_jsx(Alert, { tone: "error", title: "Esta reuni\u00E3o est\u00E1 sendo gravada", children: "Sua imagem e sua voz podem aparecer na grava\u00E7\u00E3o enquanto voc\u00EA estiver com c\u00E2mera ou microfone ligados." })), state.voiceWarning && _jsx(VoiceWarning, { warning: state.voiceWarning }), state.phase.kind === 'disconnected' && (_jsx(Alert, { tone: "warning", title: "Conex\u00E3o perdida", children: _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("span", { children: "Sua conex\u00E3o de v\u00EDdeo caiu." }), _jsx(Button, { size: "sm", variant: "primary", onClick: () => void session.join(), children: "Reconectar" })] }) }))] }), _jsxs("div", { className: "min-w-0 space-y-3 pt-1", children: [_jsx(Stage, { tiles: tiles, layout: layout, pinnedId: pinnedId, onPinnedChange: setPinnedId, lectureMode: state.lectureMode, ...(me.role === 'ADMIN' && room.type === 'MEETING'
                                            ? { onStageSelf: () => void stageSelf() }
                                            : {}) }), captionsOn && _jsx(CaptionsOverlay, { captions: session.captions, now: now })] })] }), side && (_jsxs("aside", { "aria-label": "Pessoas", className: "call-panel", children: [_jsx("div", { className: "flex items-center justify-end gap-1 pb-1", children: _jsx("button", { type: "button", "aria-label": "Fechar painel", onClick: () => setSide(null), className: "icon-button h-8 w-8", children: _jsx(Icon, { name: "close", size: "1.1rem" }) }) }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto", children: _jsx(ParticipantsPanel, { room: room, me: me, version: participantsVersion, lectureMode: state.lectureMode, hands: session.hands, recording: session.recording, onInfo: toast.info, onError: toast.error }) })] }))] }), _jsx("div", { className: "call-float", "data-idle": hideFloating || undefined, ...holdHandlers, children: controlsFor('media') }), _jsx(RemoteAudio, { participants: remote })] }));
}
/**
 * Tela de `/r/:roomId` (o link que o bot manda no Discord). O fluxo completo está em
 * docs/frontend/README.md: checa o acesso, mostra o motivo de qualquer bloqueio e só
 * então conecta.
 */
/** Tempo mínimo do carregamento ao abrir a sala (0 nos testes). */
const MIN_LOADING_MS = import.meta.env.MODE === 'test' ? 0 : 1400;
export function RoomPage({ deps = defaultSessionDeps }) {
    const { roomId = '' } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const toast = useToasts();
    if (!user)
        return null; // RequireAuth garante o login
    return (_jsx(RoomPageInner, { roomId: roomId, user: user, deps: deps, navigate: navigate, toast: toast }));
}
function RoomPageInner({ roomId, user, deps, navigate, toast, }) {
    const session = useRoomSession(roomId, user.id, deps);
    const { state, room } = session;
    const phase = state.phase;
    // Chegando pelo link: o carregamento fica pelo menos um instante na tela (o bichinho aparece
    // direito, sem piscar). Só visual: a verificação de acesso segue no tempo dela.
    const [warming, setWarming] = useState(MIN_LOADING_MS > 0);
    useEffect(() => {
        if (!warming)
            return;
        const id = window.setTimeout(() => setWarming(false), MIN_LOADING_MS);
        return () => window.clearTimeout(id);
    }, [warming]);
    async function leave() {
        await session.leave();
        navigate('/');
    }
    let body;
    switch (phase.kind) {
        case 'checking':
            body = _jsx(CheckingScreen, {});
            break;
        case 'blocked':
            body = _jsx(BlockedScreen, { access: phase.access, room: room });
            break;
        case 'ready':
            body = room ? (_jsx(ReadyScreen, { room: room, onJoin: () => void session.join() })) : (_jsx(CheckingScreen, {}));
            break;
        case 'joining':
            body = _jsx(JoiningScreen, { activating: room?.type === 'LIVE' && room.mediaState === 'IDLE' });
            break;
        case 'idle':
            body = _jsx(IdleScreen, { reason: phase.reason, onActivate: () => void session.join() });
            break;
        case 'connected':
        case 'disconnected':
            body = (_jsx(ConnectedRoom, { session: session, me: user, onLeave: () => void leave(), toast: toast }));
            break;
        case 'ended':
            body = _jsx(EndedScreen, { reason: phase.reason });
            break;
        case 'removed':
            body = (_jsx(RemovedScreen, { action: phase.action, reason: phase.reason, expiresAt: phase.expiresAt }));
            break;
        case 'error':
            body = _jsx(ErrorScreen, { code: phase.code, message: phase.message, onRetry: session.retry });
            break;
    }
    if (warming && (phase.kind === 'ready' || phase.kind === 'blocked'))
        body = _jsx(CheckingScreen, {});
    // Na chamada, a tela é só a chamada: o topo do site some.
    useImmersive(phase.kind === 'connected' || phase.kind === 'disconnected');
    return (_jsxs(_Fragment, { children: [body, _jsx(ToastViewport, { toasts: toast.toasts, onDismiss: toast.dismiss })] }));
}
