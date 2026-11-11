import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { StatTile } from '../../components/Widget';
import { Alert, Badge, Button, Card, PageTitle, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
const MODE_LABEL = {
    GRID: 'Todos em grade',
    SPEAKER: 'Quem fala / tela',
    AUDIO: 'Só áudio',
    PARTICIPANT: 'Uma pessoa',
    SCREEN: 'Tela de uma pessoa',
};
const STATUS = {
    STARTING: { label: 'Iniciando', tone: 'warn' },
    RECORDING: { label: 'Gravando', tone: 'live' },
    PROCESSING: { label: 'Processando', tone: 'warn' },
    READY: { label: 'Pronta', tone: 'open' },
    FAILED: { label: 'Falhou', tone: 'warn' },
    EXPIRED: { label: 'Apagada', tone: 'neutral' },
};
export function formatSize(bytes) {
    if (bytes < 1024 * 1024)
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 ** 3)
        return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
function Row({ rec, onChanged }) {
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const s = STATUS[rec.status];
    async function remove() {
        setBusy(true);
        try {
            await api.recordings.remove(rec.id);
            onChanged();
        }
        catch (err) {
            setError(describeError(err));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("li", { className: "surface px-4 py-3.5", "data-testid": "recording", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("h2", { className: "font-semibold text-zinc-50", children: rec.title }), _jsx(Badge, { tone: s.tone, children: s.label }), _jsx("span", { className: "ml-auto text-sm text-zinc-400", children: formatDateTime(rec.startedAt) })] }), _jsxs("p", { className: "mt-1 text-sm text-zinc-500", children: [MODE_LABEL[rec.mode], rec.status === 'READY' && ` · ${formatSize(rec.sizeBytes)}`, rec.durationSec > 0 && ` · ${Math.round(rec.durationSec / 60)} min`] }), rec.status === 'READY' && rec.daysLeft !== null && (_jsxs("p", { className: `mt-1 text-sm ${rec.daysLeft <= 2 ? 'text-amber-300' : 'text-zinc-400'}`, children: [rec.daysLeft === 0
                        ? 'Será apagada hoje. Baixe agora.'
                        : `Será apagada em ${rec.daysLeft} ${rec.daysLeft === 1 ? 'dia' : 'dias'}.`, rec.downloaded ? ' Já foi baixada.' : ''] })), rec.status === 'FAILED' && rec.error && (_jsx("p", { className: "mt-1 text-sm text-red-300", children: rec.error })), rec.status === 'EXPIRED' && (_jsx("p", { className: "mt-1 text-sm text-zinc-500", children: "O prazo passou e o arquivo foi apagado." })), _jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [rec.status === 'READY' && (_jsxs("a", { href: api.recordings.downloadUrl(rec.id), className: "inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200", children: [_jsx(Icon, { name: "download" }), " Baixar"] })), (rec.status === 'READY' || rec.status === 'FAILED') && !confirm && (_jsx(Button, { size: "sm", variant: "ghost", className: "text-red-300!", onClick: () => setConfirm(true), children: "Apagar" })), confirm && (_jsxs("span", { className: "flex flex-wrap items-center gap-2", role: "group", "aria-label": "Confirmar", children: [_jsx("span", { className: "text-sm text-amber-200", children: "Apagar o arquivo? N\u00E3o d\u00E1 para desfazer." }), _jsx(Button, { size: "sm", variant: "danger", loading: busy, onClick: () => void remove(), children: "Sim, apagar" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setConfirm(false), children: "Voltar" })] }))] }), error && (_jsx("div", { className: "mt-3", children: _jsx(Alert, { tone: "error", children: error }) }))] }));
}
/**
 * Resumo em números, a partir da lista que a página já buscou: quantas estão prontas, o espaço
 * que ocupam, o tempo gravado e quantas vencem nos próximos 3 dias (para baixar a tempo).
 */
function RecordingsSummary({ items }) {
    const ready = items.filter((r) => r.status === 'READY');
    const bytes = items.reduce((sum, r) => sum + r.sizeBytes, 0);
    const minutes = Math.round(items.reduce((sum, r) => sum + r.durationSec, 0) / 60);
    const expiring = ready.filter((r) => r.daysLeft !== null && r.daysLeft <= 3).length;
    const size = bytes >= 1024 ** 3
        ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
        : `${Math.round(bytes / 1024 ** 2)} MB`;
    return (_jsxs("div", { className: "mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4", children: [_jsx(StatTile, { icon: "radio_button_checked", label: "Prontas para baixar", value: String(ready.length) }), _jsx(StatTile, { icon: "download", label: "Espa\u00E7o ocupado", value: size }), _jsx(StatTile, { icon: "schedule", label: "Tempo gravado", value: `${minutes} min` }), _jsx(StatTile, { icon: "warning", label: "Vencem em at\u00E9 3 dias", value: String(expiring), hint: expiring > 0 ? 'Baixe antes de serem apagadas' : 'Nada para correr atrás' })] }));
}
/** Gravações das reuniões: baixar dentro do prazo ou apagar (ADMIN). */
export function RecordingsPage() {
    const { state, reload } = useAsync(() => api.recordings.list());
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "Baixe ou apague as grava\u00E7\u00F5es das reuni\u00F5es.", action: _jsx(Button, { size: "sm", onClick: () => void reload(), children: "Atualizar" }), children: "Grava\u00E7\u00F5es" }), _jsx(Alert, { tone: "info", title: "Como funciona", children: "As grava\u00E7\u00F5es ficam no servidor s\u00F3 pelo prazo definido (10 dias por padr\u00E3o). Depois disso o arquivo \u00E9 apagado de vez e n\u00E3o h\u00E1 como recuperar. Baixe o que quiser guardar." }), _jsxs("div", { className: "mt-6", children: [state.status === 'loading' && _jsx(Spinner, { label: "Carregando\u2026" }), state.status === 'error' && _jsx(Alert, { tone: "error", children: describeError(state.error) }), state.status === 'ready' && state.data.length === 0 && (_jsx(Card, { className: "text-center text-zinc-400", children: "Nenhuma grava\u00E7\u00E3o ainda. Dentro de uma reuni\u00E3o aberta, use \u201CGrava\u00E7\u00E3o\u201D no painel de pessoas." })), state.status === 'ready' && state.data.length > 0 && (_jsx(RecordingsSummary, { items: state.data })), state.status === 'ready' && state.data.length > 0 && (_jsx("ul", { className: "stagger space-y-2", children: state.data.map((r) => (_jsx(Row, { rec: r, onChanged: () => void reload({ silent: true }) }, r.id))) }))] })] }));
}
