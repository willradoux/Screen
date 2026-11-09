import { Link } from 'react-router-dom';
import { formatDateTime } from '../lib/format';
import type { Room } from '../lib/types';
import { Badge, Card } from './ui';

export function StatusBadge({ room }: { room: Pick<Room, 'type' | 'status'> }) {
  if (room.status === 'OPEN') {
    return room.type === 'LIVE' ? (
      <Badge tone="live">● Ao vivo</Badge>
    ) : (
      <Badge tone="open">Aberta</Badge>
    );
  }
  if (room.status === 'SCHEDULED') return <Badge tone="scheduled">Agendada</Badge>;
  if (room.status === 'CANCELED') return <Badge tone="warn">Cancelada</Badge>;
  return <Badge>Encerrada</Badge>;
}

/** Cartão de uma sala (live ou reunião) com link para entrar. */
export function RoomCard({ room }: { room: Room }) {
  const when =
    room.status === 'SCHEDULED'
      ? `Começa em ${formatDateTime(room.startsAt)}`
      : room.openedAt
        ? `Aberta desde ${formatDateTime(room.openedAt)}`
        : '';

  return (
    <Card className="flex flex-col gap-3 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-50">{room.title}</h3>
        <StatusBadge room={room} />
      </div>
      {room.description && <p className="line-clamp-2 text-sm text-zinc-400">{room.description}</p>}
      {room.type === 'LIVE' && room.status === 'OPEN' && (
        <p className="text-xs text-zinc-500">
          {room.mediaState === 'ACTIVE'
            ? 'Sessão em uso.'
            : 'Sessão em espera: ao entrar você a ativa.'}
        </p>
      )}
      <p className="text-sm text-zinc-500">
        {room.type === 'LIVE' ? 'Live' : 'Reunião'} · {room.participantCount}/{room.maxParticipants}{' '}
        {room.participantCount === 1 ? 'pessoa' : 'pessoas'}
        {when && ` · ${when}`}
      </p>
      <Link
        to={`/r/${room.id}`}
        className="mt-auto inline-flex w-fit items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        {room.status === 'OPEN' ? 'Entrar' : 'Ver sala'}
      </Link>
    </Card>
  );
}
