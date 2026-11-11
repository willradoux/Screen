import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Badge, Button, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { ALL_SOURCES_LABEL } from '../lib/labels';
import { ROLE_LABEL, banOptions, canModerateTarget, isAdmin, isStaff, } from '../lib/moderation-rules';
import { RecordingControl } from './RecordingControl';
/** Quantas pessoas a lista desenha por vez (salas de 500 não travam). */
const PAGE = 60;
/**
 * Lista de quem está na sala. Para moderação, cada pessoa tem as ações permitidas pela
 * hierarquia (a interface só esconde o que o servidor recusaria; ele confere de novo).
 */
export function ParticipantsPanel({ room, me, version, lectureMode, hands = [], recording = false, onInfo, onError, }) {
    const [people, setPeople] = useState(null);
    const [failed, setFailed] = useState(null);
    const [pending, setPending] = useState(null);
    const [banMinutes, setBanMinutes] = useState(60);
    const [busy, setBusy] = useState(null);
    const seq = useRef(0);
    const load = useCallback(async () => {
        const id = ++seq.current;
        try {
            const list = await api.rooms.participants(room.id);
            if (id !== seq.current)
                return;
            setPeople(list);
            setFailed(null);
        }
        catch (err) {
            if (id === seq.current)
                setFailed(describeError(err));
        }
    }, [room.id]);
    // A primeira carga é na hora; depois, com muita gente entrando e saindo, recarrega no máximo
    // a cada 1,2 s (500 entradas seguidas não viram 500 pedidos).
    const first = useRef(true);
    useEffect(() => {
        if (first.current) {
            first.current = false;
            void load();
            return;
        }
        const id = setTimeout(() => void load(), 1200);
        return () => clearTimeout(id);
    }, [load, version]);
    const [query, setQuery] = useState('');
    const [shown, setShown] = useState(PAGE);
    async function run(key, fn, done) {
        setBusy(key);
        try {
            await fn();
            onInfo(done);
            setPending(null);
            void load();
        }
        catch (err) {
            onError(describeError(err));
        }
        finally {
            setBusy(null);
        }
    }
    const filtered = people?.filter((p) => !query.trim() || p.displayName.toLowerCase().includes(query.trim().toLowerCase()));
    const canStage = isAdmin(me.role) && room.type === 'MEETING';
    // Moderação só existe em reuniões; nas lives todo mundo é igual.
    const staff = isStaff(me.role) && room.type === 'MEETING';
    const options = banOptions(me.role);
    async function toggleLecture() {
        await run('lecture', () => api.rooms.update(room.id, { lectureMode: !lectureMode }), lectureMode
            ? 'Palco desligado: todo mundo pode transmitir.'
            : 'Palco ligado: ninguém transmite até um admin subir a pessoa.');
    }
    async function endRoom() {
        await run('end', () => api.rooms.end(room.id), 'Sala encerrada.');
    }
    async function muteAll() {
        await run('mute-all', async () => {
            const { affected } = await api.moderation.muteAll(room.id);
            onInfo(`Microfone desligado para ${affected} ${affected === 1 ? 'pessoa' : 'pessoas'}.`);
        }, 'Pronto.');
    }
    async function camerasOff() {
        await run('cameras-off', async () => {
            const { affected } = await api.moderation.camerasOff(room.id);
            onInfo(`Câmera e tela desligadas para ${affected} ${affected === 1 ? 'pessoa' : 'pessoas'}.`);
        }, 'Pronto.');
    }
    return (_jsxs("section", { "aria-label": "Pessoas na sala", className: "space-y-4", children: [_jsxs("header", { className: "flex items-center justify-between", children: [_jsxs("h2", { className: "font-semibold text-zinc-100", children: ["Pessoas ", people ? `(${people.length})` : ''] }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => void load(), children: "Atualizar" })] }), staff && (_jsxs("div", { className: "flex flex-wrap gap-2 pb-4", children: [_jsxs(Button, { size: "sm", variant: lectureMode ? 'primary' : 'secondary', "aria-pressed": lectureMode, loading: busy === 'lecture', onClick: () => void toggleLecture(), children: ["Palco: ", lectureMode ? 'ligado' : 'desligado'] }), _jsx(Button, { size: "sm", variant: "secondary", loading: busy === 'mute-all', onClick: () => void muteAll(), children: "Silenciar todos" }), _jsx(Button, { size: "sm", variant: "secondary", loading: busy === 'cameras-off', onClick: () => void camerasOff(), children: "Desligar c\u00E2meras" }), _jsx(Button, { size: "sm", variant: "danger", loading: busy === 'end', onClick: () => void endRoom(), children: "Encerrar sala" })] })), staff && isAdmin(me.role) && (_jsx(RecordingControl, { roomId: room.id, recording: recording, people: people ?? [], onInfo: onInfo, onError: onError })), staff && hands.length > 0 && (_jsxs("section", { "aria-label": "Querem falar", className: "space-y-2 rounded-xl bg-brand-500/10 p-3", children: [_jsxs("h3", { className: "text-sm font-semibold text-brand-300", children: ["Querem falar (", hands.length, ")"] }), _jsx("ol", { className: "space-y-2", children: hands.map((h, i) => (_jsxs("li", { className: "flex items-center gap-2", "data-testid": "hand", children: [_jsxs("span", { className: "w-5 text-xs text-zinc-500", children: [i + 1, "."] }), _jsx(Avatar, { name: h.displayName, url: h.avatarUrl, size: "sm" }), _jsx("span", { className: "min-w-0 flex-1 truncate text-sm text-zinc-100", children: h.displayName }), isAdmin(me.role) && (_jsx(Button, { size: "sm", variant: "primary", loading: busy === `hand-${h.userId}`, onClick: () => void run(`hand-${h.userId}`, () => api.moderation.promote(room.id, h.userId), `${h.displayName} subiu ao palco.`), children: "Subir ao palco" }))] }, h.userId))) })] })), people === null && !failed && _jsx(Spinner, { label: "Carregando\u2026" }), failed && _jsx(Alert, { tone: "error", children: failed }), people && people.length > PAGE && (_jsx("input", { type: "search", value: query, onChange: (e) => {
                    setQuery(e.target.value);
                    setShown(PAGE);
                }, placeholder: "Buscar pessoa", "aria-label": "Buscar pessoa", className: "h-9 w-full rounded-lg border border-zinc-700 bg-transparent px-3 text-sm text-zinc-50 placeholder:text-zinc-500" })), _jsx("ul", { className: "space-y-2", children: filtered?.slice(0, shown).map((p) => {
                    const mayModerate = staff && canModerateTarget(me, { id: p.userId, role: p.role });
                    const isPending = pending?.userId === p.userId;
                    return (_jsxs("li", { className: "rounded-xl bg-white/5 p-2", "data-testid": "person", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Avatar, { name: p.displayName, url: p.avatarUrl, size: "sm" }), _jsxs("span", { className: "min-w-0 flex-1 truncate text-sm text-zinc-100", children: [p.displayName, p.userId === me.id && _jsx("span", { className: "text-zinc-500", children: " (voc\u00EA)" })] }), p.role !== 'MEMBER' && _jsx(Badge, { tone: "scheduled", children: ROLE_LABEL[p.role] }), p.isSpeaker && _jsx(Badge, { tone: "open", children: "No palco" }), p.mutedByModeration && _jsx(Badge, { tone: "warn", children: "Silenciado" })] }), canStage && p.userId === me.id && (_jsx("div", { className: "mt-2 pl-9", children: _jsx(Button, { size: "sm", variant: p.isSpeaker ? 'secondary' : 'primary', loading: busy === `self-stage`, onClick: () => void run('self-stage', () => p.isSpeaker
                                        ? api.moderation.demote(room.id, me.id)
                                        : api.moderation.promote(room.id, me.id), p.isSpeaker ? 'Você saiu do palco.' : 'Você subiu ao palco.'), children: p.isSpeaker ? 'Sair do palco' : 'Subir ao palco' }) })), p.mutedSources.length > 0 && (_jsxs("p", { className: "mt-1 pl-9 text-xs text-zinc-500", children: ["Bloqueado: ", p.mutedSources.map((s) => ALL_SOURCES_LABEL[s]).join(', ')] })), mayModerate && !isPending && (_jsxs("div", { className: "mt-2 flex flex-wrap gap-1.5 pl-9", children: [p.mutedByModeration ? (_jsx(Button, { size: "sm", loading: busy === `unmute:${p.userId}`, onClick: () => void run(`unmute:${p.userId}`, () => api.moderation.unmute(room.id, p.userId), `${p.displayName} liberado(a).`), children: "Liberar" })) : (_jsx(Button, { size: "sm", loading: busy === `mute:${p.userId}`, onClick: () => void run(`mute:${p.userId}`, () => api.moderation.mute(room.id, p.userId), `${p.displayName} silenciado(a).`), children: "Silenciar" })), !canStage ? null : p.isSpeaker ? (_jsx(Button, { size: "sm", loading: busy === `demote:${p.userId}`, onClick: () => void run(`demote:${p.userId}`, () => api.moderation.demote(room.id, p.userId), `${p.displayName} saiu do palco.`), children: "Tirar do palco" })) : (_jsx(Button, { size: "sm", loading: busy === `promote:${p.userId}`, onClick: () => void run(`promote:${p.userId}`, () => api.moderation.promote(room.id, p.userId), `${p.displayName} subiu ao palco.`), children: "Subir ao palco" })), _jsx(Button, { size: "sm", variant: "danger", onClick: () => setPending({ userId: p.userId, action: 'kick' }), children: "Expulsar" }), _jsx(Button, { size: "sm", variant: "danger", onClick: () => setPending({ userId: p.userId, action: 'ban' }), children: "Banir" })] })), mayModerate && isPending && pending && (_jsxs("div", { className: "mt-2 space-y-2 pl-9", role: "group", "aria-label": `Confirmar ${pending.action === 'kick' ? 'expulsão' : 'banimento'}`, children: [_jsx("p", { className: "text-sm text-amber-200", children: pending.action === 'kick'
                                            ? `Expulsar ${p.displayName}? A pessoa pode voltar.`
                                            : `Banir ${p.displayName} desta sala?` }), pending.action === 'ban' && (_jsxs("label", { className: "flex items-center gap-2 text-sm text-zinc-300", children: ["Por quanto tempo", _jsx("select", { value: banMinutes, onChange: (e) => setBanMinutes(Number(e.target.value)), className: "rounded bg-zinc-950 px-2 py-1", children: options.map((o) => (_jsx("option", { value: o.minutes, children: o.label }, o.minutes))) })] })), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { size: "sm", variant: "danger", loading: busy === `${pending.action}:${p.userId}`, onClick: () => void run(`${pending.action}:${p.userId}`, () => pending.action === 'kick'
                                                    ? api.moderation.kick(room.id, p.userId)
                                                    : api.moderation.ban(room.id, p.userId, {
                                                        durationMinutes: options.some((o) => o.minutes === banMinutes)
                                                            ? banMinutes
                                                            : 60,
                                                    }), pending.action === 'kick'
                                                    ? `${p.displayName} expulso(a).`
                                                    : `${p.displayName} banido(a).`), children: "Confirmar" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setPending(null), children: "Cancelar" })] })] }))] }, p.userId));
                }) }), filtered && filtered.length > shown && (_jsxs(Button, { size: "sm", variant: "ghost", onClick: () => setShown((n) => n + PAGE), children: ["Mostrar mais (", filtered.length - shown, ")"] })), staff && isAdmin(me.role) === false && (_jsx("p", { className: "text-xs text-zinc-500", children: "Moderadores n\u00E3o podem moderar outros moderadores ou admins." }))] }));
}
