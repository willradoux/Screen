import type { LocalParticipant, Room as LiveKitRoom } from 'livekit-client';
import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { NORMAL_PROFILE, type PublishProfile } from '../lib/bigRoom';
import { canShareScreen, mediaErrorMessage, SCREEN_REFUSED_AT_ONCE } from '../lib/media';
import type { MediaSource } from '../lib/types';
import { canUseSource } from './publish-rules';
import { EffectsPanel } from './EffectsPanel';
import { DeviceMenu, usePermission } from './DeviceMenu';
import { LayoutPicker } from './LayoutPicker';
import type { StageLayout } from './Stage';
import { VideoSettings } from './VideoSettings';
import { ThemeToggle } from '../components/ThemeToggle';

interface Props {
  local: LocalParticipant;
  /** Sala do LiveKit: para trocar de microfone, saída de som e câmera. */
  room?: LiveKitRoom;
  /** Qualidade de publicação (sala grande publica mais leve). */
  profile?: PublishProfile;
  allowedSources: MediaSource[] | undefined;
  /** Texto de por que não dá para transmitir (modo palestra, silenciado...). */
  restriction: string | null;
  /** Painel de pessoas aberto. */
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** Organização do palco (escolhida numa janela com desenhos). */
  layout?: { value: StageLayout; onChange: (next: StageLayout) => void };
  /** `media`: a pílula de baixo; `rail`: o trilho de opções da esquerda. */
  variant?: 'media' | 'rail';
  onLeave: () => void;
  onError: (message: string) => void;
  /** Pedir a palavra (só reuniões). */
  hand?: { raised: boolean; busy: boolean; onToggle: () => void };
  captions?: { on: boolean; onToggle: () => void };
}

const SCREEN_UNSUPPORTED_SHORT = 'Compartilhar tela só funciona no computador.';

