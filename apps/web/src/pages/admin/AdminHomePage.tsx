import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  EmptyState,
  PageTitle,
  Section,
  Spinner,
  StatusDot,
} from '../../components/ui';
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
  const active = room.mediaState === 'ACTIVE';
  return (
    <li className="flex items-center gap-4 py-3">
      <StatusDot tone={active ? 'live' : 'idle'} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-50">{room.title}</p>
        <p className="tabular text-sm text-zinc-500">
          {active ? 'Em uso' : 'Em espera'} · {room.participantCount}{' '}
          {room.participantCount === 1 ? 'pessoa conectada' : 'pessoas conectadas'}
        </p>
      </div>
      <Link
        to={`/r/${room.id}`}
        className="text-sm font-medium text-brand-300 underline underline-offset-2"
      >
        Abrir
      </Link>
    </li>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <StatusDot tone={meeting.status === 'OPEN' ? 'open' : 'scheduled'} />
      <p className="min-w-0 flex-1 truncate font-medium text-zinc-50">{meeting.title}</p>
      {meeting.announced ? (
        <Badge tone="open">Divulgada</Badge>
      ) : (
        <Badge tone="warn">Não divulgada</Badge>
      )}
      <span className="tabular text-sm text-zinc-500">
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
      <PageTitle description="O que está no ar e o que ainda falta configurar.">Painel</PageTitle>
      {state.status === 'loading' && <Spinner label="Carregando…" />}
      {state.status === 'error' && (
        <Alert tone="error" title="Não foi possível carregar o painel">
          {describeError(state.error)}
        </Alert>
      )}
      {state.status === 'ready' && (
        <div className="space-y-10">
          {state.data.settings && setupChecklist(state.data.settings).some((i) => !i.done) && (
            <Alert tone="warning" title="Falta configurar">
              <ul className="list-disc pl-5">
                {setupChecklist(state.data.settings)
                  .filter((i) => !i.done)
                  .map((i) => (
                    <li key={i.text}>{i.text}</li>
                  ))}
              </ul>
              <Link to="/admin/config" className="mt-2 inline-block underline underline-offset-2">
                Ir para Configurações
              </Link>
            </Alert>
          )}

          <Section title="Sessões de live agora">
            {state.data.lives.length === 0 ? (
              <EmptyState title="Nenhuma live aberta.">
                Elas abrem sozinhas quando alguém entra numa call habilitada.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
                {state.data.lives.map((r) => (
                  <LiveRow key={r.id} room={r} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Reuniões"
            action={
              admin ? (
                <Link
                  to="/admin/reunioes"
                  className="text-sm font-medium text-brand-300 underline underline-offset-2"
                >
                  Gerenciar
                </Link>
              ) : undefined
            }
          >
            {state.data.meetings.length === 0 ? (
              <EmptyState title="Nenhuma reunião aberta ou agendada." />
            ) : (
              <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
                {state.data.meetings.map((m) => (
                  <MeetingRow key={m.id} meeting={m} />
                ))}
              </ul>
            )}
          </Section>

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
