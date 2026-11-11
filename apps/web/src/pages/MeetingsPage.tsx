import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader } from '../components/Loader';
import { Alert, EmptyState, PageTitle, Section } from '../components/ui';
import { RoomCard } from '../components/RoomCard';
import { CoverChip, WidgetCover, WidgetStat } from '../components/Widget';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { formatDateTime, formatDuration, formatReminder, timeUntil } from '../lib/format';
import type { Meeting } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { usePolling } from '../lib/usePolling';

/** Relógio que atualiza a cada segundo (para a contagem regressiva). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Quebra o tempo que falta em blocos grandes (dias, horas, minutos, segundos). */
function countdownParts(ms: number): { value: string; unit: string }[] {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const parts = [
    { value: pad(h), unit: h === 1 ? 'hora' : 'horas' },
    { value: pad(m), unit: 'min' },
    { value: pad(sec), unit: 'seg' },
  ];
  return d > 0 ? [{ value: String(d), unit: d === 1 ? 'dia' : 'dias' }, ...parts] : parts;
}

/**
 * A próxima reunião em destaque, grande, à esquerda: capa, título, a contagem regressiva em
 * blocos, data, lembretes e o botão da sala.
 */
function NextMeeting({ meeting }: { meeting: Meeting }) {
  const now = useNow();
  const left = timeUntil(meeting.startsAt, now);
  return (
    <section aria-label="Próxima reunião" className="widget meet-feature rise">
      <WidgetCover
        left={<CoverChip icon="schedule">Próxima reunião</CoverChip>}
        right={<CoverChip icon="calendar_month">Reunião</CoverChip>}
      />
      <div className="widget-body gap-4">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-bold tracking-[-0.02em] text-zinc-50 sm:text-[1.75rem]">
            {meeting.title}
          </h2>
          {meeting.description && (
            <p className="mx-auto max-w-[44ch] text-sm text-zinc-400">{meeting.description}</p>
          )}
        </div>

        {left !== null && (
          <div>
            <p className="sr-only">começa em {formatDuration(left)}</p>
            <ol aria-hidden="true" className="countdown">
              {countdownParts(left).map((p) => (
                <li key={p.unit}>
                  <span key={p.value} className="countdown-value tabular">
                    {p.value}
                  </span>
                  <span className="countdown-unit">{p.unit}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          <WidgetStat icon="schedule" value={formatDateTime(meeting.startsAt)} label="começa" />
          <WidgetStat
            icon="group"
            value={`${meeting.participantCount}/${meeting.maxParticipants}`}
            label="vagas usadas"
          />
        </div>

        {meeting.reminders.length > 0 && (
          <p className="text-xs text-zinc-500">
            Lembretes no Discord:{' '}
            {meeting.reminders.map((r) => formatReminder(r.minutesBefore)).join(', ')} antes.
          </p>
        )}

        <div className="mt-auto flex justify-center pt-1">
          <Link to={`/r/${meeting.id}`} className="btn btn-primary">
            Ver sala
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Reuniões abertas e agendadas, para qualquer membro. */
export function MeetingsPage() {
  const { state, reload } = useAsync(() => api.meetings.list({ limit: 50 }));
  // Reunião nova, aberta ou cancelada aparece sozinha (a cada 60 s, só com a aba visível).
  usePolling(() => void reload({ silent: true }), 60_000);
  const next =
    state.status === 'ready' ? state.data.find((m) => m.status === 'SCHEDULED') : undefined;

  return (
    <>
      <PageTitle description="As próximas reuniões da comunidade e as que já estão abertas.">
        Reuniões
      </PageTitle>

      {state.status === 'loading' && <Loader label="Carregando reuniões…" />}
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
        <div className="meet-layout" data-feature={next ? 'true' : undefined}>
          {next && <NextMeeting meeting={next} />}
          <Section
            title="Todas"
            count={state.data.length}
            description="Reuniões abertas e agendadas da comunidade."
          >
            <ul className="widget-grid stagger">
              {state.data.map((m) => (
                <li key={m.id} className="flex">
                  <RoomCard room={m} onChanged={reload} />
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}
