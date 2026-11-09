import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import type { Participant, RecordingMode } from '../lib/types';

const MODES: { value: RecordingMode; label: string; hint: string }[] = [
  { value: 'GRID', label: 'Todos em grade', hint: 'Todas as câmeras lado a lado.' },
  {
    value: 'SPEAKER',
    label: 'Quem fala / tela',
    hint: 'Destaca quem está falando ou a tela compartilhada.',
  },
  { value: 'AUDIO', label: 'Só o áudio', hint: 'Arquivo de áudio, bem menor.' },
  {
    value: 'PARTICIPANT',
    label: 'Uma pessoa (rosto e voz)',
    hint: 'Só a câmera e o microfone de quem você escolher.',
  },
  {
    value: 'SCREEN',
    label: 'A tela de uma pessoa',
    hint: 'Só a tela compartilhada de quem você escolher.',
  },
];

/** Começar e parar a gravação da reunião (só ADMIN). Todos na sala veem o aviso de gravação. */
export function RecordingControl({
  roomId,
  recording,
  people,
  onInfo,
  onError,
}: {
  roomId: string;
  recording: boolean;
  people: Participant[];
  onInfo: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [mode, setMode] = useState<RecordingMode>('GRID');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const single = mode === 'PARTICIPANT' || mode === 'SCREEN';

  async function start() {
    if (single && !userId) return onError('Escolha de quem é a gravação.');
    setBusy(true);
    try {
      const rec = await api.recordings.start(roomId, { mode, ...(single ? { userId } : {}) });
      setCurrentId(rec.id);
      onInfo('Gravação iniciada. Todos na sala foram avisados.');
    } catch (err) {
      onError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      let id = currentId;
      if (!id) {
        const active = (await api.recordings.list()).find(
          (r) => r.roomId === roomId && (r.status === 'RECORDING' || r.status === 'STARTING'),
        );
        id = active?.id ?? null;
      }
      if (!id) return onError('Não encontrei uma gravação em andamento.');
      await api.recordings.stop(id);
      setCurrentId(null);
      onInfo('Gravação parada. O arquivo aparece em Gravações quando ficar pronto.');
    } catch (err) {
      onError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Gravação" className="space-y-3 rounded-xl bg-zinc-950/60 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Icon
          name="radio_button_checked"
          className={recording ? 'text-red-400' : 'text-zinc-500'}
        />
        Gravação {recording ? '(gravando)' : ''}
      </h3>
      {recording ? (
        <Button size="sm" variant="danger" loading={busy} onClick={() => void stop()}>
          Parar gravação
        </Button>
      ) : (
        <>
          <label className="block text-xs text-zinc-400" htmlFor="rec-mode">
            O que gravar
          </label>
          <select
            id="rec-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as RecordingMode)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">{MODES.find((m) => m.value === mode)?.hint}</p>
          {single && (
            <select
              aria-label="Pessoa a gravar"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
            >
              <option value="">Escolha a pessoa…</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant="primary" loading={busy} onClick={() => void start()}>
            Começar a gravar
          </Button>
        </>
      )}
      <p className="text-xs text-zinc-500">
        O arquivo fica no servidor e você tem alguns dias para baixar; depois ele é apagado.
      </p>
    </section>
  );
}
