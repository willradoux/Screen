import type { LocalParticipant } from 'livekit-client';
import { useState } from 'react';
import { Button } from '../components/ui';
import { canShareScreen, mediaErrorMessage } from '../lib/media';
import type { MediaSource } from '../lib/types';
import { canUseSource } from './publish-rules';

interface Props {
  local: LocalParticipant;
  allowedSources: MediaSource[] | undefined;
  /** Texto de por que não dá para transmitir (modo palestra, silenciado...). */
  restriction: string | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onLeave: () => void;
  onError: (message: string) => void;
}

function ToggleButton({
  on,
  label,
  onLabel,
  offLabel,
  disabled,
  title,
  onClick,
  busy,
}: {
  on: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
  disabled: boolean;
  title?: string | undefined;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <Button
      variant={on ? 'primary' : 'secondary'}
      disabled={disabled}
      loading={busy}
      onClick={onClick}
      aria-pressed={on}
      title={title}
    >
      {label}: {on ? onLabel : offLabel}
    </Button>
  );
}

/** Barra de controles: microfone, câmera, tela, lista de pessoas e sair. */
export function Controls({
  local,
  allowedSources,
  restriction,
  panelOpen,
  onTogglePanel,
  onLeave,
  onError,
}: Props) {
  const [busy, setBusy] = useState<'microphone' | 'camera' | 'screen' | null>(null);

  async function toggle(kind: 'microphone' | 'camera' | 'screen') {
    setBusy(kind);
    try {
      if (kind === 'microphone') await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
      else if (kind === 'camera') await local.setCameraEnabled(!local.isCameraEnabled);
      else {
        await local.setScreenShareEnabled(!local.isScreenShareEnabled, {
          audio: true,
          contentHint: 'detail', // legibilidade do código acima de fluidez
          resolution: { width: 1920, height: 1080, frameRate: 30 },
        });
      }
    } catch (err) {
      const message = mediaErrorMessage(err, kind);
      if (message) onError(message);
    } finally {
      setBusy(null);
    }
  }

  const blocked = restriction !== null;
  const disabled = (source: MediaSource) => blocked || !canUseSource(allowedSources, source);

  return (
    <div
      role="toolbar"
      aria-label="Controles da sala"
      className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3"
    >
      <ToggleButton
        label="Microfone"
        on={local.isMicrophoneEnabled}
        onLabel="ligado"
        offLabel="desligado"
        disabled={disabled('microphone')}
        title={restriction ?? undefined}
        busy={busy === 'microphone'}
        onClick={() => void toggle('microphone')}
      />
      <ToggleButton
        label="Câmera"
        on={local.isCameraEnabled}
        onLabel="ligada"
        offLabel="desligada"
        disabled={disabled('camera')}
        title={restriction ?? undefined}
        busy={busy === 'camera'}
        onClick={() => void toggle('camera')}
      />
      {canShareScreen() && (
        <ToggleButton
          label="Tela"
          on={local.isScreenShareEnabled}
          onLabel="compartilhando"
          offLabel="parada"
          disabled={disabled('screen_share')}
          title={restriction ?? undefined}
          busy={busy === 'screen'}
          onClick={() => void toggle('screen')}
        />
      )}

      <span className="mx-1 hidden h-6 w-px bg-zinc-700 sm:block" />

      <Button onClick={onTogglePanel} aria-pressed={panelOpen}>
        Pessoas
      </Button>
      <Button variant="danger" onClick={onLeave}>
        Sair da sala
      </Button>

      {restriction && (
        <p className="w-full text-center text-xs text-amber-300" role="status">
          {restriction}
        </p>
      )}
    </div>
  );
}
