import { useEffect, useState, type FormEvent } from 'react';
import { DateTimeField } from '../../shared/ui/DateTimeField';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  PageTitle,
  Section,
  Spinner,
  inputClass,
} from '../../shared/ui/ui';
import { Icon } from '../../shared/ui/Icon';
import { StatusBadge } from '../rooms/RoomCard';
import { api } from '../../shared/lib/api';
import { describeError } from '../../shared/lib/errors';
import {
  formatDateTime,
  formatReminder,
  isoToLocalInput,
  localInputToIso,
} from '../../shared/lib/format';
import type { Meeting, MeetingReport } from '../../shared/lib/types';
import { useAsync } from '../../shared/lib/useAsync';

const REMINDER_CHOICES = [
  { minutes: 1440, label: '24 h antes' },
  { minutes: 60, label: '1 h antes' },
  { minutes: 5, label: '5 min antes' },
];

export interface MeetingFormValues {
  title: string;
  description: string;
  /** Valor de um `datetime-local`; vazio = abre agora. */
  when: string;
  announce: boolean;
  reminders: number[];
}

export const emptyForm: MeetingFormValues = {
  title: '',
  description: '',
  when: '',
  announce: false,
  reminders: [1440, 60, 5],
};

/** Valida o formulário e monta o corpo da API. Devolve o erro em texto, ou o corpo. */
export function buildMeetingInput(
  v: MeetingFormValues,
  now: number = Date.now(),
):
  | { error: string }
  | {
      input: {
        title: string;
        description: string | null;
        startsAt: string | null;
        announce: boolean;
        reminders?: number[];
      };
    } {
  const title = v.title.trim();
  if (title.length < 3) return { error: 'O título precisa ter pelo menos 3 caracteres.' };
  if (title.length > 100) return { error: 'O título pode ter no máximo 100 caracteres.' };
  if (v.description.length > 1000)
    return { error: 'A descrição pode ter no máximo 1000 caracteres.' };

  let startsAt: string | null = null;
  if (v.when) {
    startsAt = localInputToIso(v.when);
    if (!startsAt) return { error: 'Data e hora inválidas.' };
    if (new Date(startsAt).getTime() < now + 2 * 60_000) {
      return { error: 'O horário precisa estar pelo menos 2 minutos no futuro.' };
    }
  }

  return {
    input: {
      title,
      description: v.description.trim() || null,
      startsAt,
      announce: v.announce,
      // Reunião imediata não tem lembretes.
      ...(startsAt ? { reminders: [...v.reminders].sort((a, b) => b - a) } : {}),
    },
  };
}

