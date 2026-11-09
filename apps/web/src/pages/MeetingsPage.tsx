import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, EmptyState, PageTitle, Section, Spinner } from '../components/ui';
import { RoomCard } from '../components/RoomCard';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { formatDateTime, formatDuration, formatReminder, timeUntil } from '../lib/format';
import type { Meeting } from '../lib/types';
import { useAsync } from '../lib/useAsync';

/** Relógio que atualiza a cada segundo (para a contagem regressiva). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function NextMeeting({ meeting }: { meeting: Meeting }) {
  const now = useNow();
  const left = timeUntil(meeting.startsAt, now);
  return (
    <section
      aria-label="Próxima reunião"
      className="grid gap-6 border-y border-zinc-800 py-6 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div className="space-y-2">
        <p className="text-sm font-medium text-brand-300">Próxima reunião</p>
        <h2 className="text-2xl font-semibold text-zinc-50">{meeting.title}</h2>
        <p className="text-zinc-300">{formatDateTime(meeting.startsAt)}</p>
        {meeting.reminders.length > 0 && (
          <p className="text-sm text-zinc-500">
            Lembretes no Discord:{' '}
            {meeting.reminders.map((r) => formatReminder(r.minutesBefore)).join(', ')} antes.
          </p>
        )}
      </div>
      <div className="flex items-center gap-5 sm:flex-col sm:items-end sm:gap-3">
        {left !== null && (
          <p className="tabular font-display text-2xl font-semibold text-zinc-50">
            começa em {formatDuration(left)}
          </p>
        )}
        <Link
          to={`/r/${meeting.id}`}
          className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-on-brand transition-colors hover:bg-brand-400"
        >
          Ver sala
        </Link>
      </div>
    </section>
  );
}

/** Reuniões abertas e agendadas, para qualquer membro. */
export function MeetingsPage() {
  const { state } = useAsync(() => api.meetings.list({ limit: 50 }));

  return (
    <>
      <PageTitle description="As próximas reuniões da comunidade e as que já estão abertas.">
        Reuniões
      </PageTitle>

      {state.status === 'loading' && <Spinner label="Carregando reuniões…" />}
      {state.status === 'error' && (
        <Alert tone="error" title="Não foi possível carregar as reuniões">
          {describeError(state.error)}
        </Alert>
      )}

      {state.status === 'ready' && state.data.length === 0 && (
        <EmptyState title="Nenhuma reunião agendada.">
          Os avisos aparecem no canal de avisos do Discord.
        </EmptyState>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <div className="space-y-10">
          {state.data.find((m) => m.status === 'SCHEDULED') && (
            <NextMeeting meeting={state.data.find((m) => m.status === 'SCHEDULED')!} />
          )}
          <Section title="Todas">
            <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
              {state.data.map((m) => (
                <li key={m.id}>
                  <RoomCard room={m} />
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}
