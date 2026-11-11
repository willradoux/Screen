import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { StatTile } from '../../components/Widget';
import { Alert, Badge, Button, Card, PageTitle, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import type { Recording } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

const MODE_LABEL: Record<Recording['mode'], string> = {
  GRID: 'Todos em grade',
  SPEAKER: 'Quem fala / tela',
  AUDIO: 'Só áudio',
  PARTICIPANT: 'Uma pessoa',
  SCREEN: 'Tela de uma pessoa',
};

const STATUS: Record<
  Recording['status'],
  { label: string; tone: 'live' | 'open' | 'warn' | 'neutral' }
> = {
  STARTING: { label: 'Iniciando', tone: 'warn' },
  RECORDING: { label: 'Gravando', tone: 'live' },
  PROCESSING: { label: 'Processando', tone: 'warn' },
  READY: { label: 'Pronta', tone: 'open' },
  FAILED: { label: 'Falhou', tone: 'warn' },
  EXPIRED: { label: 'Apagada', tone: 'neutral' },
};

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function Row({ rec, onChanged }: { rec: Recording; onChanged: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = STATUS[rec.status];

  async function remove() {
    setBusy(true);
    try {
      await api.recordings.remove(rec.id);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="surface px-4 py-3.5" data-testid="recording">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-zinc-50">{rec.title}</h2>
        <Badge tone={s.tone}>{s.label}</Badge>
        <span className="ml-auto text-sm text-zinc-400">{formatDateTime(rec.startedAt)}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {MODE_LABEL[rec.mode]}
        {rec.status === 'READY' && ` · ${formatSize(rec.sizeBytes)}`}
        {rec.durationSec > 0 && ` · ${Math.round(rec.durationSec / 60)} min`}
      </p>
      {rec.status === 'READY' && rec.daysLeft !== null && (
        <p className={`mt-1 text-sm ${rec.daysLeft <= 2 ? 'text-amber-300' : 'text-zinc-400'}`}>
          {rec.daysLeft === 0
            ? 'Será apagada hoje. Baixe agora.'
            : `Será apagada em ${rec.daysLeft} ${rec.daysLeft === 1 ? 'dia' : 'dias'}.`}
          {rec.downloaded ? ' Já foi baixada.' : ''}
        </p>
      )}
      {rec.status === 'FAILED' && rec.error && (
        <p className="mt-1 text-sm text-red-300">{rec.error}</p>
      )}
      {rec.status === 'EXPIRED' && (
        <p className="mt-1 text-sm text-zinc-500">O prazo passou e o arquivo foi apagado.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {rec.status === 'READY' && (
          <a
            href={api.recordings.downloadUrl(rec.id)}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
          >
            <Icon name="download" /> Baixar
          </a>
        )}
        {(rec.status === 'READY' || rec.status === 'FAILED') && !confirm && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-300!"
            onClick={() => setConfirm(true)}
          >
            Apagar
          </Button>
        )}
        {confirm && (
          <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar">
            <span className="text-sm text-amber-200">Apagar o arquivo? Não dá para desfazer.</span>
            <Button size="sm" variant="danger" loading={busy} onClick={() => void remove()}>
              Sim, apagar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
          </span>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </li>
  );
}

/**
 * Resumo em números, a partir da lista que a página já buscou: quantas estão prontas, o espaço
 * que ocupam, o tempo gravado e quantas vencem nos próximos 3 dias (para baixar a tempo).
 */
function RecordingsSummary({ items }: { items: Recording[] }) {
  const ready = items.filter((r) => r.status === 'READY');
  const bytes = items.reduce((sum, r) => sum + r.sizeBytes, 0);
  const minutes = Math.round(items.reduce((sum, r) => sum + r.durationSec, 0) / 60);
  const expiring = ready.filter((r) => r.daysLeft !== null && r.daysLeft <= 3).length;
  const size =
    bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
      : `${Math.round(bytes / 1024 ** 2)} MB`;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon="radio_button_checked"
        label="Prontas para baixar"
        value={String(ready.length)}
      />
      <StatTile icon="download" label="Espaço ocupado" value={size} />
      <StatTile icon="schedule" label="Tempo gravado" value={`${minutes} min`} />
      <StatTile
        icon="warning"
        label="Vencem em até 3 dias"
        value={String(expiring)}
        hint={expiring > 0 ? 'Baixe antes de serem apagadas' : 'Nada para correr atrás'}
      />
    </div>
  );
}

/** Gravações das reuniões: baixar dentro do prazo ou apagar (ADMIN). */
export function RecordingsPage() {
  const { state, reload } = useAsync(() => api.recordings.list());
  return (
    <>
      <PageTitle
        description="Baixe ou apague as gravações das reuniões."
        action={
          <Button size="sm" onClick={() => void reload()}>
            Atualizar
          </Button>
        }
      >
        Gravações
      </PageTitle>
      <Alert tone="info" title="Como funciona">
        As gravações ficam no servidor só pelo prazo definido (10 dias por padrão). Depois disso o
        arquivo é apagado de vez e não há como recuperar. Baixe o que quiser guardar.
      </Alert>
      <div className="mt-6">
        {state.status === 'loading' && <Spinner label="Carregando…" />}
        {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
        {state.status === 'ready' && state.data.length === 0 && (
          <Card className="text-center text-zinc-400">
            Nenhuma gravação ainda. Dentro de uma reunião aberta, use “Gravação” no painel de
            pessoas.
          </Card>
        )}
        {state.status === 'ready' && state.data.length > 0 && (
          <RecordingsSummary items={state.data} />
        )}
        {state.status === 'ready' && state.data.length > 0 && (
          <ul className="stagger space-y-2">
            {state.data.map((r) => (
              <Row key={r.id} rec={r} onChanged={() => void reload({ silent: true })} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
