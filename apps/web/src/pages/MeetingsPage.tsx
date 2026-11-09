import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, PageTitle, Spinner } from '../components/ui';
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
    <Card className="space-y-2 border-brand-500/40 bg-brand-500/10">
      <p className="text-sm font-medium text-brand-300">Próxima reunião</p>
      <h2 className="text-xl font-bold text-zinc-50">{meeting.title}</h2>
      <p className="text-zinc-300">
        {formatDateTime(meeting.startsAt)}
        {left !== null && (
          <span className="text-zinc-400"> · começa em {formatDuration(left)}</span>
        )}
      </p>
      {meeting.reminders.length > 0 && (
        <p className="text-xs text-zinc-500">
          Lembretes no Discord:{' '}
          {meeting.reminders.map((r) => formatReminder(r.minutesBefore)).join(', ')} antes.
        </p>
      )}
      <Link
        to={`/r/${meeting.id}`}
        className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-400"
      >
        Ver sala
      </Link>
    </Card>
  );
}

/** Reuniões abertas e agendadas, para qualquer membro. */
export function MeetingsPage() {
  const { state } = useAsync(() => api.meetings.list({ limit: 50 }));

  return (
    <>
      <PageTitle>Reuniões</PageTitle>

      {state.status === 'loading' && <Spinner label="Carregando reuniões…" />}
      {state.status === 'error' && (
        <Alert tone="error" title="Não foi possível carregar as reuniões">
          {describeError(state.error)}
        </Alert>
      )}

      {state.status === 'ready' && state.data.length === 0 && (
        <Card className="text-center">
          <p className="text-zinc-200">Nenhuma reunião agendada.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Os avisos aparecem no canal de avisos do Discord.
          </p>
        </Card>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <div className="space-y-6">
          {state.data.find((m) => m.status === 'SCHEDULED') && (
            <NextMeeting meeting={state.data.find((m) => m.status === 'SCHEDULED')!} />
          )}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.data.map((m) => (
              <li key={m.id}>
                <RoomCard room={m} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
