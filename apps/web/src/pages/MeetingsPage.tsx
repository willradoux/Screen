import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Loader } from '../components/Loader';
import { Alert, EmptyState, PageTitle, Section } from '../components/ui';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { formatDuration, formatReminder, timeUntil } from '../lib/format';
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

/** "02:14:37" (e "3 d 02:14:37" quando falta mais de um dia). */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hms = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return d > 0 ? `${d} d ${hms}` : hms;
}

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const DAY_TIME = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const isToday = (d: Date, now: number) => d.toDateString() === new Date(now).toDateString();

/** "Hoje, 20:00" ou "sex., 4 de dez., 19:30". */
function when(iso: string | null, now: number): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isToday(d, now) ? `Hoje, ${TIME.format(d)}` : DAY_TIME.format(d);
}

/** Quem pode entrar: o servidor todo ou só alguns cargos. */
const who = (m: Meeting) =>
  m.allowedRoleIds.length === 0
    ? 'Todo o servidor'
    : m.allowedRoleIds.length === 1
      ? 'Um cargo'
      : `${m.allowedRoleIds.length} cargos`;

/**
 * A próxima reunião em destaque: à esquerda quando é, o nome e quem entra; à direita a contagem
 * regressiva grande.
 */
function NextMeeting({ meeting }: { meeting: Meeting }) {
  const now = useNow();
  const left = timeUntil(meeting.startsAt, now);
  return (
    <section aria-label="Próxima reunião" className="meet-hero rise">
      <div className="meet-hero-main">
        <p className="meet-chip">
          <span className="sr-only">Próxima reunião · </span>
          {when(meeting.startsAt, now)}
        </p>
        <h2 className="meet-hero-title">{meeting.title}</h2>
        {meeting.description && <p className="meet-hero-desc">{meeting.description}</p>}
        <p className="meet-hero-meta">
          Quem entra: {who(meeting).toLowerCase()} · não precisa estar numa call
        </p>
        {meeting.reminders.length > 0 && (
          <p className="meet-hero-meta">
            Lembretes no Discord:{' '}
            {meeting.reminders.map((r) => formatReminder(r.minutesBefore)).join(', ')} antes.
          </p>
        )}
        <Link to={`/r/${meeting.id}`} className="btn btn-secondary mt-2 w-fit">
          Ver sala
        </Link>
      </div>
      {left !== null && (
        <div className="meet-hero-clock">
          <p className="sr-only">começa em {formatDuration(left)}</p>
          <p aria-hidden="true" className="meet-hero-clock-label">
            começa em
          </p>
          <p aria-hidden="true" className="meet-hero-clock-value tabular">
            {clock(left)}
          </p>
        </div>
      )}
    </section>
  );
}

/** Uma reunião na lista: a data num quadrinho, o nome, quando, quem entra e o botão. */
function MeetingRow({ meeting, now }: { meeting: Meeting; now: number }) {
  const navigate = useNavigate();
  const d = meeting.startsAt ? new Date(meeting.startsAt) : null;
  const open = meeting.status === 'OPEN';
  const left = timeUntil(meeting.startsAt, now);
  const days = left !== null ? Math.round(left / 86_400_000) : null;
  const today = Boolean(d && isToday(d, now));
  const relative = open
    ? 'aberta agora'
    : left === null
      ? ''
      : today
        ? `começa em ${clock(left)}`
        : days !== null && days >= 1
          ? `em ${days} ${days === 1 ? 'dia' : 'dias'}`
          : `em ${formatDuration(left)}`;
  const nameId = `meet-${meeting.id}`;
  return (
    <li
      className="meet-row"
      data-open={open || undefined}
      onClick={(e) => {
        // A linha inteira leva para a sala (o botão é o caminho do teclado).
        if ((e.target as HTMLElement).closest('a, button')) return;
        navigate(`/r/${meeting.id}`);
      }}
    >
      <span className="meet-date" aria-hidden="true">
        <span>{d ? MONTH.format(d).replace('.', '') : '—'}</span>
        <span>{d ? String(d.getDate()).padStart(2, '0') : ''}</span>
      </span>
      <span className="meet-row-name">
        <span id={nameId} className="meet-row-title">
          {meeting.title}
        </span>
        {meeting.description && <span className="meet-row-desc">{meeting.description}</span>}
      </span>
      <span className="meet-row-when">
        <span>{open ? 'Agora' : when(meeting.startsAt, now)}</span>
        <span data-soon={today || open || undefined}>{relative}</span>
      </span>
      <span className="meet-row-who">{who(meeting)}</span>
      <Link
        to={`/r/${meeting.id}`}
        className={`btn btn-sm ${open ? 'btn-primary' : 'btn-secondary'}`}
        aria-describedby={nameId}
      >
        {open ? 'Entrar' : 'Ver sala'}
      </Link>
    </li>
  );
}

/** Reuniões abertas e agendadas, para qualquer membro. */
export function MeetingsPage() {
  const { state, reload } = useAsync(() => api.meetings.list({ limit: 50 }));
  const now = useNow();
  const list = state.status === 'ready' ? state.data : [];
  const next = list.find((m) => m.status === 'SCHEDULED');
  const today = list.filter((m) => m.startsAt && isToday(new Date(m.startsAt), now)).length;
  const upcoming = list.filter((m) => m.status === 'SCHEDULED').length;

  return (
    <>
      <PageTitle
        description={
          list.length > 0
            ? `${today} hoje · ${upcoming} ${upcoming === 1 ? 'próxima' : 'próximas'}`
            : 'As próximas reuniões da comunidade e as que já estão abertas.'
        }
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reload()}>
            <Icon name="refresh" size="1rem" />
            Atualizar
          </button>
        }
      >
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
        <div className="space-y-10">
          {next && <NextMeeting meeting={next} />}
          <Section title="Todas" count={state.data.length}>
            <div className="meet-table">
              <div className="meet-table-head" aria-hidden="true">
                <span>Reunião</span>
                <span>Quando</span>
                <span>Quem entra</span>
              </div>
              <ul className="stagger">
                {state.data.map((m) => (
                  <MeetingRow key={m.id} meeting={m} now={now} />
                ))}
              </ul>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
