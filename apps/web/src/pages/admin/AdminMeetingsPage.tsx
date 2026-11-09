import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  PageTitle,
  Spinner,
  inputClass,
} from '../../components/ui';
import { Icon } from '../../components/Icon';
import { StatusBadge } from '../../components/RoomCard';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime, formatReminder, isoToLocalInput, localInputToIso } from '../../lib/format';
import type { Meeting, MeetingReport } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

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

function MeetingForm({ onCreated }: { onCreated: (m: Meeting) => void }) {
  const [values, setValues] = useState<MeetingFormValues>(emptyForm);
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
    <Card>
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
          <input
            id="m-when"
            type="datetime-local"
            className={inputClass}
            value={values.when}
            onChange={(e) => setValues({ ...values, when: e.target.value })}
          />
        </Field>

        {scheduled && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-200">Lembretes no Discord</legend>
            <div className="flex flex-wrap gap-4">
              {REMINDER_CHOICES.map((r) => (
                <label key={r.minutes} className="flex items-center gap-2 text-sm text-zinc-300">
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

        <label className="flex items-center gap-2 text-sm text-zinc-300">
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
            <tr key={a.userId} className="border-t border-zinc-800">
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
    <li className="py-4" data-testid="meeting-row">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-zinc-50">{meeting.title}</h3>
        <StatusBadge room={meeting} />
        <span className="ml-auto text-sm text-zinc-400">
          {formatDateTime(meeting.startsAt ?? meeting.openedAt)}
        </span>
      </div>

      {(meeting.status === 'SCHEDULED' || meeting.status === 'OPEN') && (
        <p className="mt-1 text-xs">
          {meeting.announced ? (
            <Badge tone="open">Divulgada no Discord</Badge>
          ) : (
            <Badge tone="warn">Ainda não divulgada</Badge>
          )}
          {!meeting.announced && meeting.reminders.length > 0 && (
            <span className="ml-2 text-zinc-500">Os lembretes só começam depois de divulgar.</span>
          )}
        </p>
      )}

      {meeting.reminders.length > 0 && meeting.status === 'SCHEDULED' && (
        <p className="mt-1 text-xs text-zinc-500">
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

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/r/${meeting.id}`}
          className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-100 hover:bg-zinc-700"
        >
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
            <Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancelar
            </Button>
          </>
        )}
        {meeting.status === 'OPEN' && (
          <Button
            size="sm"
            variant="danger"
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
            <input
              id={`w-${meeting.id}`}
              type="datetime-local"
              className={inputClass}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
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

  return (
    <>
      <PageTitle description="Crie, agende e divulgue reuniões; abra, cancele e veja o relatório.">
        Gerenciar reuniões
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <MeetingForm onCreated={() => void reload({ silent: true })} />

        <div className="space-y-6">
          {state.status === 'loading' && <Spinner label="Carregando reuniões…" />}
          {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
          {state.status === 'ready' && (
            <>
              <section aria-label="Abertas e agendadas">
                <h2 className="mb-2 font-semibold text-zinc-200">Abertas e agendadas</h2>
                {state.data.active.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhuma.</p>
                ) : (
                  <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
                    {state.data.active.map((m) => (
                      <MeetingRow
                        key={m.id}
                        meeting={m}
                        onChanged={() => void reload({ silent: true })}
                      />
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Encerradas">
                <h2 className="mb-2 font-semibold text-zinc-200">Encerradas recentemente</h2>
                {state.data.ended.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhuma.</p>
                ) : (
                  <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
                    {state.data.ended.map((m) => (
                      <MeetingRow
                        key={m.id}
                        meeting={m}
                        onChanged={() => void reload({ silent: true })}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