function MeetingForm({
  onCreated,
  pickedDay,
}: {
  onCreated: (m: Meeting) => void;
  /** Dia escolhido no calendário ("2026-12-17"): vira a data do formulário (20:00 se vazio). */
  pickedDay?: string | null;
}) {
  const [values, setValues] = useState<MeetingFormValues>(emptyForm);
  useEffect(() => {
    if (!pickedDay) return;
    setValues((v) => ({ ...v, when: `${pickedDay}T${v.when.slice(11, 16) || '20:00'}` }));
  }, [pickedDay]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const built = buildMeetingInput(values);
    if ('error' in built) return setError(built.error);
    setError(null);
    setSaving(true);
    try {
      const meeting = await api.meetings.create(built.input);
      setValues(emptyForm);
      onCreated(meeting);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const scheduled = values.when !== '';

  return (
    <Card className="am-form">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label="Nova reunião">
        <h2 className="text-lg font-semibold text-zinc-50">Nova reunião</h2>
        <Field label="Título" htmlFor="m-title">
          <input
            id="m-title"
            className={inputClass}
            value={values.title}
            maxLength={100}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
            required
          />
        </Field>
        <Field label="Descrição (pauta)" htmlFor="m-desc">
          <textarea
            id="m-desc"
            className={inputClass}
            rows={3}
            value={values.description}
            maxLength={1000}
            onChange={(e) => setValues({ ...values, description: e.target.value })}
          />
        </Field>
        <Field
          label="Quando"
          htmlFor="m-when"
          hint="Deixe em branco para abrir agora. O horário é o do seu navegador."
        >
          <DateTimeField
            id="m-when"
            value={values.when}
            onChange={(when) => setValues({ ...values, when })}
          />
        </Field>

        {scheduled && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-200">Lembretes no Discord</legend>
            <div className="flex flex-wrap gap-4">
              {REMINDER_CHOICES.map((r) => (
                <label
                  key={r.minutes}
                  className="flex min-h-8 items-center gap-2 text-sm text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={values.reminders.includes(r.minutes)}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        reminders: e.target.checked
                          ? [...values.reminders, r.minutes]
                          : values.reminders.filter((m) => m !== r.minutes),
                      })
                    }
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex min-h-8 items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={values.announce}
            onChange={(e) => setValues({ ...values, announce: e.target.checked })}
          />
          Divulgar no Discord já ao criar
        </label>
        <p className="-mt-2 text-xs text-zinc-500">
          Se deixar desmarcado, a reunião fica só aqui no site, com data e hora, e você divulga
          quando quiser com o botão “Enviar aviso”.
        </p>

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" variant="primary" loading={saving}>
          {scheduled ? 'Agendar reunião' : 'Criar e abrir agora'}
        </Button>
      </form>
    </Card>
  );
}

function ReportView({ report }: { report: MeetingReport }) {
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-zinc-950/60 p-3 text-sm">
      <p className="text-zinc-300">
        Duração: <strong>{report.durationMinutes} min</strong> · Participantes:{' '}
        <strong>{report.attendees.length}</strong> · Pico:{' '}
        <strong>{report.peakParticipants}</strong>
      </p>
      <table className="w-full text-left">
        <thead className="text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-1">Pessoa</th>
            <th>Entrou</th>
            <th>Saiu</th>
            <th className="text-right">Minutos</th>
          </tr>
        </thead>
        <tbody>
          {report.attendees.map((a) => (
            <tr key={a.userId} className="">
              <td className="py-1 text-zinc-100">{a.displayName}</td>
              <td className="text-zinc-400">{formatDateTime(a.joinedAt)}</td>
              <td className="text-zinc-400">{formatDateTime(a.leftAt)}</td>
              <td className="text-right text-zinc-100">{a.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.attendees.length === 0 && <p className="text-zinc-500">Ninguém participou.</p>}
    </div>
  );
}

const MONTH_SHORT = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const TIME_SHORT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** A data num quadrinho: mês (coral) em cima, dia embaixo. */
function MeetingDate({ iso }: { iso: string | null }) {
  const d = iso ? new Date(iso) : null;
  return (
    <span className="meet-date" aria-hidden="true">
      <span>{d ? MONTH_SHORT.format(d).replace('.', '') : '—'}</span>
      <span>{d ? String(d.getDate()).padStart(2, '0') : ''}</span>
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTH_TITLE = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * O mês com as reuniões de cada dia. Clicar num dia de hoje em diante põe a data no formulário de
 * nova reunião.
 */
export function MeetingCalendar({
  meetings,
  onPick,
  picked,
}: {
  meetings: Meeting[];
  onPick: (day: string) => void;
  picked: string | null;
}) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  // Só as semanas que o mês ocupa (5 ou 6, às vezes 4).
  const inMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from(
    { length: Math.ceil((month.getDay() + inMonth) / 7) * 7 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
  );
  const byDay = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const iso = m.startsAt ?? m.openedAt;
    if (!iso || m.status === 'CANCELED') continue;
    const k = dayKey(new Date(iso));
    byDay.set(k, [...(byDay.get(k) ?? []), m]);
  }
  const todayKey = dayKey(today);
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const title = MONTH_TITLE.format(month);
  return (
    <section aria-label="Calendário de reuniões" className="am-cal">
      <header className="am-cal-head">
        <h2>{title.charAt(0).toUpperCase() + title.slice(1)}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoje
          </button>
          <button
            type="button"
            className="am-cal-nav"
            aria-label="Mês anterior"
            onClick={() => shift(-1)}
          >
            <Icon name="chevron_right" size="1.2rem" className="rotate-180" />
          </button>
          <button
            type="button"
            className="am-cal-nav"
            aria-label="Próximo mês"
            onClick={() => shift(1)}
          >
            <Icon name="chevron_right" size="1.2rem" />
          </button>
        </div>
      </header>
      <div className="am-cal-grid">
        {WEEK.map((w) => (
          <span key={w} className="am-cal-week" aria-hidden="true">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const k = dayKey(d);
          const list = byDay.get(k) ?? [];
          const past = k < todayKey;
          return (
            <button
              key={k}
              type="button"
              className="am-cal-day"
              data-out={d.getMonth() !== month.getMonth() || undefined}
              data-today={k === todayKey || undefined}
              data-picked={k === picked || undefined}
              disabled={past}
              aria-pressed={k === picked}
              aria-label={`${d.getDate()} de ${MONTH_TITLE.format(d)}${
                list.length ? `: ${list.map((m) => m.title).join(', ')}` : ''
              }`}
              onClick={() => onPick(k)}
            >
              <span className="am-cal-num">{d.getDate()}</span>
              {list.slice(0, 2).map((m) => (
                <span key={m.id} className="am-cal-chip">
                  {TIME_SHORT.format(new Date(m.startsAt ?? m.openedAt ?? ''))}{' '}
                  {m.title.split(/\s+/)[0]}
                </span>
              ))}
              {list.length > 2 && <span className="am-cal-more">+{list.length - 2}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MeetingRow({ meeting, onChanged }: { meeting: Meeting; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(isoToLocalInput(meeting.startsAt));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [report, setReport] = useState<MeetingReport | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  async function reschedule() {
    const iso = localInputToIso(when);
    if (!iso) return setError('Data e hora inválidas.');
    if (new Date(iso).getTime() < Date.now() + 2 * 60_000) {
      return setError('O horário precisa estar pelo menos 2 minutos no futuro.');
    }
    await run('reschedule', async () => {
      await api.meetings.update(meeting.id, { startsAt: iso });
      setEditing(false);
    });
  }

  return (
    <li className="am-row" data-testid="meeting-row" data-status={meeting.status}>
      <div className="am-row-main">
        <MeetingDate iso={meeting.startsAt ?? meeting.openedAt ?? meeting.endedAt} />
        <div className="min-w-0 flex-1">
          <h3 className="am-row-title">{meeting.title}</h3>
          <p className="am-row-when">{formatDateTime(meeting.startsAt ?? meeting.openedAt)}</p>
          <p className="am-row-badges">
            <StatusBadge room={meeting} />
            {(meeting.status === 'SCHEDULED' || meeting.status === 'OPEN') &&
              (meeting.announced ? (
                <Badge tone="open">Divulgada no Discord</Badge>
              ) : (
                <Badge tone="warn">Ainda não divulgada</Badge>
              ))}
          </p>

          {!meeting.announced &&
            meeting.reminders.length > 0 &&
            (meeting.status === 'SCHEDULED' || meeting.status === 'OPEN') && (
              <p className="mt-1 text-xs text-zinc-500">
                Os lembretes só começam depois de divulgar.
              </p>
            )}

          {meeting.reminders.length > 0 && meeting.status === 'SCHEDULED' && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
              Lembretes:{' '}
              {meeting.reminders.map((r) => (
                <Badge key={r.minutesBefore} tone={r.sent ? 'open' : 'neutral'}>
                  {formatReminder(r.minutesBefore)}
                  {r.sent ? (
                    <Icon name="check" size="0.9rem" className="ml-0.5" label="enviado" />
                  ) : null}
                </Badge>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="am-row-body">
        <div className="flex flex-wrap gap-2">
          <Link to={`/r/${meeting.id}`} className="btn btn-secondary btn-sm">
            Abrir página da sala
          </Link>

          {(meeting.status === 'SCHEDULED' || meeting.status === 'OPEN') && (
            <Button
              size="sm"
              variant={meeting.announced ? 'secondary' : 'primary'}
              loading={busy === 'announce'}
              onClick={() =>
                void run('announce', () => api.meetings.announce(meeting.id, meeting.announced))
              }
            >
              {meeting.announced ? 'Enviar de novo' : 'Enviar aviso'}
            </Button>
          )}

          {meeting.status === 'SCHEDULED' && (
            <>
              <Button
                size="sm"
                loading={busy === 'open'}
                onClick={() => void run('open', () => api.meetings.open(meeting.id))}
              >
                Abrir agora
              </Button>
              <Button size="sm" onClick={() => setEditing((v) => !v)}>
                Reagendar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-300!"
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar
              </Button>
            </>
          )}
          {meeting.status === 'OPEN' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-300!"
              loading={busy === 'end'}
              onClick={() => void run('end', () => api.rooms.end(meeting.id))}
            >
              Encerrar
            </Button>
          )}
          {meeting.status === 'ENDED' && (
            <Button
              size="sm"
              loading={busy === 'report'}
              onClick={() =>
                void run('report', async () => setReport(await api.meetings.report(meeting.id)))
              }
            >
              Ver relatório
            </Button>
          )}
        </div>

        {editing && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Novo horário" htmlFor={`w-${meeting.id}`}>
              <DateTimeField id={`w-${meeting.id}`} value={when} onChange={setWhen} />
            </Field>
            <Button
              size="sm"
              variant="primary"
              loading={busy === 'reschedule'}
              onClick={() => void reschedule()}
            >
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Fechar
            </Button>
          </div>
        )}

        {confirmCancel && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Confirmar cancelamento"
          >
            <span className="text-sm text-amber-200">
              Cancelar “{meeting.title}”? O canal será avisado.
            </span>
            <Button
              size="sm"
              variant="danger"
              loading={busy === 'cancel'}
              onClick={() => void run('cancel', () => api.meetings.cancel(meeting.id))}
            >
              Sim, cancelar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>
              Voltar
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {report && <ReportView report={report} />}
      </div>
    </li>
  );
}

/** Criar, agendar, reagendar, abrir, cancelar e ver o relatório das reuniões (ADMIN). */
export function AdminMeetingsPage() {
  const { state, reload } = useAsync(async () => {
    const [active, ended] = await Promise.all([
      api.meetings.list({ limit: 100 }),
      api.meetings.list({ status: 'ENDED', limit: 20 }),
    ]);
    return { active, ended };
  });

  const [picked, setPicked] = useState<string | null>(null);
  return (
    <>
      <PageTitle description="Agende, divulgue, abra, reagende e cancele. Veja o relatório das que terminaram.">
        Gerenciar reuniões
      </PageTitle>
      <div className="am-layout">
        <div className="space-y-8">
          {state.status === 'ready' && (
            <MeetingCalendar
              meetings={[...state.data.active, ...state.data.ended]}
              picked={picked}
              onPick={setPicked}
            />
          )}
          {state.status === 'loading' && <Spinner label="Carregando reuniões…" />}
          {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
          {state.status === 'ready' && (
            <>
              <Section
                title="Abertas e agendadas"
                count={state.data.active.length}
                description="Divulgue, abra, reagende ou cancele. O aviso vai para o canal de avisos do Discord."
              >
                {state.data.active.length === 0 ? (
                  <p className="ink-soft px-1 text-sm">
                    Nenhuma reunião aberta ou agendada. Crie uma no formulário ao lado.
                  </p>
                ) : (
                  <ul className="am-list stagger">
                    {state.data.active.map((m) => (
                      <MeetingRow
                        key={m.id}
                        meeting={m}
                        onChanged={() => void reload({ silent: true })}
                      />
                    ))}
                  </ul>
                )}
              </Section>
              <Section
                title="Encerradas recentemente"
                count={state.data.ended.length}
                description="As últimas que terminaram, com o relatório de presença."
              >
                {state.data.ended.length === 0 ? (
                  <p className="ink-soft px-1 text-sm">Nenhuma reunião encerrada ainda.</p>
                ) : (
                  <ul className="am-list stagger">
                    {state.data.ended.map((m) => (
                      <MeetingRow
                        key={m.id}
                        meeting={m}
                        onChanged={() => void reload({ silent: true })}
                      />
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
        <div className="am-side">
          <MeetingForm onCreated={() => void reload({ silent: true })} pickedDay={picked} />
        </div>
      </div>
    </>
  );
}
