import { useState, type FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Field,
  PageTitle,
  Spinner,
  inputClass,
} from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import type { PanelUser } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

const SNOWFLAKE = /^\d{17,20}$/;

/** Valida o ID digitado. Devolve o motivo, ou `null` se estiver certo. */
export function validateDiscordId(value: string): string | null {
  const id = value.trim();
  if (id === '') return 'Informe o ID do Discord da pessoa.';
  if (!SNOWFLAKE.test(id)) {
    return 'O ID do Discord tem só números (17 a 20 dígitos). No Discord, ative o Modo desenvolvedor e use “Copiar ID do usuário”.';
  }
  return null;
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MOD'>('ADMIN');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateDiscordId(userId);
    if (invalid) return setError(invalid);
    setError(null);
    setSaving(true);
    try {
      await api.panelUsers.add({ userId: userId.trim(), role, note: note.trim() || null });
      setUserId('');
      setNote('');
      onAdded();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form
        onSubmit={(e) => void submit(e)}
        className="space-y-4"
        aria-label="Dar acesso ao painel"
      >
        <h2 className="text-lg font-semibold text-zinc-50">Dar acesso ao painel</h2>
        <p className="text-sm text-zinc-500">
          Para quem ajuda no projeto mas não tem cargo de admin no Discord. A pessoa entra com o
          Discord dela e já vê o painel; não precisa nem estar no servidor.
        </p>
        <Field label="ID do Discord" htmlFor="p-id">
          <input
            id="p-id"
            className={inputClass}
            inputMode="numeric"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="123456789012345678"
          />
        </Field>
        <Field
          label="Nível"
          htmlFor="p-role"
          hint="Admin configura tudo e gerencia reuniões. Moderador vê o painel e modera reuniões."
        >
          <select
            id="p-role"
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MOD')}
          >
            <option value="ADMIN">Administrador</option>
            <option value="MOD">Moderador</option>
          </select>
        </Field>
        <Field label="Anotação (opcional)" htmlFor="p-note" hint="Só para você lembrar quem é.">
          <input
            id="p-note"
            className={inputClass}
            maxLength={100}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" variant="primary" loading={saving}>
          Dar acesso
        </Button>
      </form>
    </Card>
  );
}

function PersonRow({
  person,
  isMe,
  onChanged,
}: {
  person: PanelUser;
  isMe: boolean;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'role' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'role' | 'remove', fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  const name = person.displayName ?? person.username ?? person.userId;
  return (
    <li className="pp-row" data-testid="panel-user">
      <div className="pp-cells">
        <span className="pp-person">
          <Avatar name={name} url={person.avatarUrl} size="md" />
          <span className="min-w-0">
            <span className="pp-name">
              {name} {isMe && <span className="text-xs text-zinc-500">(você)</span>}
            </span>
            <span className="pp-sub">
              {person.username ? `@${person.username}` : person.userId}
            </span>
          </span>
        </span>
        <span>
          <span className="pp-role" data-role={person.role}>
            {person.role === 'ADMIN' ? 'Admin' : 'Moderador'}
          </span>
        </span>
        <span className="pp-from">
          Adicionado no painel
          {!person.inServer && ' · fora do servidor'}
          {person.note && ` · ${person.note}`}
        </span>
        <span className="pp-since">desde {formatDateTime(person.addedAt)}</span>
      </div>
      <div className="pp-actions">
        <Button
          size="sm"
          loading={busy === 'role'}
          onClick={() =>
            void run('role', () =>
              api.panelUsers.add({
                userId: person.userId,
                role: person.role === 'ADMIN' ? 'MOD' : 'ADMIN',
                note: person.note,
              }),
            )
          }
        >
          Tornar {person.role === 'ADMIN' ? 'moderador' : 'administrador'}
        </Button>
        {!confirm ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-300!"
            onClick={() => setConfirm(true)}
          >
            Tirar acesso
          </Button>
        ) : (
          <span
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Confirmar remoção"
          >
            <span className="text-sm text-amber-200">
              Tirar o acesso de {name}?
              {isMe && ' Você perderia o seu acesso extra (cargos do Discord continuam valendo).'}
            </span>
            <Button
              size="sm"
              variant="danger"
              loading={busy === 'remove'}
              onClick={() => void run('remove', () => api.panelUsers.remove(person.userId))}
            >
              Sim, tirar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
          </span>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </li>
  );
}

/** Quem acessa o painel sem depender de cargo no Discord (ADMIN). */
export function PeoplePage() {
  const { user } = useAuth();
  const { state, reload } = useAsync(() => api.panelUsers.list());
  const [filter, setFilter] = useState<'ALL' | 'ADMIN' | 'MOD'>('ALL');
  const [query, setQuery] = useState('');
  const all = state.status === 'ready' ? state.data : [];
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (filter === 'ALL' || p.role === filter) &&
      (!q || [p.displayName, p.username, p.userId].some((v) => v?.toLowerCase().includes(q))),
  );
  const chips = [
    { value: 'ALL' as const, label: 'Todos', count: all.length },
    {
      value: 'ADMIN' as const,
      label: 'Admins',
      count: all.filter((p) => p.role === 'ADMIN').length,
    },
    { value: 'MOD' as const, label: 'Mods', count: all.filter((p) => p.role === 'MOD').length },
  ];

  return (
    <>
      <PageTitle description="Quem acessa o painel sem depender de cargo no Discord.">
        Pessoas com acesso
      </PageTitle>
      <div className="am-layout">
        <div className="space-y-5">
          <div className="pp-toolbar">
            <div role="radiogroup" aria-label="Mostrar" className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={filter === c.value}
                  className="chip-filter"
                  onClick={() => setFilter(c.value)}
                >
                  {c.label} <span className="tabular">{c.count}</span>
                </button>
              ))}
            </div>
            <label className="pp-search">
              <Icon name="search" size="1.1rem" />
              <span className="sr-only">Buscar pelo nome</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pelo nome"
              />
            </label>
          </div>
          {state.status === 'loading' && <Spinner label="Carregando…" />}
          {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
          {state.status === 'ready' && state.data.length === 0 && (
            <p className="ink-soft px-1 text-sm">Ninguém foi adicionado manualmente.</p>
          )}
          {state.status === 'ready' && state.data.length > 0 && shown.length === 0 && (
            <p className="ink-soft px-1 text-sm">Ninguém com esse filtro.</p>
          )}
          {state.status === 'ready' && shown.length > 0 && (
            <div className="pp-table">
              <div className="pp-head" aria-hidden="true">
                <span>Pessoa</span>
                <span>Papel</span>
                <span>De onde vem</span>
                <span>Desde</span>
              </div>
              <ul className="stagger">
                {shown.map((p) => (
                  <PersonRow
                    key={p.userId}
                    person={p}
                    isMe={p.userId === user?.id}
                    onChanged={() => void reload({ silent: true })}
                  />
                ))}
              </ul>
            </div>
          )}
          <p className="pp-foot">
            Também acessam o painel, sem estar nesta lista: quem tem cargo de administrador ou
            moderador no Discord (veja em Configurações), o dono do servidor e quem tem a permissão
            Administrador. O admin geral modera qualquer pessoa; os outros, só quem tem papel menor
            que o seu.
          </p>
        </div>
        <div className="am-side">
          <AddForm onAdded={() => void reload({ silent: true })} />
        </div>
      </div>
    </>
  );
}
