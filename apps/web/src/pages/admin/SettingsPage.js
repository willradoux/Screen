import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Field, PageTitle, Spinner, inputClass } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { useAsync } from '../../lib/useAsync';
export const toForm = (s) => ({
    liveChannelIds: s.liveChannelIds,
    liveCategoryId: s.liveCategoryId ?? '',
    liveTextChannelId: s.liveTextChannelId ?? '',
    announceChannelId: s.announceChannelId ?? '',
    logChannelId: s.logChannelId ?? '',
    mentionRoleId: s.mentionRoleId ?? '',
    adminRoleIds: s.adminRoleIds,
    modRoleIds: s.modRoleIds,
    meetingAllowedRoleIds: s.meetingAllowedRoleIds,
    maxParticipantsLive: String(s.maxParticipantsLive),
    graceSeconds: String(s.graceSeconds),
    emptyLiveEndSeconds: s.emptyLiveEndSeconds === null ? '' : String(s.emptyLiveEndSeconds),
    idleSessionMinutes: String(s.idleSessionMinutes),
    activationGraceMinutes: String(s.activationGraceMinutes),
});
const sameSet = (a, b) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
/**
 * Compara o formulário com o que está salvo e monta só o que mudou (o `PATCH` não
 * mexe no resto). Devolve os erros de preenchimento, se houver.
 */
