import { useState, type FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  PageTitle,
  Spinner,
  inputClass,
} from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
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
    <li className="surface px-4 py-3.5" data-testid="panel-user">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} url={person.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-zinc-100">
            {name} {isMe && <span className="text-xs text-zinc-500">(você)</span>}
          </p>
          <p className="text-xs text-zinc-500">
            {person.userId}
            {!person.inServer && ' · fora do servidor'}
            {person.note && ` · ${person.note}`}
          </p>
        </div>
        <Badge tone={person.role === 'ADMIN' ? 'live' : 'scheduled'}>
          {person.role === 'ADMIN' ? 'Admin' : 'Moderador'}
        </Badge>
        <span className="ml-auto text-xs text-zinc-500">
          desde {formatDateTime(person.addedAt)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
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

  return (
    <>
      <PageTitle description="Quem acessa o painel sem depender de cargo no Discord.">
        Pessoas com acesso
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <AddForm onAdded={() => void reload({ silent: true })} />
        <div className="space-y-4">
          <Alert tone="info" title="Quem mais acessa o painel">
            Quem tem cargo de administrador ou moderador no Discord (veja em Configurações), o dono
            do servidor e quem tem a permissão Administrador. Esta lista é só para quem não tem
            nenhum desses.
          </Alert>
          {state.status === 'loading' && <Spinner label="Carregando…" />}
          {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
          {state.status === 'ready' && state.data.length === 0 && (
            <p className="ink-soft px-1 text-sm">Ninguém foi adicionado manualmente.</p>
          )}
          {state.status === 'ready' && state.data.length > 0 && (
            <ul className="stagger space-y-2">
              {state.data.map((p) => (
                <PersonRow
                  key={p.userId}
                  person={p}
                  isMe={p.userId === user?.id}
                  onChanged={() => void reload({ silent: true })}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
