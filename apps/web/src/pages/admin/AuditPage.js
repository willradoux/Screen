import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, PageTitle, Spinner, inputClass } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
/** Ações registradas (docs/backend/modelo-de-dados.md) com o texto para a tela. */
export const AUDIT_LABELS = {
    PARTICIPANT_MUTED: 'Silenciou participante',
    PARTICIPANT_UNMUTED: 'Liberou participante',
    PARTICIPANT_KICKED: 'Expulsou participante',
    PARTICIPANT_BANNED: 'Baniu participante',
    BAN_REMOVED: 'Removeu banimento',
    SPEAKER_PROMOTED: 'Promoveu a palestrante',
    SPEAKER_DEMOTED: 'Removeu de palestrante',
    ROOM_ENDED: 'Encerrou sala',
    ROOM_UPDATED: 'Editou sala',
    MEETING_CREATED: 'Criou reunião',
    MEETING_UPDATED: 'Editou reunião',
    MEETING_CANCELED: 'Cancelou reunião',
    MEETING_OPENED: 'Abriu reunião',
    SETTINGS_UPDATED: 'Alterou configurações',
    SESSION_REVOKED: 'Revogou sessão',
    USER_BLOCKED: 'Bloqueou usuário',
    PANEL_USER_ADDED: 'Deu acesso ao painel',
    PANEL_USER_REMOVED: 'Tirou acesso ao painel',
    SESSION_IDLE: 'Sessão de vídeo em espera',
    SESSION_ACTIVATED: 'Sessão de vídeo ativada',
    MEETING_ANNOUNCED: 'Divulgou reunião',
    MEETING_MUTE_ALL: 'Silenciou todos na reunião',
    MEETING_CAMERAS_OFF: 'Desligou todas as câmeras',
    RECORDING_STARTED: 'Começou uma gravação',
    RECORDING_STOPPED: 'Parou uma gravação',
    RECORDING_DOWNLOADED: 'Baixou uma gravação',
    RECORDING_DELETED: 'Apagou uma gravação',
    RECORDING_EXPIRED: 'Gravação apagada pelo prazo',
};
export const actionLabel = (action) => AUDIT_LABELS[action] ?? action;
/** Quem fez: "system" é o relógio das reuniões. */
export const actorLabel = (id) => (id === 'system' ? 'Sistema' : id);
export function AuditPage() {
    const [action, setAction] = useState('');
    const [actorId, setActorId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [entries, setEntries] = useState([]);
    const [next, setNext] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const seq = useRef(0);
    const load = useCallback(async (cursor) => {
        const id = ++seq.current;
        setLoading(true);
        setError(null);
        try {
            const res = await api.audit.list({
                limit: 50,
                ...(action ? { action } : {}),
                ...(actorId.trim() ? { actorId: actorId.trim() } : {}),
                ...(roomId.trim() ? { roomId: roomId.trim() } : {}),
                ...(cursor ? { cursor } : {}),
            });
            if (id !== seq.current)
                return;
            setEntries((prev) => (cursor ? [...prev, ...res.data] : res.data));
            setNext(res.page.next);
        }
        catch (err) {
            if (id === seq.current)
                setError(describeError(err));
        }
        finally {
            if (id === seq.current)
                setLoading(false);
        }
    }, [action, actorId, roomId]);
    useEffect(() => {
        void load();
    }, [load]);
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "Tudo o que admins e moderadores fizeram, com quem e quando.", children: "Auditoria" }), _jsxs("div", { className: "surface rise mb-3 grid gap-4 p-4 sm:grid-cols-3", children: [_jsx(Field, { label: "A\u00E7\u00E3o", htmlFor: "a-action", children: _jsxs("select", { id: "a-action", className: inputClass, value: action, onChange: (e) => setAction(e.target.value), children: [_jsx("option", { value: "", children: "Todas" }), Object.entries(AUDIT_LABELS).map(([value, label]) => (_jsx("option", { value: value, children: label }, value)))] }) }), _jsx(Field, { label: "ID de quem fez", htmlFor: "a-actor", children: _jsx("input", { id: "a-actor", className: inputClass, value: actorId, onChange: (e) => setActorId(e.target.value), inputMode: "numeric" }) }), _jsx(Field, { label: "ID da sala", htmlFor: "a-room", children: _jsx("input", { id: "a-room", className: inputClass, value: roomId, onChange: (e) => setRoomId(e.target.value) }) })] }), error && _jsx(Alert, { tone: "error", children: error }), _jsxs("div", { className: "surface rise rise-2 overflow-x-auto", children: [_jsxs("table", { className: "audit-table w-full text-left text-sm", children: [_jsx("thead", { className: "text-xs font-medium text-zinc-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 pb-2 pt-3.5", children: "Quando" }), _jsx("th", { className: "px-3 pb-2 pt-3.5", children: "A\u00E7\u00E3o" }), _jsx("th", { className: "px-3 pb-2 pt-3.5", children: "Quem" }), _jsx("th", { className: "px-3 pb-2 pt-3.5", children: "Alvo" }), _jsx("th", { className: "px-4 pb-2 pt-3.5", children: "Motivo" })] }) }), _jsx("tbody", { children: entries.map((e) => (_jsxs("tr", { className: "transition-colors hover:bg-white/[0.04]", "data-testid": "audit-row", children: [_jsx("td", { "data-label": "Quando", className: "whitespace-nowrap px-3 py-2 text-zinc-400", children: formatDateTime(e.at) }), _jsx("td", { "data-label": "A\u00E7\u00E3o", className: "px-3 py-2 text-zinc-100", children: actionLabel(e.action) }), _jsx("td", { "data-label": "Quem", className: "px-3 py-2 text-zinc-300", children: actorLabel(e.actorId) }), _jsx("td", { "data-label": "Alvo", className: "px-3 py-2 text-zinc-400", children: e.targetId ?? '—' }), _jsx("td", { "data-label": "Motivo", className: "px-3 py-2 text-zinc-400", children: e.reason ?? '—' })] }, e.id))) })] }), !loading && entries.length === 0 && !error && (_jsx("p", { className: "px-3 py-6 text-center text-zinc-500", children: "Nenhum registro." }))] }), _jsxs("div", { className: "mt-4 flex items-center gap-3", children: [loading && _jsx(Spinner, { size: "sm", label: "Carregando\u2026" }), next && !loading && _jsx(Button, { onClick: () => void load(next), children: "Carregar mais" })] })] }));
}