/** Botão redondo de controle: ícone, rótulo curto e nome completo para leitores de tela. */
function RoundButton({
  icon,
  short,
  fullLabel,
  active = false,
  danger = false,
  off = false,
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
  /** Microfone/câmera desligados: vermelho suave, para ninguém achar que está no ar. */
  off?: boolean;
  disabled?: boolean;
  busy?: boolean;
  title?: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={fullLabel}
      aria-pressed={danger ? undefined : active}
      aria-busy={busy || undefined}
      data-tip={title ?? short}
      className="ctl-button disabled:cursor-not-allowed"
    >
      <span
        className="ctl"
        data-on={active || undefined}
        data-off={off || undefined}
        data-danger={danger || undefined}
      >
        <Icon
          name={busy ? 'progress_activity' : icon}
          size="1.35rem"
          className={busy ? 'animate-spin' : ''}
        />
      </span>
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
  layout,
  variant = 'media',
  room,
  profile = NORMAL_PROFILE,
}: Props) {
  const [menu, setMenu] = useState<'audio' | 'video' | null>(null);
  const micPermission = usePermission('microphone');
  const camPermission = usePermission('camera');
  const [busy, setBusy] = useState<'microphone' | 'camera' | 'screen' | null>(null);
  const screenSupported = canShareScreen();

  async function toggle(kind: 'microphone' | 'camera' | 'screen') {
    setBusy(kind);
    const startedAt = Date.now();
    try {
      if (kind === 'microphone')
        await local.setMicrophoneEnabled(
          !local.isMicrophoneEnabled,
          profile.microphone.capture,
          profile.microphone.publish,
        );
      else if (kind === 'camera') {
        await local.setCameraEnabled(
          !local.isCameraEnabled,
          profile.camera.capture,
          profile.camera.publish,
        );
      } else {
        await local.setScreenShareEnabled(
          !local.isScreenShareEnabled,
          profile.screen.capture,
          profile.screen.publish,
        );
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

  // Trilho da esquerda ("Mais opções"): conversa, pessoas e ajustes, um embaixo do outro.
  if (variant === 'rail') {
    return (
      <div role="group" aria-label="Opções da sala" className="rail-tools">
        <RoundButton
          icon="group"
          short="Pessoas"
          fullLabel="Pessoas"
          active={panelOpen}
          onClick={onTogglePanel}
        />
        {hand && (
          <RoundButton
            icon="front_hand"
            short={hand.raised ? 'Abaixar a mão' : 'Pedir a palavra'}
            fullLabel={hand.raised ? 'Abaixar a mão' : 'Pedir a palavra'}
            active={hand.raised}
            busy={hand.busy}
            onClick={hand.onToggle}
          />
        )}
        {layout && <LayoutPicker value={layout.value} onChange={layout.onChange} />}
        <VideoSettings />
        <ThemeToggle variant="ctl" />
      </div>
    );
  }

  // Pílula de baixo: só a voz, a imagem e a tela, "Mais opções" e sair.
  return (
    <div
      role="toolbar"
      aria-label="Controles da sala"
      className="relative flex flex-col items-center"
    >
      {menu && room && (
        <DeviceMenu room={room} kind={menu} onClose={() => setMenu(null)} onError={onError} />
      )}
      <div className="ctl-row">
        <div className="ctl-group" role="group" aria-label="Mídia">
          <span className="ctl-split">
            {room && (
              <DeviceToggle
                label="Trocar aparelho de áudio"
                open={menu === 'audio'}
                onClick={() => setMenu((m) => (m === 'audio' ? null : 'audio'))}
              />
            )}
            <span className="relative">
              <RoundButton
                icon={mic ? 'mic' : 'mic_off'}
                short={
                  micPermission === 'denied'
                    ? 'Permissão necessária'
                    : mic
                      ? 'Desligar microfone'
                      : 'Ligar microfone'
                }
                fullLabel={`Microfone: ${mic ? 'ligado' : 'desligado'}${
                  micPermission === 'denied' ? ' (permissão necessária no navegador)' : ''
                }`}
                active={mic}
                off={!mic}
                disabled={disabled('microphone')}
                title={restriction ?? undefined}
                busy={busy === 'microphone'}
                onClick={() => void toggle('microphone')}
              />
              {micPermission === 'denied' && <PermissionBadge />}
            </span>
          </span>
          <span className="ctl-split">
            {room && (
              <DeviceToggle
                label="Trocar aparelho de vídeo"
                open={menu === 'video'}
                onClick={() => setMenu((m) => (m === 'video' ? null : 'video'))}
              />
            )}
            <span className="relative">
              <RoundButton
                icon={cam ? 'videocam' : 'videocam_off'}
                short={
                  camPermission === 'denied'
                    ? 'Permissão necessária'
                    : cam
                      ? 'Desligar câmera'
                      : 'Ligar câmera'
                }
                fullLabel={`Câmera: ${cam ? 'ligada' : 'desligada'}${
                  camPermission === 'denied' ? ' (permissão necessária no navegador)' : ''
                }`}
                active={cam}
                off={!cam}
                disabled={disabled('camera')}
                title={restriction ?? undefined}
                busy={busy === 'camera'}
                onClick={() => void toggle('camera')}
              />
              {camPermission === 'denied' && <PermissionBadge />}
            </span>
          </span>
          {/* Efeitos (fundo da câmera, voz, legendas): logo depois da câmera. */}
          {captions && (
            <EffectsPanel
              local={local}
              captionsOn={captions.on}
              onToggleCaptions={captions.onToggle}
              onError={onError}
            />
          )}
          <RoundButton
            icon={screen ? 'stop_screen_share' : 'screen_share'}
            short={screen ? 'Parar de compartilhar' : 'Compartilhar tela'}
            fullLabel={`Tela: ${screen ? 'compartilhando' : 'parada'}`}
            active={screen}
            disabled={!screenSupported || disabled('screen_share')}
            title={screenSupported ? (restriction ?? undefined) : SCREEN_UNSUPPORTED_SHORT}
            busy={busy === 'screen'}
            onClick={() => void toggle('screen')}
          />
        </div>
        <RoundButton
          icon="call_end"
          short="Sair da sala"
          fullLabel="Sair da sala"
          danger
          onClick={onLeave}
        />
      </div>

      {restriction && (
        <p className="mt-1.5 px-3 text-center text-[11px] text-amber-300" role="status">
          {restriction}
        </p>
      )}
    </div>
  );
}

/** Setinha colada no botão: abre a escolha de aparelho (como no Meet). */
function DeviceToggle({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-tip={label}
      data-device-toggle=""
      onClick={onClick}
      className="ctl-button ctl-chevron"
      data-open={open || undefined}
    >
      <Icon name={open ? 'keyboard_arrow_down' : 'keyboard_arrow_up'} size="1.05rem" />
    </button>
  );
}

/** "!" amarelo: o navegador bloqueou o acesso. */
function PermissionBadge() {
  return (
    <span aria-hidden="true" className="perm-badge" title="Permissão necessária">
      !
    </span>
  );
}
