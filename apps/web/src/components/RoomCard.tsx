import { Link } from 'react-router-dom';
import { formatDateTime } from '../lib/format';
import type { Room } from '../lib/types';
import { Badge, StatusDot } from './ui';

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

function dotFor(room: Room) {
  if (room.status === 'OPEN') {
    if (room.type === 'LIVE') return room.mediaState === 'ACTIVE' ? 'live' : 'idle';
    return 'open';
  }
  return room.status === 'SCHEDULED' ? 'scheduled' : 'off';
}

/**
 * Uma sala (live ou reunião) como linha de lista: estado, título, ocupação e a ação de entrar.
 * Listas de linhas com régua leem mais rápido que uma grade de cartões iguais.
 */
export function RoomCard({ room }: { room: Room }) {
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

  return (
    <div className="flex items-center gap-4 py-4" data-testid="room-row">
      <StatusDot tone={dotFor(room)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="truncate text-base font-semibold text-zinc-50">{room.title}</h3>
          <StatusBadge room={room} />
        </div>
        {room.description && (
          <p className="mt-0.5 line-clamp-1 text-sm text-zinc-400">{room.description}</p>
        )}
        <p className="tabular mt-0.5 text-sm text-zinc-500">
          {room.type === 'LIVE' ? 'Live' : 'Reunião'} · {room.participantCount}/
          {room.maxParticipants} {room.participantCount === 1 ? 'pessoa' : 'pessoas'}
          {when && ` · ${when}`}
        </p>
        {session && <p className="text-xs text-zinc-500">{session}</p>}
      </div>
      <Link
        to={`/r/${room.id}`}
        className="inline-flex h-9 shrink-0 items-center rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
      >
        {room.status === 'OPEN' ? 'Entrar' : 'Ver sala'}
      </Link>
    </div>
  );
}