export function buildSettingsPatch(original, form) {
    const errors = [];
    const patch = {};
    // Seletores: vazio = "nenhum" (limpa).
    for (const key of [
        'liveCategoryId',
        'liveTextChannelId',
        'announceChannelId',
        'logChannelId',
        'mentionRoleId',
    ]) {
        const value = form[key];
        if (value === '') {
            if (original[key] !== null)
                patch[key] = null;
        }
        else if (value !== original[key]) {
            patch[key] = value;
        }
    }
    for (const key of [
        'liveChannelIds',
        'adminRoleIds',
        'modRoleIds',
        'meetingAllowedRoleIds',
    ]) {
        if (!sameSet(form[key], original[key]))
            patch[key] = form[key];
    }
    const int = (key, label, min, max) => {
        const n = Number(form[key]);
        if (!Number.isInteger(n) || n < min || n > max) {
            errors.push(`${label}: um número inteiro de ${min} a ${max}.`);
        }
        else if (n !== original[key])
            patch[key] = n;
    };
    int('maxParticipantsLive', 'Limite de pessoas por live', 2, 500);
    int('graceSeconds', 'Tolerância ao sair da call (segundos)', 5, 300);
    int('idleSessionMinutes', 'Minutos sem transmissão até a sessão entrar em espera', 1, 240);
    int('activationGraceMinutes', 'Minutos para começar a transmitir depois de ativar', 1, 60);
    if (form.emptyLiveEndSeconds.trim() === '') {
        if (original.emptyLiveEndSeconds !== null)
            patch.emptyLiveEndSeconds = null;
    }
    else {
        const n = Number(form.emptyLiveEndSeconds);
        if (!Number.isInteger(n) || n < 10 || n > 3600) {
            errors.push('Tempo com a call vazia: um número inteiro de 10 a 3600 segundos (ou vazio).');
        }
        else if (n !== original.emptyLiveEndSeconds)
            patch.emptyLiveEndSeconds = n;
    }
    return errors.length > 0 ? { errors } : { patch };
}
// ---------- seletores ----------
function Select({ id, value, onChange, options, empty, }) {
    // Se o item salvo foi apagado no Discord, ainda aparece (marcado) para ser trocado.
    const known = options.some((o) => o.id === value);
    return (_jsxs("select", { id: id, className: inputClass, value: value, onChange: (e) => onChange(e.target.value), children: [_jsx("option", { value: "", children: empty }), !known && value !== '' && _jsx("option", { value: value, children: "(item removido do servidor)" }), options.map((o) => (_jsx("option", { value: o.id, children: o.label }, o.id)))] }));
}
function CheckList({ legend, items, selected, onChange, emptyText, }) {
    const toggle = (id, on) => onChange(on ? [...selected, id] : selected.filter((s) => s !== id));
    const groups = [...new Set(items.map((i) => i.group ?? ''))];
    // Itens salvos que não existem mais no servidor continuam visíveis, para poderem ser removidos.
    const orphans = selected.filter((s) => !items.some((i) => i.id === s));
    return (_jsxs("fieldset", { className: "space-y-2", children: [_jsx("legend", { className: "text-sm font-medium text-zinc-200", children: legend }), items.length === 0 && _jsx("p", { className: "text-sm text-zinc-500", children: emptyText }), groups.map((group) => {
                const inGroup = items.filter((i) => (i.group ?? '') === group);
                const allOn = inGroup.every((i) => selected.includes(i.id));
                return (_jsxs("div", { className: "space-y-1", children: [group && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-zinc-500", children: group }), _jsx("button", { type: "button", className: "inline-flex min-h-6 items-center text-xs text-brand-300 underline", onClick: () => onChange(allOn
                                        ? selected.filter((s) => !inGroup.some((i) => i.id === s))
                                        : [...new Set([...selected, ...inGroup.map((i) => i.id)])]), children: allOn ? 'Desmarcar todas' : 'Marcar todas' })] })), _jsx("div", { className: "grid gap-1 sm:grid-cols-2", children: inGroup.map((i) => (_jsxs("label", { className: "flex min-h-8 items-center gap-2 text-sm text-zinc-300", children: [_jsx("input", { type: "checkbox", checked: selected.includes(i.id), onChange: (e) => toggle(i.id, e.target.checked) }), i.label] }, i.id))) })] }, group || 'sem-grupo'));
            }), orphans.map((id) => (_jsxs("label", { className: "flex min-h-8 items-center gap-2 text-sm text-amber-300", children: [_jsx("input", { type: "checkbox", checked: true, onChange: () => toggle(id, false) }), "Item removido do servidor (", id, ")"] }, id)))] }));
}
function Section({ title, hint, children }) {
    return (_jsxs(Card, { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: title }), hint && _jsx("p", { className: "mt-1 text-sm text-zinc-500", children: hint })] }), children] }));
}
// ---------- editor ----------
function SettingsEditor({ settings, channels, roles, onSaved, }) {
    const [form, setForm] = useState(toForm(settings));
    const [errors, setErrors] = useState([]);
    const [apiError, setApiError] = useState(null);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    useEffect(() => setForm(toForm(settings)), [settings]);
    const categories = channels.filter((c) => c.kind === 'category');
    const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? 'Sem categoria';
    const voices = channels
        .filter((c) => c.kind === 'voice')
        .sort((a, b) => categoryName(a.parentId).localeCompare(categoryName(b.parentId)) ||
        a.name.localeCompare(b.name));
    const texts = channels.filter((c) => c.kind === 'text');
    const textOptions = texts.map((c) => ({ id: c.id, label: `#${c.name}` }));
    const roleOptions = roles.map((r) => ({ id: r.id, label: r.name }));
    const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
    const setNum = (key) => (e) => set(key, e.target.value);
    async function submit(e) {
        e.preventDefault();
        setSaved(false);
        setApiError(null);
        const built = buildSettingsPatch(settings, form);
        if ('errors' in built)
            return setErrors(built.errors);
        setErrors([]);
        if (Object.keys(built.patch).length === 0)
            return setSaved(true);
        setSaving(true);
        try {
            onSaved(await api.settings.update(built.patch));
            setSaved(true);
        }
        catch (err) {
            setApiError(describeError(err));
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("form", { noValidate: true, onSubmit: (e) => void submit(e), className: "space-y-6", "aria-label": "Configura\u00E7\u00F5es", children: [_jsxs(Section, { title: "Calls com live", hint: "Marque as calls onde a pessoa pode transmitir tela e c\u00E2mera. Quando algu\u00E9m entra numa delas, o bot abre a sess\u00E3o e manda o link no chat da pr\u00F3pria call.", children: [_jsx(CheckList, { legend: "Calls de voz", items: voices.map((v) => ({ id: v.id, label: v.name, group: categoryName(v.parentId) })), selected: form.liveChannelIds, onChange: (ids) => set('liveChannelIds', ids), emptyText: "Nenhuma call de voz encontrada. O bot est\u00E1 no servidor certo?" }), _jsx(Field, { label: "Ou uma categoria inteira (opcional)", htmlFor: "s-cat", hint: "Todas as calls desta categoria tamb\u00E9m viram live, inclusive as criadas depois.", children: _jsx(Select, { id: "s-cat", value: form.liveCategoryId, onChange: (v) => set('liveCategoryId', v), options: categories.map((c) => ({ id: c.id, label: c.name })), empty: "Nenhuma" }) }), _jsx(Field, { label: "Canal de texto alternativo (opcional)", htmlFor: "s-live", hint: "Plano B: se o bot n\u00E3o puder escrever no chat da call, o link vai para este canal.", children: _jsx(Select, { id: "s-live", value: form.liveTextChannelId, onChange: (v) => set('liveTextChannelId', v), options: textOptions, empty: "Nenhum" }) }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Limite de pessoas por live", htmlFor: "s-max", children: _jsx("input", { id: "s-max", type: "number", min: 2, max: 100, className: inputClass, value: form.maxParticipantsLive, onChange: setNum('maxParticipantsLive') }) }), _jsx(Field, { label: "Toler\u00E2ncia ao sair da call (s)", htmlFor: "s-grace", hint: "Tempo para voltar antes de ser removido da live.", children: _jsx("input", { id: "s-grace", type: "number", min: 5, max: 300, className: inputClass, value: form.graceSeconds, onChange: setNum('graceSeconds') }) }), _jsx(Field, { label: "Encerrar a live ap\u00F3s call vazia (s)", htmlFor: "s-empty", hint: "Vazio = padr\u00E3o do servidor (60 s).", children: _jsx("input", { id: "s-empty", type: "number", min: 10, max: 3600, className: inputClass, value: form.emptyLiveEndSeconds, onChange: setNum('emptyLiveEndSeconds') }) })] })] }), _jsx(Section, { title: "Sess\u00E3o de v\u00EDdeo (economia de recursos)", hint: "A live fica aberta enquanto houver gente na call, mas o v\u00EDdeo s\u00F3 fica no ar enquanto algu\u00E9m usa. Quando ningu\u00E9m est\u00E1 transmitindo, a sess\u00E3o vai para a espera e \u00E9 ativada de novo quando algu\u00E9m entra pelo link.", children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Minutos sem c\u00E2mera/tela at\u00E9 entrar em espera", htmlFor: "s-idle", hint: "Conta a partir da \u00FAltima pessoa que parou de transmitir.", children: _jsx("input", { id: "s-idle", type: "number", min: 1, max: 240, className: inputClass, value: form.idleSessionMinutes, onChange: setNum('idleSessionMinutes') }) }), _jsx(Field, { label: "Minutos para come\u00E7ar a transmitir ao ativar", htmlFor: "s-act", hint: "Depois de ativar, algu\u00E9m precisa transmitir dentro desse prazo.", children: _jsx("input", { id: "s-act", type: "number", min: 1, max: 60, className: inputClass, value: form.activationGraceMinutes, onChange: setNum('activationGraceMinutes') }) })] }) }), _jsxs(Section, { title: "Reuni\u00F5es", children: [_jsx(Field, { label: "Canal de avisos", htmlFor: "s-ann", hint: "Onde a reuni\u00E3o \u00E9 divulgada quando voc\u00EA clica em Enviar aviso, e onde saem os lembretes.", children: _jsx(Select, { id: "s-ann", value: form.announceChannelId, onChange: (v) => set('announceChannelId', v), options: textOptions, empty: "Nenhum" }) }), _jsx(Field, { label: "Cargo marcado nos avisos", htmlFor: "s-mention", hint: "Vazio = n\u00E3o marca ningu\u00E9m.", children: _jsx(Select, { id: "s-mention", value: form.mentionRoleId, onChange: (v) => set('mentionRoleId', v), options: roleOptions, empty: "Ningu\u00E9m" }) }), _jsx(CheckList, { legend: "Cargos que podem entrar nas reuni\u00F5es", items: roleOptions, selected: form.meetingAllowedRoleIds, onChange: (ids) => set('meetingAllowedRoleIds', ids), emptyText: "Nenhum cargo encontrado." }), _jsx("p", { className: "text-xs text-zinc-500", children: "Nenhum marcado = todos os membros. Modera\u00E7\u00E3o entra sempre." })] }), _jsxs(Section, { title: "Quem administra", hint: "Quem tem estes cargos no Discord acessa o painel. O dono do servidor e quem tem a permiss\u00E3o Administrador j\u00E1 s\u00E3o admin. Para dar acesso a algu\u00E9m sem cargo, use a aba Pessoas.", children: [_jsx(CheckList, { legend: "Cargos de administrador (configuram tudo e gerenciam reuni\u00F5es)", items: roleOptions, selected: form.adminRoleIds, onChange: (ids) => set('adminRoleIds', ids), emptyText: "Nenhum cargo encontrado." }), _jsx(CheckList, { legend: "Cargos de moderador (veem o painel e moderam reuni\u00F5es)", items: roleOptions, selected: form.modRoleIds, onChange: (ids) => set('modRoleIds', ids), emptyText: "Nenhum cargo encontrado." })] }), _jsx(Section, { title: "Registro (logs)", hint: "O bot escreve neste canal o que os admins fazem e os erros do sistema, explicando o que aconteceu e o que fazer.", children: _jsx(Field, { label: "Canal de logs", htmlFor: "s-log", children: _jsx(Select, { id: "s-log", value: form.logChannelId, onChange: (v) => set('logChannelId', v), options: textOptions, empty: "Desligado" }) }) }), errors.length > 0 && (_jsx(Alert, { tone: "error", title: "Confira os campos", children: _jsx("ul", { className: "list-disc pl-5", children: errors.map((e) => (_jsx("li", { children: e }, e))) }) })), apiError && _jsx(Alert, { tone: "error", children: apiError }), saved && _jsx(Alert, { tone: "success", children: "Configura\u00E7\u00F5es salvas." }), _jsx(Button, { type: "submit", variant: "primary", loading: saving, children: "Salvar" })] }));
}
export function SettingsPage() {
    const { state } = useAsync(async () => {
        const [settings, catalog] = await Promise.all([api.settings.get(), api.guild.catalog()]);
        return { settings, ...catalog };
    });
    const [current, setCurrent] = useState(null);
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "Calls, canais, cargos e tempos do servidor.", children: "Configura\u00E7\u00F5es" }), state.status === 'loading' && _jsx(Spinner, { label: "Carregando\u2026" }), state.status === 'error' && _jsx(Alert, { tone: "error", children: describeError(state.error) }), state.status === 'ready' && (_jsx(SettingsEditor, { settings: current ?? state.data.settings, channels: state.data.channels, roles: state.data.roles, onSaved: setCurrent }))] }));
}
