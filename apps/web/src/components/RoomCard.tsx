import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { isAdmin } from '../lib/moderation-rules';
import { formatDateTime } from '../lib/format';
import type { Room } from '../lib/types';
import { Badge } from './ui';
import { Icon } from './Icon';
import { AvatarStack, type Person } from './Widget';

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
 * Uma sala (live ou reunião) como card: capa com o degradê do tema, o estado e quem está na
 * call; embaixo, o nome em negrito e as informações em cinza. O botão redondo de entrar aparece
 * na capa ao passar o mouse (sempre visível no toque e no foco); clicar no card também entra.
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
  const titleId = useId();
  const navigate = useNavigate();

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

  const open = room.status === 'OPEN';
  const people = `${room.participantCount}/${room.maxParticipants} ${
    room.participantCount === 1 ? 'pessoa' : 'pessoas'
  }`;

  return (
    <article
      className="sp-card"
      data-testid="room-row"
      aria-labelledby={titleId}
      onClick={(e) => {
        // O card inteiro leva para a sala (o botão redondo é o caminho do teclado).
        if ((e.target as HTMLElement).closest('a, button')) return;
        navigate(`/r/${room.id}`);
      }}
    >
      <div className="sp-cover" data-tone={tone}>
        <span className="sp-cover-badge">
          <StatusBadge room={room} />
        </span>
        {members && members.length > 0 ? (
          <AvatarStack people={members} max={4} />
        ) : (
          <span aria-hidden="true" className="sp-cover-icon">
            <Icon name={room.type === 'LIVE' ? 'videocam' : 'calendar_month'} size="2rem" />
          </span>
        )}
        <Link
          to={`/r/${room.id}`}
          aria-label={open ? 'Entrar' : 'Ver sala'}
          aria-describedby={titleId}
          title={open ? 'Entrar' : 'Ver sala'}
          className="sp-play"
          data-open={open || undefined}
        >
          <Icon name={open ? 'play_arrow' : 'arrow_forward'} size="1.5rem" />
        </Link>
      </div>

      <h3 id={titleId} className="sp-card-title">
        {room.title}
      </h3>
      <p className="sp-card-sub">
        {room.type === 'LIVE' ? 'Live' : 'Reunião'} · {people}
      </p>
      {when && <p className="sp-card-sub">{when}</p>}
      {room.description && <p className="sp-card-desc">{room.description}</p>}
      {session && <p className="sp-card-note">{session}</p>}
      {failure && <p className="sp-card-note text-red-400">{failure}</p>}

      {canCancel && (
        <div className="sp-card-actions">
          {confirming ? (
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
          )}
        </div>
      )}
    </article>
  );
}
