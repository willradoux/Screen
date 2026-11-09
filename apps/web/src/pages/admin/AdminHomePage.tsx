import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Alert, Badge, Card, PageTitle, Spinner } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { isAdmin } from '../../lib/moderation-rules';
import type { Meeting, Room, Settings } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

/** O que ainda falta configurar, em frases que dizem onde ir. */
export function setupChecklist(s: Settings): { done: boolean; text: string }[] {
  return [
    {
      done: s.liveChannelIds.length > 0 || s.liveCategoryId !== null,
      text: 'Escolher as calls onde as lives acontecem',
    },
    { done: s.announceChannelId !== null, text: 'Escolher o canal de avisos das reuniões' },
    { done: s.logChannelId !== null, text: 'Escolher o canal de logs (opcional, mas ajuda muito)' },
  ];
}

function LiveRow({ room }: { room: Room }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2">
      <span className="font-medium text-zinc-100">{room.title}</span>
      {room.mediaState === 'ACTIVE' ? (
        <Badge tone="live">
          <Icon name="radio_button_checked" size="0.9rem" className="mr-1" />
          Em uso
        </Badge>
      ) : (
        <Badge>
          <Icon name="bedtime" size="0.9rem" className="mr-1" />
          Em espera
        </Badge>
      )}
      <span className="text-sm text-zinc-400">
        {room.participantCount} {room.participantCount === 1 ? 'pessoa' : 'pessoas'} conectada
        {room.participantCount === 1 ? '' : 's'}
      </span>
      <Link to={`/r/${room.id}`} className="ml-auto text-sm text-brand-300 underline">
        Abrir
      </Link>
    </li>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2">
      <span className="font-medium text-zinc-100">{meeting.title}</span>
      {meeting.status === 'OPEN' ? (
        <Badge tone="open">Aberta</Badge>
      ) : (
        <Badge tone="scheduled">Agendada</Badge>
      )}
      {meeting.announced ? (
        <Badge tone="open">Divulgada</Badge>
      ) : (
        <Badge tone="warn">Não divulgada</Badge>
      )}
      <span className="text-sm text-zinc-400">
        {formatDateTime(meeting.startsAt ?? meeting.openedAt)}
      </span>
    </li>
  );
}

/** Visão geral do servidor para quem administra ou modera. */
export function AdminHomePage() {
  const { user } = useAuth();
  const admin = !!user && isAdmin(user.role);
  const { state } = useAsync(async () => {
    const [lives, meetings, settings] = await Promise.all([
      api.rooms.list({ type: 'LIVE', status: 'OPEN', limit: 50 }),
      api.meetings.list({ limit: 20 }),
      admin ? api.settings.get() : Promise.resolve(null),
    ]);
    return { lives: lives.data, meetings, settings };
  });

  return (
    <>
      <PageTitle>Painel</PageTitle>
      {state.status === 'loading' && <Spinner label="Carregando…" />}
      {state.status === 'error' && (
        <Alert tone="error" title="Não foi possível carregar o painel">
          {describeError(state.error)}
        </Alert>
      )}
      {state.status === 'ready' && (
        <div className="space-y-6">
          {state.data.settings && setupChecklist(state.data.settings).some((i) => !i.done) && (
            <Alert tone="warning" title="Falta configurar">
              <ul className="list-disc pl-5">
                {setupChecklist(state.data.settings)
                  .filter((i) => !i.done)
                  .map((i) => (
                    <li key={i.text}>{i.text}</li>
                  ))}
              </ul>
              <Link to="/admin/config" className="mt-2 inline-block underline">
                Ir para Configurações
              </Link>
            </Alert>
          )}

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold text-zinc-50">Sessões de live agora</h2>
            {state.data.lives.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nenhuma live aberta. Elas abrem sozinhas quando alguém entra numa call habilitada.
              </p>
            ) : (
              <ul className="space-y-2">
                {state.data.lives.map((r) => (
                  <LiveRow key={r.id} room={r} />
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-50">Reuniões</h2>
              {admin && (
                <Link to="/admin/reunioes" className="text-sm text-brand-300 underline">
                  Gerenciar
                </Link>
              )}
            </div>
            {state.data.meetings.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma reunião aberta ou agendada.</p>
            ) : (
              <ul className="space-y-2">
                {state.data.meetings.map((m) => (
                  <MeetingRow key={m.id} meeting={m} />
                ))}
              </ul>
            )}
          </Card>

          {!admin && (
            <p className="text-sm text-zinc-500">
              Como moderador você acompanha as sessões e modera dentro das reuniões. Configurações e
              reuniões são só para administradores.
            </p>
          )}
        </div>
      )}
    </>
  );
}
