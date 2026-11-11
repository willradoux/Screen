import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Field, PageTitle, Section, Spinner, inputClass, } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { CoverChip, WidgetCover } from '../../components/Widget';
import { StatusBadge } from '../../components/RoomCard';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime, formatReminder, isoToLocalInput, localInputToIso } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
const REMINDER_CHOICES = [
    { minutes: 1440, label: '24 h antes' },
    { minutes: 60, label: '1 h antes' },
    { minutes: 5, label: '5 min antes' },
];
export const emptyForm = {
    title: '',
    description: '',
    when: '',
    announce: false,
    reminders: [1440, 60, 5],
};
/** Valida o formulário e monta o corpo da API. Devolve o erro em texto, ou o corpo. */
export function buildMeetingInput(v, now = Date.now()) {
    const title = v.title.trim();
    if (title.length < 3)
        return { error: 'O título precisa ter pelo menos 3 caracteres.' };
    if (title.length > 100)
        return { error: 'O título pode ter no máximo 100 caracteres.' };
    if (v.description.length > 1000)
        return { error: 'A descrição pode ter no máximo 1000 caracteres.' };
    let startsAt = null;
    if (v.when) {
        startsAt = localInputToIso(v.when);
        if (!startsAt)
            return { error: 'Data e hora inválidas.' };
        if (new Date(startsAt).getTime() < now + 2 * 60_000) {
            return { error: 'O horário precisa estar pelo menos 2 minutos no futuro.' };
        }
    }
    return {
        input: {
            title,
            description: v.description.trim() || null,
            startsAt,
            announce: v.announce,
            // Reunião imediata não tem lembretes.
            ...(startsAt ? { reminders: [...v.reminders].sort((a, b) => b - a) } : {}),
        },
    };
}
function MeetingForm({ onCreated }) {
    const [values, setValues] = useState(emptyForm);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    async function submit(e) {
        e.preventDefault();
        const built = buildMeetingInput(values);
        if ('error' in built)
            return setError(built.error);
        setError(null);
        setSaving(true);
        try {
            const meeting = await api.meetings.create(built.input);
            setValues(emptyForm);
            onCreated(meeting);
        }
        catch (err) {
            setError(describeError(err));
        }
        finally {
            setSaving(false);
        }
    }
    const scheduled = values.when !== '';
    return (_jsx(Card, { children: _jsxs("form", { onSubmit: (e) => void submit(e), className: "space-y-4", "aria-label": "Nova reuni\u00E3o", children: [_jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Nova reuni\u00E3o" }), _jsx(Field, { label: "T\u00EDtulo", htmlFor: "m-title", children: _jsx("input", { id: "m-title", className: inputClass, value: values.title, maxLength: 100, onChange: (e) => setValues({ ...values, title: e.target.value }), required: true }) }), _jsx(Field, { label: "Descri\u00E7\u00E3o (pauta)", htmlFor: "m-desc", children: _jsx("textarea", { id: "m-desc", className: inputClass, rows: 3, value: values.description, maxLength: 1000, onChange: (e) => setValues({ ...values, description: e.target.value }) }) }), _jsx(Field, { label: "Quando", htmlFor: "m-when", hint: "Deixe em branco para abrir agora. O hor\u00E1rio \u00E9 o do seu navegador.", children: _jsx("input", { id: "m-when", type: "datetime-local", className: inputClass, value: values.when, onChange: (e) => setValues({ ...values, when: e.target.value }) }) }), scheduled && (_jsxs("fieldset", { className: "space-y-2", children: [_jsx("legend", { className: "text-sm font-medium text-zinc-200", children: "Lembretes no Discord" }), _jsx("div", { className: "flex flex-wrap gap-4", children: REMINDER_CHOICES.map((r) => (_jsxs("label", { className: "flex min-h-8 items-center gap-2 text-sm text-zinc-300", children: [_jsx("input", { type: "checkbox", checked: values.reminders.includes(r.minutes), onChange: (e) => setValues({
                                            ...values,
                                            reminders: e.target.checked
                                                ? [...values.reminders, r.minutes]
                                                : values.reminders.filter((m) => m !== r.minutes),
                                        }) }), r.label] }, r.minutes))) })] })), _jsxs("label", { className: "flex min-h-8 items-center gap-2 text-sm text-zinc-300", children: [_jsx("input", { type: "checkbox", checked: values.announce, onChange: (e) => setValues({ ...values, announce: e.target.checked }) }), "Divulgar no Discord j\u00E1 ao criar"] }), _jsx("p", { className: "-mt-2 text-xs text-zinc-500", children: "Se deixar desmarcado, a reuni\u00E3o fica s\u00F3 aqui no site, com data e hora, e voc\u00EA divulga quando quiser com o bot\u00E3o \u201CEnviar aviso\u201D." }), error && _jsx(Alert, { tone: "error", children: error }), _jsx(Button, { type: "submit", variant: "primary", loading: saving, children: scheduled ? 'Agendar reunião' : 'Criar e abrir agora' })] }) }));
}
function ReportView({ report }) {
    return (_jsxs("div", { className: "mt-3 space-y-2 rounded-lg bg-zinc-950/60 p-3 text-sm", children: [_jsxs("p", { className: "text-zinc-300", children: ["Dura\u00E7\u00E3o: ", _jsxs("strong", { children: [report.durationMinutes, " min"] }), " \u00B7 Participantes:", ' ', _jsx("strong", { children: report.attendees.length }), " \u00B7 Pico:", ' ', _jsx("strong", { children: report.peakParticipants })] }), _jsxs("table", { className: "w-full text-left", children: [_jsx("thead", { className: "text-xs uppercase text-zinc-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-1", children: "Pessoa" }), _jsx("th", { children: "Entrou" }), _jsx("th", { children: "Saiu" }), _jsx("th", { className: "text-right", children: "Minutos" })] }) }), _jsx("tbody", { children: report.attendees.map((a) => (_jsxs("tr", { className: "", children: [_jsx("td", { className: "py-1 text-zinc-100", children: a.displayName }), _jsx("td", { className: "text-zinc-400", children: formatDateTime(a.joinedAt) }), _jsx("td", { className: "text-zinc-400", children: formatDateTime(a.leftAt) }), _jsx("td", { className: "text-right text-zinc-100", children: a.minutes })] }, a.userId))) })] }), report.attendees.length === 0 && _jsx("p", { className: "text-zinc-500", children: "Ningu\u00E9m participou." })] }));
}
function MeetingRow({ meeting, onChanged }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [editing, setEditing] = useState(false);
    const [when, setWhen] = useState(isoToLocalInput(meeting.startsAt));
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [report, setReport] = useState(null);
    async function run(key, fn) {
        setBusy(key);
        setError(null);
        try {
            await fn();
            onChanged();
        }
        catch (err) {
            setError(describeError(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function reschedule() {
        const iso = localInputToIso(when);
        if (!iso)
            return setError('Data e hora inválidas.');
        if (new Date(iso).getTime() < Date.now() + 2 * 60_000) {
            return setError('O horário precisa estar pelo menos 2 minutos no futuro.');
        }
        await run('reschedule', async () => {
            await api.meetings.update(meeting.id, { startsAt: iso });
            setEditing(false);
        });
    }
    return (_jsxs("li", { className: "widget", "data-testid": "meeting-row", children: [_jsx(WidgetCover, { tone: meeting.status === 'ENDED' || meeting.status === 'CANCELED' ? 'off' : 'live', left: _jsxs(_Fragment, { children: [_jsx(StatusBadge, { room: meeting }), (meeting.status === 'SCHEDULED' || meeting.status === 'OPEN') &&
                            (meeting.announced ? (_jsx(Badge, { tone: "open", children: "Divulgada no Discord" })) : (_jsx(Badge, { tone: "warn", children: "Ainda n\u00E3o divulgada" })))] }), right: _jsx(CoverChip, { icon: "schedule", children: formatDateTime(meeting.startsAt ?? meeting.openedAt) }) }), _jsxs("div", { className: "widget-body", children: [_jsx("h3", { className: "text-[15px] font-bold leading-snug text-zinc-50", children: meeting.title }), !meeting.announced &&
                        meeting.reminders.length > 0 &&
                        (meeting.status === 'SCHEDULED' || meeting.status === 'OPEN') && (_jsx("p", { className: "text-xs text-zinc-500", children: "Os lembretes s\u00F3 come\u00E7am depois de divulgar." })), meeting.reminders.length > 0 && meeting.status === 'SCHEDULED' && (_jsxs("p", { className: "flex flex-wrap items-center justify-center gap-1 text-xs text-zinc-500", children: ["Lembretes:", ' ', meeting.reminders.map((r) => (_jsxs(Badge, { tone: r.sent ? 'open' : 'neutral', children: [formatReminder(r.minutesBefore), r.sent ? (_jsx(Icon, { name: "check", size: "0.9rem", className: "ml-0.5", label: "enviado" })) : null] }, r.minutesBefore)))] })), _jsxs("div", { className: "mt-auto flex flex-wrap justify-center gap-2 pt-1", children: [_jsx(Link, { to: `/r/${meeting.id}`, className: "btn btn-secondary btn-sm", children: "Abrir p\u00E1gina da sala" }), (meeting.status === 'SCHEDULED' || meeting.status === 'OPEN') && (_jsx(Button, { size: "sm", variant: meeting.announced ? 'secondary' : 'primary', loading: busy === 'announce', onClick: () => void run('announce', () => api.meetings.announce(meeting.id, meeting.announced)), children: meeting.announced ? 'Enviar de novo' : 'Enviar aviso' })), meeting.status === 'SCHEDULED' && (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", loading: busy === 'open', onClick: () => void run('open', () => api.meetings.open(meeting.id)), children: "Abrir agora" }), _jsx(Button, { size: "sm", onClick: () => setEditing((v) => !v), children: "Reagendar" }), _jsx(Button, { size: "sm", variant: "ghost", className: "text-red-300!", onClick: () => setConfirmCancel(true), children: "Cancelar" })] })), meeting.status === 'OPEN' && (_jsx(Button, { size: "sm", variant: "ghost", className: "text-red-300!", loading: busy === 'end', onClick: () => void run('end', () => api.rooms.end(meeting.id)), children: "Encerrar" })), meeting.status === 'ENDED' && (_jsx(Button, { size: "sm", loading: busy === 'report', onClick: () => void run('report', async () => setReport(await api.meetings.report(meeting.id))), children: "Ver relat\u00F3rio" }))] }), editing && (_jsxs("div", { className: "mt-3 flex flex-wrap items-end gap-2", children: [_jsx(Field, { label: "Novo hor\u00E1rio", htmlFor: `w-${meeting.id}`, children: _jsx("input", { id: `w-${meeting.id}`, type: "datetime-local", className: inputClass, value: when, onChange: (e) => setWhen(e.target.value) }) }), _jsx(Button, { size: "sm", variant: "primary", loading: busy === 'reschedule', onClick: () => void reschedule(), children: "Salvar" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setEditing(false), children: "Fechar" })] })), confirmCancel && (_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", role: "group", "aria-label": "Confirmar cancelamento", children: [_jsxs("span", { className: "text-sm text-amber-200", children: ["Cancelar \u201C", meeting.title, "\u201D? O canal ser\u00E1 avisado."] }), _jsx(Button, { size: "sm", variant: "danger", loading: busy === 'cancel', onClick: () => void run('cancel', () => api.meetings.cancel(meeting.id)), children: "Sim, cancelar" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setConfirmCancel(false), children: "Voltar" })] })), error && (_jsx("div", { className: "mt-3", children: _jsx(Alert, { tone: "error", children: error }) })), report && _jsx(ReportView, { report: report })] })] }));
}
/** Criar, agendar, reagendar, abrir, cancelar e ver o relatório das reuniões (ADMIN). */
export function AdminMeetingsPage() {
    const { state, reload } = useAsync(async () => {
        const [active, ended] = await Promise.all([
            api.meetings.list({ limit: 100 }),
            api.meetings.list({ status: 'ENDED', limit: 20 }),
        ]);
        return { active, ended };
    });
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "Crie, agende e divulgue reuni\u00F5es; abra, cancele e veja o relat\u00F3rio.", children: "Gerenciar reuni\u00F5es" }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[24rem_1fr]", children: [_jsx(MeetingForm, { onCreated: () => void reload({ silent: true }) }), _jsxs("div", { className: "space-y-6", children: [state.status === 'loading' && _jsx(Spinner, { label: "Carregando reuni\u00F5es\u2026" }), state.status === 'error' && _jsx(Alert, { tone: "error", children: describeError(state.error) }), state.status === 'ready' && (_jsxs(_Fragment, { children: [_jsx(Section, { title: "Abertas e agendadas", count: state.data.active.length, description: "Divulgue, abra, reagende ou cancele. O aviso vai para o canal de avisos do Discord.", children: state.data.active.length === 0 ? (_jsx("p", { className: "ink-soft px-1 text-sm", children: "Nenhuma reuni\u00E3o aberta ou agendada. Crie uma no formul\u00E1rio ao lado." })) : (_jsx("ul", { className: "widget-grid widget-grid-fill stagger", children: state.data.active.map((m) => (_jsx(MeetingRow, { meeting: m, onChanged: () => void reload({ silent: true }) }, m.id))) })) }), _jsx(Section, { title: "Encerradas recentemente", count: state.data.ended.length, description: "As \u00FAltimas que terminaram, com o relat\u00F3rio de presen\u00E7a.", children: state.data.ended.length === 0 ? (_jsx("p", { className: "ink-soft px-1 text-sm", children: "Nenhuma reuni\u00E3o encerrada ainda." })) : (_jsx("ul", { className: "widget-grid widget-grid-fill stagger", children: state.data.ended.map((m) => (_jsx(MeetingRow, { meeting: m, onChanged: () => void reload({ silent: true }) }, m.id))) })) })] }))] })] })] }));
}
