import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Alert, Avatar, Badge, Button, Card, Field, PageTitle, Spinner, inputClass, } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
const SNOWFLAKE = /^\d{17,20}$/;
/** Valida o ID digitado. Devolve o motivo, ou `null` se estiver certo. */
export function validateDiscordId(value) {
    const id = value.trim();
    if (id === '')
        return 'Informe o ID do Discord da pessoa.';
    if (!SNOWFLAKE.test(id)) {
        return 'O ID do Discord tem só números (17 a 20 dígitos). No Discord, ative o Modo desenvolvedor e use “Copiar ID do usuário”.';
    }
    return null;
}
function AddForm({ onAdded }) {
    const [userId, setUserId] = useState('');
    const [role, setRole] = useState('ADMIN');
    const [note, setNote] = useState('');
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    async function submit(e) {
        e.preventDefault();
        const invalid = validateDiscordId(userId);
        if (invalid)
            return setError(invalid);
        setError(null);
        setSaving(true);
        try {
            await api.panelUsers.add({ userId: userId.trim(), role, note: note.trim() || null });
            setUserId('');
            setNote('');
            onAdded();
        }
        catch (err) {
            setError(describeError(err));
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(Card, { children: _jsxs("form", { onSubmit: (e) => void submit(e), className: "space-y-4", "aria-label": "Dar acesso ao painel", children: [_jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Dar acesso ao painel" }), _jsx("p", { className: "text-sm text-zinc-500", children: "Para quem ajuda no projeto mas n\u00E3o tem cargo de admin no Discord. A pessoa entra com o Discord dela e j\u00E1 v\u00EA o painel; n\u00E3o precisa nem estar no servidor." }), _jsx(Field, { label: "ID do Discord", htmlFor: "p-id", children: _jsx("input", { id: "p-id", className: inputClass, inputMode: "numeric", value: userId, onChange: (e) => setUserId(e.target.value), placeholder: "123456789012345678" }) }), _jsx(Field, { label: "N\u00EDvel", htmlFor: "p-role", hint: "Admin configura tudo e gerencia reuni\u00F5es. Moderador v\u00EA o painel e modera reuni\u00F5es.", children: _jsxs("select", { id: "p-role", className: inputClass, value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "ADMIN", children: "Administrador" }), _jsx("option", { value: "MOD", children: "Moderador" })] }) }), _jsx(Field, { label: "Anota\u00E7\u00E3o (opcional)", htmlFor: "p-note", hint: "S\u00F3 para voc\u00EA lembrar quem \u00E9.", children: _jsx("input", { id: "p-note", className: inputClass, maxLength: 100, value: note, onChange: (e) => setNote(e.target.value) }) }), error && _jsx(Alert, { tone: "error", children: error }), _jsx(Button, { type: "submit", variant: "primary", loading: saving, children: "Dar acesso" })] }) }));
}
function PersonRow({ person, isMe, onChanged, }) {
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    async function run(kind, fn) {
        setBusy(kind);
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
    const name = person.displayName ?? person.username ?? person.userId;
    return (_jsxs("li", { className: "surface px-4 py-3.5", "data-testid": "panel-user", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx(Avatar, { name: name, url: person.avatarUrl, size: "sm" }), _jsxs("div", { className: "min-w-0", children: [_jsxs("p", { className: "font-medium text-zinc-100", children: [name, " ", isMe && _jsx("span", { className: "text-xs text-zinc-500", children: "(voc\u00EA)" })] }), _jsxs("p", { className: "text-xs text-zinc-500", children: [person.userId, !person.inServer && ' · fora do servidor', person.note && ` · ${person.note}`] })] }), _jsx(Badge, { tone: person.role === 'ADMIN' ? 'live' : 'scheduled', children: person.role === 'ADMIN' ? 'Admin' : 'Moderador' }), _jsxs("span", { className: "ml-auto text-xs text-zinc-500", children: ["desde ", formatDateTime(person.addedAt)] })] }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [_jsxs(Button, { size: "sm", loading: busy === 'role', onClick: () => void run('role', () => api.panelUsers.add({
                            userId: person.userId,
                            role: person.role === 'ADMIN' ? 'MOD' : 'ADMIN',
                            note: person.note,
                        })), children: ["Tornar ", person.role === 'ADMIN' ? 'moderador' : 'administrador'] }), !confirm ? (_jsx(Button, { size: "sm", variant: "ghost", className: "text-red-300!", onClick: () => setConfirm(true), children: "Tirar acesso" })) : (_jsxs("span", { className: "flex flex-wrap items-center gap-2", role: "group", "aria-label": "Confirmar remo\u00E7\u00E3o", children: [_jsxs("span", { className: "text-sm text-amber-200", children: ["Tirar o acesso de ", name, "?", isMe && ' Você perderia o seu acesso extra (cargos do Discord continuam valendo).'] }), _jsx(Button, { size: "sm", variant: "danger", loading: busy === 'remove', onClick: () => void run('remove', () => api.panelUsers.remove(person.userId)), children: "Sim, tirar" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setConfirm(false), children: "Voltar" })] }))] }), error && (_jsx("div", { className: "mt-3", children: _jsx(Alert, { tone: "error", children: error }) }))] }));
}
/** Quem acessa o painel sem depender de cargo no Discord (ADMIN). */
export function PeoplePage() {
    const { user } = useAuth();
    const { state, reload } = useAsync(() => api.panelUsers.list());
    return (_jsxs(_Fragment, { children: [_jsx(PageTitle, { description: "Quem acessa o painel sem depender de cargo no Discord.", children: "Pessoas com acesso" }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[24rem_1fr]", children: [_jsx(AddForm, { onAdded: () => void reload({ silent: true }) }), _jsxs("div", { className: "space-y-4", children: [_jsx(Alert, { tone: "info", title: "Quem mais acessa o painel", children: "Quem tem cargo de administrador ou moderador no Discord (veja em Configura\u00E7\u00F5es), o dono do servidor e quem tem a permiss\u00E3o Administrador. Esta lista \u00E9 s\u00F3 para quem n\u00E3o tem nenhum desses." }), state.status === 'loading' && _jsx(Spinner, { label: "Carregando\u2026" }), state.status === 'error' && _jsx(Alert, { tone: "error", children: describeError(state.error) }), state.status === 'ready' && state.data.length === 0 && (_jsx("p", { className: "ink-soft px-1 text-sm", children: "Ningu\u00E9m foi adicionado manualmente." })), state.status === 'ready' && state.data.length > 0 && (_jsx("ul", { className: "stagger space-y-2", children: state.data.map((p) => (_jsx(PersonRow, { person: p, isMe: p.userId === user?.id, onChanged: () => void reload({ silent: true }) }, p.userId))) }))] })] })] }));
}
