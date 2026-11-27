import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, PageTitle, Spinner, inputClass } from '../../shared/ui/ui';
import { api } from '../../shared/lib/api';
import { describeError } from '../../shared/lib/errors';
import { formatDateTime } from '../../shared/lib/format';
import type { AuditEntry } from '../../shared/lib/types';

/** Ações registradas (docs/backend/modelo-de-dados.md) com o texto para a tela. */
export const AUDIT_LABELS: Record<string, string> = {
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

export const actionLabel = (action: string) => AUDIT_LABELS[action] ?? action;

/** Tipos de registro (os filtros em pílula da tela). */
export type AuditKind = 'moderation' | 'meetings' | 'settings' | 'access' | 'system';

export const AUDIT_KINDS: { value: AuditKind; label: string }[] = [
  { value: 'moderation', label: 'Moderação' },
  { value: 'meetings', label: 'Reuniões' },
  { value: 'settings', label: 'Configurações' },
  { value: 'access', label: 'Acesso' },
  { value: 'system', label: 'Sistema' },
];

/** Em qual tipo cai cada ação. */
export function auditKind(action: string): AuditKind {
  if (
    action.startsWith('MEETING_') &&
    !['MEETING_MUTE_ALL', 'MEETING_CAMERAS_OFF'].includes(action)
  )
    return 'meetings';
  if (action === 'SETTINGS_UPDATED' || action === 'ROOM_UPDATED') return 'settings';
  if (
    ['SESSION_REVOKED', 'USER_BLOCKED', 'PANEL_USER_ADDED', 'PANEL_USER_REMOVED'].includes(action)
  )
    return 'access';
  if (action.startsWith('SESSION_') || action.startsWith('RECORDING_')) return 'system';
  return 'moderation';
}

const kindLabel = (k: AuditKind) => AUDIT_KINDS.find((x) => x.value === k)!.label;

const DAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "Hoje", "Ontem" ou "quinta-feira, 26 de novembro". */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  const text = DAY.format(d);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Quem fez: "system" é o relógio das reuniões. */
export const actorLabel = (id: string) => (id === 'system' ? 'Sistema' : id);

export function AuditPage() {
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [kind, setKind] = useState<AuditKind | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (cursor?: string) => {
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
        if (id !== seq.current) return;
        setEntries((prev) => (cursor ? [...prev, ...res.data] : res.data));
        setNext(res.page.next);
      } catch (err) {
        if (id === seq.current) setError(describeError(err));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [action, actorId, roomId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const shown = kind ? entries.filter((e) => auditKind(e.action) === kind) : entries;

  return (
    <>
      <PageTitle description="Tudo o que a moderação e a administração fizeram, com quem e quando.">
        Auditoria
      </PageTitle>

      <div role="radiogroup" aria-label="Tipo" className="rise mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={kind === null}
          className="chip-filter"
          onClick={() => setKind(null)}
        >
          Tudo
        </button>
        {AUDIT_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            className="chip-filter"
            onClick={() => setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <details className="audit-more rise mb-4">
        <summary>Mais filtros (ação, quem fez, sala)</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Ação" htmlFor="a-action">
            <select
              id="a-action"
              className={inputClass}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(AUDIT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ID de quem fez" htmlFor="a-actor">
            <input
              id="a-actor"
              className={inputClass}
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="ID da sala" htmlFor="a-room">
            <input
              id="a-room"
              className={inputClass}
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
          </Field>
        </div>
      </details>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="rise rise-2 overflow-x-auto">
        <table className="audit-table audit-v4 w-full text-left text-sm">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Ação</th>
              <th>Quem</th>
              <th>Alvo</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => {
              const day = dayLabel(e.at);
              const newDay = i === 0 || dayLabel(shown[i - 1]!.at) !== day;
              const k = auditKind(e.action);
              return (
                <Fragment key={e.id}>
                  {newDay && (
                    <tr className="audit-day">
                      <th colSpan={5} scope="colgroup">
                        {day}
                      </th>
                    </tr>
                  )}
                  <tr data-testid="audit-row" data-kind={k}>
                    <td
                      data-label="Quando"
                      className="audit-time tabular"
                      title={formatDateTime(e.at)}
                    >
                      {TIME.format(new Date(e.at))}
                    </td>
                    <td data-label="Ação" className="audit-action">
                      <span>{actionLabel(e.action)}</span>
                      <span className="audit-kind">{kindLabel(k)}</span>
                    </td>
                    <td data-label="Quem" className="audit-who">
                      {actorLabel(e.actorId)}
                    </td>
                    <td data-label="Alvo" className="audit-muted">
                      {e.targetId ?? '—'}
                    </td>
                    <td data-label="Motivo" className="audit-muted">
                      {e.reason ?? '—'}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!loading && entries.length > 0 && shown.length === 0 && !error && (
          <p className="px-3 py-6 text-center text-zinc-500">
            Nada de {kind ? kindLabel(kind).toLowerCase() : ''} nos registros carregados.
          </p>
        )}
        {!loading && entries.length === 0 && !error && (
          <p className="px-3 py-6 text-center text-zinc-500">Nenhum registro.</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {loading && <Spinner size="sm" label="Carregando…" />}
        {next && !loading && <Button onClick={() => void load(next)}>Carregar mais</Button>}
      </div>
    </>
  );
}
