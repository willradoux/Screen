import { Track, type LocalAudioTrack, type LocalParticipant } from 'livekit-client';
import { useState } from 'react';
import { applyMicEffects, micPrefs, saveMicPrefs } from '../lib/micEffects';
import { GATE_LEVELS, type GateLevel } from '../lib/voiceEffects';

/**
 * Tratamento do microfone (fica no menu da setinha do mic, separado dos efeitos de voz):
 * redução de ruído do navegador (liga/desliga) e filtro de barulho (nível). Com o mic
 * desligado, guarda a escolha e aplica quando ligar.
 */
export function MicProcessing({
  local,
  onError,
}: {
  local: LocalParticipant;
  onError: (message: string) => void;
}) {
  const [gate, setGate] = useState<GateLevel>(() => micPrefs().gate);
  const [suppression, setSuppression] = useState(() => micPrefs().suppression);
  const [busy, setBusy] = useState(false);

  async function change(patch: Partial<{ gate: GateLevel; suppression: boolean }>) {
    const mic = local.getTrackPublication(Track.Source.Microphone)?.track as
      LocalAudioTrack | undefined;
    if (!mic) saveMicPrefs(patch);
    else {
      setBusy(true);
      try {
        await applyMicEffects(mic, patch);
      } catch {
        return onError('Não consegui aplicar isso no microfone neste navegador.');
      } finally {
        setBusy(false);
      }
    }
    if (patch.gate !== undefined) setGate(patch.gate);
    if (patch.suppression !== undefined) setSuppression(patch.suppression);
  }

  return (
    <div className="mic-processing">
      <button
        type="button"
        role="switch"
        aria-checked={suppression}
        aria-label="Redução de ruído"
        disabled={busy}
        onClick={() => void change({ suppression: !suppression })}
        className="mic-row"
      >
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] font-semibold text-zinc-100">Redução de ruído</span>
          <span className="block text-[11px] text-zinc-500">
            {suppression ? 'Tira ruído e eco da sua voz.' : 'Desligada: o som sai cru.'}
          </span>
        </span>
        <span aria-hidden="true" className="switch" data-on={suppression || undefined}>
          <span className="switch-knob" />
        </span>
      </button>

      <div role="radiogroup" aria-label="Filtro de barulho" className="mic-gate">
        <p className="text-[11px] font-semibold text-zinc-500">Filtro de barulho</p>
        <div className="flex flex-wrap gap-1">
          {GATE_LEVELS.map((g) => (
            <button
              key={g.value}
              type="button"
              role="radio"
              aria-checked={gate === g.value}
              disabled={busy}
              onClick={() => void change({ gate: g.value })}
              className="mic-chip"
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">
          {GATE_LEVELS.find((g) => g.value === gate)?.hint}
        </p>
      </div>
    </div>
  );
}
