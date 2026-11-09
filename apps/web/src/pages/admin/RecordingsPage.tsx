import { useState } from 'react';
import { Icon } from '../../components/Icon';
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
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4" data-testid="recording">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-zinc-50">{rec.title}</h3>
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
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-400"
          >
            <Icon name="download" /> Baixar
          </a>
        )}
        {(rec.status === 'READY' || rec.status === 'FAILED') && !confirm && (
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
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

/** Gravações das reuniões: baixar dentro do prazo ou apagar (ADMIN). */
export function RecordingsPage() {
  const { state, reload } = useAsync(() => api.recordings.list());
  return (
    <>
      <PageTitle
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
          <ul className="space-y-3">
            {state.data.map((r) => (
              <Row key={r.id} rec={r} onChanged={() => void reload({ silent: true })} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
