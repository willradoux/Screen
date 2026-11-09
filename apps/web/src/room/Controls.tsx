import type { LocalParticipant } from 'livekit-client';
import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { canShareScreen, mediaErrorMessage, SCREEN_REFUSED_AT_ONCE } from '../lib/media';
import type { MediaSource } from '../lib/types';
import { canUseSource } from './publish-rules';
import { EffectsPanel } from './EffectsPanel';
import { VideoSettings } from './VideoSettings';

interface Props {
  local: LocalParticipant;
  allowedSources: MediaSource[] | undefined;
  /** Texto de por que não dá para transmitir (modo palestra, silenciado...). */
  restriction: string | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onLeave: () => void;
  onError: (message: string) => void;
  /** Pedir a palavra (só reuniões). */
  hand?: { raised: boolean; busy: boolean; onToggle: () => void };
  captions?: { on: boolean; onToggle: () => void };
}

const SCREEN_UNSUPPORTED =
  'Compartilhar tela só funciona no computador. Os navegadores de celular e tablet não permitem, nem instalando o Screem como app. Para mostrar a tela, entre pelo computador; no celular você pode transmitir a câmera.';

/** Botão redondo de controle: ícone, rótulo curto e nome completo para leitores de tela. */
function RoundButton({
  icon,
  short,
  fullLabel,
  active = false,
  danger = false,
  disabled = false,
  busy = false,
  title,
  onClick,
}: {
  icon: IconName;
  short: string;
  fullLabel: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  title?: string | undefined;
  onClick: () => void;
}) {
  const tone = danger
    ? 'bg-red-600 text-zinc-950 hover:bg-red-500'
    : active
      ? 'bg-zinc-50 text-zinc-950 hover:bg-zinc-200'
      : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={fullLabel}
      aria-pressed={danger ? undefined : active}
      aria-busy={busy || undefined}
      title={title}
      className="group flex min-w-16 flex-col items-center gap-1 text-[0.7rem] font-medium text-zinc-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-brand-300 sm:h-13 sm:w-13 ${tone}`}
      >
        <Icon
          name={busy ? 'progress_activity' : icon}
          size="1.5rem"
          className={busy ? 'animate-spin' : ''}
        />
      </span>
      <span aria-hidden="true">{short}</span>
    </button>
  );
}

/**
 * Barra de controles. Microfone, câmera e tela são independentes: dá para transmitir só a
 * câmera, só a tela, ou as duas ao mesmo tempo. Tudo começa desligado.
 */
export function Controls({
  local,
  allowedSources,
  restriction,
  panelOpen,
  onTogglePanel,
  onLeave,
  onError,
  hand,
  captions,
}: Props) {
  const [busy, setBusy] = useState<'microphone' | 'camera' | 'screen' | null>(null);
  const screenSupported = canShareScreen();

  async function toggle(kind: 'microphone' | 'camera' | 'screen') {
    setBusy(kind);
    const startedAt = Date.now();
    try {
      if (kind === 'microphone') await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
      else if (kind === 'camera') {
        await local.setCameraEnabled(!local.isCameraEnabled);
      } else {
        await local.setScreenShareEnabled(!local.isScreenShareEnabled, {
          audio: true,
          contentHint: 'detail', // legibilidade do código acima de fluidez
          resolution: { width: 1920, height: 1080, frameRate: 30 },
        });
      }
    } catch (err) {
      let message = mediaErrorMessage(err, kind);
      // Fechar a janela de escolha da tela não é erro; recusar na hora (sem janela) é.
      if (
        !message &&
        kind === 'screen' &&
        err instanceof Error &&
        err.name === 'NotAllowedError' &&
        Date.now() - startedAt < 500
      ) {
        message = SCREEN_REFUSED_AT_ONCE;
      }
      if (message) onError(message);
    } finally {
      setBusy(null);
    }
  }

  const blocked = restriction !== null;
  const disabled = (source: MediaSource) => blocked || !canUseSource(allowedSources, source);
  const mic = local.isMicrophoneEnabled;
  const cam = local.isCameraEnabled;
  const screen = local.isScreenShareEnabled;

  return (
    <div
      role="toolbar"
      aria-label="Controles da sala"
      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-3 backdrop-blur"
    >
      <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-3 sm:gap-x-5">
        <RoundButton
          icon={mic ? 'mic' : 'mic_off'}
          short={mic ? 'Mic ligado' : 'Mic mudo'}
          fullLabel={`Microfone: ${mic ? 'ligado' : 'desligado'}`}
          active={mic}
          disabled={disabled('microphone')}
          title={restriction ?? undefined}
          busy={busy === 'microphone'}
          onClick={() => void toggle('microphone')}
        />
        <RoundButton
          icon={cam ? 'videocam' : 'videocam_off'}
          short="Câmera"
          fullLabel={`Câmera: ${cam ? 'ligada' : 'desligada'}`}
          active={cam}
          disabled={disabled('camera')}
          title={restriction ?? undefined}
          busy={busy === 'camera'}
          onClick={() => void toggle('camera')}
        />
        <RoundButton
          icon={screen ? 'stop_screen_share' : 'screen_share'}
          short="Tela"
          fullLabel={`Tela: ${screen ? 'compartilhando' : 'parada'}`}
          active={screen}
          disabled={!screenSupported || disabled('screen_share')}
          title={screenSupported ? (restriction ?? undefined) : SCREEN_UNSUPPORTED}
          busy={busy === 'screen'}
          onClick={() => void toggle('screen')}
        />
        {hand && (
          <RoundButton
            icon="front_hand"
            short={hand.raised ? 'Abaixar mão' : 'Pedir a palavra'}
            fullLabel={hand.raised ? 'Abaixar a mão' : 'Pedir a palavra'}
            active={hand.raised}
            busy={hand.busy}
            onClick={hand.onToggle}
          />
        )}
        <VideoSettings />
        {captions && (
          <EffectsPanel
            local={local}
            captionsOn={captions.on}
            onToggleCaptions={captions.onToggle}
            onError={onError}
          />
        )}
        <RoundButton
          icon="group"
          short="Pessoas"
          fullLabel="Pessoas"
          active={panelOpen}
          onClick={onTogglePanel}
        />
        <RoundButton
          icon="call_end"
          short="Sair"
          fullLabel="Sair da sala"
          danger
          onClick={onLeave}
        />
      </div>

      {!screenSupported && (
        <p className="mt-3 text-center text-xs text-zinc-500" role="note">
          <Icon name="info" size="1em" className="mr-1" />
          {SCREEN_UNSUPPORTED}
        </p>
      )}
      {restriction && (
        <p className="mt-3 text-center text-xs text-amber-300" role="status">
          {restriction}
        </p>
      )}
    </div>
  );
}
