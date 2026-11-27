import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalAuth } from '../auth/AuthProvider';
import { api } from '../../shared/lib/api';
import { describeError } from '../../shared/lib/errors';
import { isAdmin } from '../../shared/lib/moderation-rules';
import { formatDateTime } from '../../shared/lib/format';
import type { Room } from '../../shared/lib/types';
import { Avatar, Badge } from '../../shared/ui/ui';
import { usePersonTint } from '../../shared/lib/personColor';
import { Icon } from '../../shared/ui/Icon';
import type { Person } from '../../shared/ui/Widget';

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

  // Só o essencial embaixo do nome; o estado (ao vivo, em espera) já está na capa.
  const when = room.status === 'SCHEDULED' ? `Começa em ${formatDateTime(room.startsAt)}` : '';
  const session =
    room.type === 'LIVE' && room.status === 'OPEN' && room.mediaState !== 'ACTIVE'
      ? 'Ao entrar, você ativa a sessão.'
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
  // Capa tingida com a cor da foto de quem está na call (ou uma cor fixa da sala).
  const host = members?.[0];
  const tint = usePersonTint(host ? (host.displayName ?? host.userId) : room.id, host?.avatarUrl);
  const inCall = members?.length ?? 0;
  const names = (members ?? []).map((m) => m.displayName ?? 'alguém');
  const withWho =
    names.length === 0
      ? null
      : names.length <= 2
        ? `com ${names.join(' e ')}`
        : `com ${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;

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
      <div className="sp-cover" data-tone={tone} style={tint}>
        <span className="sp-cover-badge">
          {tone === 'idle' ? <Badge>Em espera</Badge> : <StatusBadge room={room} />}
        </span>
        {host ? (
          <span aria-hidden="true" className="sp-cover-host">
            <Avatar name={host.displayName ?? '?'} url={host.avatarUrl} size="lg" />
          </span>
        ) : (
          <span aria-hidden="true" className="sp-cover-icon">
            <Icon name={room.type === 'LIVE' ? 'videocam' : 'calendar_month'} size="2rem" />
          </span>
        )}
        {inCall > 0 && (
          <span className="sp-cover-chip">
            {inCall} {inCall === 1 ? 'pessoa na call' : 'pessoas na call'}
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
        {withWho && ` · ${withWho}`}
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
