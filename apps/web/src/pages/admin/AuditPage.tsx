import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, PageTitle, Spinner, inputClass } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import type { AuditEntry } from '../../lib/types';

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

/** Quem fez: "system" é o relógio das reuniões. */
export const actorLabel = (id: string) => (id === 'system' ? 'Sistema' : id);

export function AuditPage() {
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [roomId, setRoomId] = useState('');
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

  return (
    <>
      <PageTitle description="Tudo o que admins e moderadores fizeram, com quem e quando.">
        Auditoria
      </PageTitle>

      <div className="surface rise mb-3 grid gap-4 p-4 sm:grid-cols-3">
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

      {error && <Alert tone="error">{error}</Alert>}

      <div className="surface rise rise-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs font-medium text-zinc-500">
            <tr>
              <th className="px-4 pb-2 pt-3.5">Quando</th>
              <th className="px-3 pb-2 pt-3.5">Ação</th>
              <th className="px-3 pb-2 pt-3.5">Quem</th>
              <th className="px-3 pb-2 pt-3.5">Alvo</th>
              <th className="px-4 pb-2 pt-3.5">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="transition-colors hover:bg-white/[0.04]"
                data-testid="audit-row"
              >
                <td className="whitespace-nowrap px-3 py-2 text-zinc-400">
                  {formatDateTime(e.at)}
                </td>
                <td className="px-3 py-2 text-zinc-100">{actionLabel(e.action)}</td>
                <td className="px-3 py-2 text-zinc-300">{actorLabel(e.actorId)}</td>
                <td className="px-3 py-2 text-zinc-400">{e.targetId ?? '—'}</td>
                <td className="px-3 py-2 text-zinc-400">{e.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
