import { useState } from 'react';
import { Alert, Avatar, Card, PageTitle, Spinner } from '../../components/ui';
import { StatTile } from '../../components/Widget';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import type { ServerStats } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

/** "135" vira "2 h 15 min"; "40" vira "40 min". */
export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

const SHORT_DAY = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const dayText = (date: string) => SHORT_DAY.format(new Date(`${date}T12:00:00`)).replace('.', '');

/**
 * Barras por dia, em CSS puro (sem biblioteca de gráfico): cinza, com o último dia em destaque e
 * o pico marcado. Linhas de referência em 0, metade e máximo.
 */
export function DayBars({ days }: { days: ServerStats['perDay'] }) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  const peak = days.reduce((a, b) => (b.minutes > a.minutes ? b : a), days[0]!);
  const mid = days[Math.floor(days.length / 2)];
  return (
    <>
      <div className="bars">
        <div className="bars-grid" aria-hidden="true">
          <span data-v={formatMinutes(max)} />
          <span data-v={formatMinutes(Math.round(max / 2))} />
          <span data-v="0" />
        </div>
        <div role="img" aria-label="Tempo conectado por dia" className="bars-plot">
          {days.map((d, i) => (
            <div
              key={d.date}
              className="bars-bar"
              data-last={i === days.length - 1 || undefined}
              title={`${dayText(d.date)}: ${formatMinutes(d.minutes)} · ${d.participants} pessoas`}
              style={{ height: `${Math.max(1.5, (d.minutes / max) * 100)}%` }}
            >
              {d === peak && d.minutes > 0 && (
                <span className="bars-peak">{formatMinutes(d.minutes)}</span>
              )}
            </div>
          ))}
        </div>
        <div className="bars-x" aria-hidden="true">
          <span>{days[0] ? dayText(days[0].date) : ''}</span>
          <span>{mid ? dayText(mid.date) : ''}</span>
          <span>Hoje</span>
        </div>
      </div>
      {/* Os mesmos números em tabela, para leitores de tela (o gráfico só mostra no hover). */}
      <table className="sr-only">
        <caption>Tempo conectado por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Tempo conectado</th>
            <th scope="col">Pessoas</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{formatMinutes(d.minutes)}</td>
              <td>{d.participants}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Números do servidor no período escolhido (ADMIN). */
export function StatsPage() {
  const [days, setDays] = useState(30);
  const { state } = useAsync(() => api.stats.get(days), [days]);

  return (
    <>
      <PageTitle
        description={`Participação no servidor nos últimos ${days} dias.`}
        action={
          <div role="group" aria-label="Período" className="seg">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                aria-pressed={days === p.days}
                onClick={() => setDays(p.days)}
                className="seg-opt"
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      >
        Estatísticas
      </PageTitle>

      {state.status === 'loading' && <Spinner label="Calculando…" />}
      {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
      {state.status === 'ready' && (
        <div className="space-y-6">
          <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Tempo em sala"
              value={formatMinutes(state.data.participantMinutes)}
              hint={`${state.data.sessions} entradas em sala`}
            />
            <StatTile
              label="Pessoas diferentes"
              value={String(state.data.uniqueParticipants)}
              hint="entraram em alguma sala"
            />
            <StatTile
              label="Média por entrada"
              value={formatMinutes(state.data.avgSessionMinutes)}
              hint="quanto cada pessoa fica"
            />
            <StatTile
              label="Lives abertas"
              value={String(state.data.livesOpened)}
              hint={`${state.data.meetingsHeld} ${state.data.meetingsHeld === 1 ? 'reunião' : 'reuniões'} no período`}
            />
          </div>

          <div className="stats-row">
            <Card className="stats-card">
              <h2 className="set-card-title">Tempo conectado por dia</h2>
              <p className="stats-sub">Soma do tempo de todo mundo em sala, dia a dia.</p>
              {state.data.sessions === 0 ? (
                <p className="text-sm text-zinc-500">Ninguém entrou em sala neste período.</p>
              ) : (
                <DayBars days={state.data.perDay} />
              )}
            </Card>

            <Card className="stats-card">
              <h2 className="set-card-title">Quem mais participou</h2>
              {state.data.topPeople.length === 0 ? (
                <p className="text-sm text-zinc-500">Sem dados ainda.</p>
              ) : (
                <ol className="stats-top">
                  {state.data.topPeople.map((p) => (
                    <li key={p.userId} data-testid="top-person">
                      <span className="stats-top-row">
                        <Avatar name={p.displayName} url={null} size="sm" />
                        <span className="min-w-0 flex-1 truncate">{p.displayName}</span>
                        <span className="tabular text-zinc-400">{formatMinutes(p.minutes)}</span>
                      </span>
                      <span className="stats-top-bar" aria-hidden="true">
                        <span
                          style={{
                            width: `${(p.minutes / Math.max(1, state.data.topPeople[0]!.minutes)) * 100}%`,
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
