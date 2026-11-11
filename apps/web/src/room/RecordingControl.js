import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
const MODES = [
    { value: 'GRID', label: 'Todos em grade', hint: 'Todas as câmeras lado a lado.' },
    {
        value: 'SPEAKER',
        label: 'Quem fala / tela',
        hint: 'Destaca quem está falando ou a tela compartilhada.',
    },
    { value: 'AUDIO', label: 'Só o áudio', hint: 'Arquivo de áudio, bem menor.' },
    {
        value: 'PARTICIPANT',
        label: 'Uma pessoa (rosto e voz)',
        hint: 'Só a câmera e o microfone de quem você escolher.',
    },
    {
        value: 'SCREEN',
        label: 'A tela de uma pessoa',
        hint: 'Só a tela compartilhada de quem você escolher.',
    },
];
/** Começar e parar a gravação da reunião (só ADMIN). Todos na sala veem o aviso de gravação. */
export function RecordingControl({ roomId, recording, people, onInfo, onError, }) {
    const [mode, setMode] = useState('GRID');
    const [userId, setUserId] = useState('');
    const [busy, setBusy] = useState(false);
    const [currentId, setCurrentId] = useState(null);
    const single = mode === 'PARTICIPANT' || mode === 'SCREEN';
    async function start() {
        if (single && !userId)
            return onError('Escolha de quem é a gravação.');
        setBusy(true);
        try {
            const rec = await api.recordings.start(roomId, { mode, ...(single ? { userId } : {}) });
            setCurrentId(rec.id);
            onInfo('Gravação iniciada. Todos na sala foram avisados.');
        }
        catch (err) {
            onError(describeError(err));
        }
        finally {
            setBusy(false);
        }
    }
    async function stop() {
        setBusy(true);
        try {
            let id = currentId;
            if (!id) {
                const active = (await api.recordings.list()).find((r) => r.roomId === roomId && (r.status === 'RECORDING' || r.status === 'STARTING'));
                id = active?.id ?? null;
            }
            if (!id)
                return onError('Não encontrei uma gravação em andamento.');
            await api.recordings.stop(id);
            setCurrentId(null);
            onInfo('Gravação parada. O arquivo aparece em Gravações quando ficar pronto.');
        }
        catch (err) {
            onError(describeError(err));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("section", { "aria-label": "Grava\u00E7\u00E3o", className: "space-y-3 rounded-xl bg-zinc-950/60 p-3", children: [_jsxs("h3", { className: "flex items-center gap-2 text-sm font-semibold text-zinc-100", children: [_jsx(Icon, { name: "radio_button_checked", className: recording ? 'text-red-400' : 'text-zinc-500' }), "Grava\u00E7\u00E3o ", recording ? '(gravando)' : ''] }), recording ? (_jsx(Button, { size: "sm", variant: "danger", loading: busy, onClick: () => void stop(), children: "Parar grava\u00E7\u00E3o" })) : (_jsxs(_Fragment, { children: [_jsx("label", { className: "block text-xs text-zinc-400", htmlFor: "rec-mode", children: "O que gravar" }), _jsx("select", { id: "rec-mode", value: mode, onChange: (e) => setMode(e.target.value), className: "w-full rounded-lg bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100", children: MODES.map((m) => (_jsx("option", { value: m.value, children: m.label }, m.value))) }), _jsx("p", { className: "text-xs text-zinc-500", children: MODES.find((m) => m.value === mode)?.hint }), single && (_jsxs("select", { "aria-label": "Pessoa a gravar", value: userId, onChange: (e) => setUserId(e.target.value), className: "w-full rounded-lg bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100", children: [_jsx("option", { value: "", children: "Escolha a pessoa\u2026" }), people.map((p) => (_jsx("option", { value: p.userId, children: p.displayName }, p.userId)))] })), _jsx(Button, { size: "sm", variant: "primary", loading: busy, onClick: () => void start(), children: "Come\u00E7ar a gravar" })] })), _jsx("p", { className: "text-xs text-zinc-500", children: "O arquivo fica no servidor e voc\u00EA tem alguns dias para baixar; depois ele \u00E9 apagado." })] }));
}
