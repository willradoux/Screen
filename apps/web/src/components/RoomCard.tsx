import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { isAdmin } from '../lib/moderation-rules';
import { formatDateTime } from '../lib/format';
import type { Room } from '../lib/types';
import { Badge } from './ui';
import { CoverChip, WidgetCover, WidgetStat, type Person } from './Widget';

export function StatusBadge({ room }: { room: Pick<Room, 'type' | 'status'> }) {
  if (room.status === 'OPEN') {
    return room.type === 'LIVE' ? (
      <Badge tone="live">Ao vivo</Badge>
    ) : (
      <Badge tone="open">Aberta</Badge>
    );
  }
  if (room.status === 'SCHEDULED') return <Badge tone="scheduled">Agendada</Badge>;
  if (room.status === 'CANCELED') return <Badge tone="warn">Cancelada</Badge>;
  return <Badge>Encerrada</Badge>;
}

/**
 * Uma sala (live ou reunião) como widget: capa com o degradê do tema, estado e tipo, quem está
 * na call, título em negrito, ocupação e horário, e o botão de entrar ocupando a largura.
 */
export function RoomCard({
  room,
  onChanged,
  members,
}: {
  room: Room;
  onChanged?: () => void;
  /** Quem está na call agora (lives), para mostrar na capa. */
  members?: Person[];
}) {
  const auth = useOptionalAuth();
  const canCancel = room.status === 'SCHEDULED' && !!auth?.user && isAdmin(auth.user.role);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setFailure(null);
    try {
      await api.meetings.cancel(room.id);
      onChanged?.();
    } catch (err) {
      setFailure(describeError(err));
      setBusy(false);
    }
  }

  const when =
    room.status === 'SCHEDULED'
      ? `Começa em ${formatDateTime(room.startsAt)}`
      : room.openedAt
        ? `Aberta desde ${formatDateTime(room.openedAt)}`
        : '';
  const session =
    room.type === 'LIVE' && room.status === 'OPEN'
      ? room.mediaState === 'ACTIVE'
        ? 'Sessão em uso.'
        : 'Sessão em espera: ao entrar você a ativa.'
      : null;

  const tone =
    room.status === 'OPEN'
      ? room.type === 'LIVE' && room.mediaState !== 'ACTIVE'
        ? 'idle'
        : 'live'
      : room.status === 'SCHEDULED'
        ? 'live'
        : 'off';

  return (
    <article className="widget" data-testid="room-row">
      <WidgetCover
        tone={tone}
        people={members}
        left={<StatusBadge room={room} />}
        right={
          <CoverChip icon={room.type === 'LIVE' ? 'videocam' : 'calendar_month'}>
            {room.type === 'LIVE' ? 'Live' : 'Reunião'}
          </CoverChip>
        }
      />
      <div className="widget-body">
        <div className="widget-head">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-zinc-50">
            {room.title}
          </h3>
          {room.description && (
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">
              {room.description}
            </p>
          )}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-3">
          <WidgetStat
            icon="group"
            value={`${room.participantCount}/${room.maxParticipants} ${room.participantCount === 1 ? 'pessoa' : 'pessoas'}`}
            label="na sala"
          />
          {when && (
            <WidgetStat
              icon="schedule"
              value={formatDateTime(room.status === 'SCHEDULED' ? room.startsAt : room.openedAt)}
              label={room.status === 'SCHEDULED' ? 'começa' : 'aberta desde'}
            />
          )}
        </div>

        <div className="widget-note">
          {session && <p className="text-zinc-500">{session}</p>}
          {failure && <p className="text-red-400">{failure}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {canCancel &&
            (confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancel()}
                  className="btn btn-danger btn-sm"
                >
                  Cancelar mesmo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn btn-ghost btn-sm text-red-300!"
              >
                Cancelar
              </button>
            ))}
          <Link
            to={`/r/${room.id}`}
            className={`btn ${room.status === 'OPEN' ? 'btn-primary' : 'btn-secondary'}`}
          >
            {room.status === 'OPEN' ? 'Entrar' : 'Ver sala'}
          </Link>
        </div>
      </div>
    </article>
  );
}
