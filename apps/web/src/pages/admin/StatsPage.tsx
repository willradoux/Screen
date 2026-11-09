import { useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Alert, Avatar, Card, PageTitle, Spinner } from '../../components/ui';
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

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-4">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
        <Icon name={icon} size="1.6rem" />
      </span>
      <div>
        <p className="font-display text-2xl font-bold text-zinc-50">{value}</p>
        <p className="text-sm text-zinc-400">{label}</p>
      </div>
    </Card>
  );
}

/** Barras por dia, em CSS puro (sem biblioteca de gráfico). */
export function DayBars({ days }: { days: ServerStats['perDay'] }) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  return (
    <div role="img" aria-label="Tempo conectado por dia" className="flex h-40 items-end gap-1">
      {days.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${formatMinutes(d.minutes)} · ${d.participants} pessoas`}
          className="min-w-0 flex-1 rounded-t bg-brand-500/70 transition-colors hover:bg-brand-400"
          style={{ height: `${Math.max(2, (d.minutes / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Números do servidor no período escolhido (ADMIN). */
export function StatsPage() {
  const [days, setDays] = useState(30);
  const { state } = useAsync(() => api.stats.get(days), [days]);

  return (
    <>
      <PageTitle
        action={
          <div
            role="group"
            aria-label="Período"
            className="flex gap-1 rounded-full bg-zinc-900 p-1"
          >
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                aria-pressed={days === p.days}
                onClick={() => setDays(p.days)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  days === p.days
                    ? 'bg-brand-500 text-on-brand'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat icon="videocam" label="Lives abertas" value={String(state.data.livesOpened)} />
            <Stat icon="calendar_month" label="Reuniões" value={String(state.data.meetingsHeld)} />
            <Stat
              icon="group"
              label="Pessoas diferentes"
              value={String(state.data.uniqueParticipants)}
            />
            <Stat
              icon="schedule"
              label="Tempo total conectado"
              value={formatMinutes(state.data.participantMinutes)}
            />
            <Stat icon="history" label="Entradas em sala" value={String(state.data.sessions)} />
            <Stat
              icon="bar_chart"
              label="Média por entrada"
              value={formatMinutes(state.data.avgSessionMinutes)}
            />
          </div>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold text-zinc-50">Tempo conectado por dia</h2>
            {state.data.sessions === 0 ? (
              <p className="text-sm text-zinc-500">Ninguém entrou em sala neste período.</p>
            ) : (
              <DayBars days={state.data.perDay} />
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold text-zinc-50">Quem mais participou</h2>
            {state.data.topPeople.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem dados ainda.</p>
            ) : (
              <ol className="space-y-2">
                {state.data.topPeople.map((p, i) => (
                  <li key={p.userId} className="flex items-center gap-3" data-testid="top-person">
                    <span className="w-5 text-sm text-zinc-500">{i + 1}.</span>
                    <Avatar name={p.displayName} url={null} size="sm" />
                    <span className="flex-1 truncate text-zinc-100">{p.displayName}</span>
                    <span className="text-sm text-zinc-400">{formatMinutes(p.minutes)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
