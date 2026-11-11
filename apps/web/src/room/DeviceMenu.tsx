import { Room, type Room as LiveKitRoom } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { setOutputDevice } from '../lib/audioPrefs';
import { MicProcessing } from './MicProcessing';

export type DeviceKind = 'audio' | 'video' | 'output';
type Kind = DeviceKind;

const SECTIONS: Record<Kind, { kind: MediaDeviceKind; label: string; icon: IconName }[]> = {
  audio: [{ kind: 'audioinput', label: 'Microfone', icon: 'mic' }],
  output: [{ kind: 'audiooutput', label: 'Saída de som', icon: 'headphones' }],
  video: [{ kind: 'videoinput', label: 'Câmera', icon: 'videocam' }],
};

/** O navegador deixa escolher a saída de som? (Firefox e Safari, em geral, não.) */
const canPickOutput = () =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/**
 * Menu para trocar de aparelho sem sair da sala: microfone e saída de som (áudio) ou câmera
 * (vídeo). Mostra o nome que o sistema dá a cada aparelho e marca o que está em uso.
 * Fecha com Esc ou clicando fora.
 */
export function DeviceMenu({
  room,
  kind,
  closing = false,
  onClose,
  onError,
}: {
  room: LiveKitRoom;
  kind: Kind;
  /** Fechando: fica na tela só o tempo da animação de saída. */
  closing?: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [devices, setDevices] = useState<Partial<Record<MediaDeviceKind, MediaDeviceInfo[]>>>({});
  const [active, setActive] = useState<Partial<Record<MediaDeviceKind, string | undefined>>>({});

  // Sem permissão o navegador esconde os aparelhos (até a saída de som): a pessoa pede uma vez.
  const [askedAccess, setAskedAccess] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next: Partial<Record<MediaDeviceKind, MediaDeviceInfo[]>> = {};
      const current: Partial<Record<MediaDeviceKind, string | undefined>> = {};
      for (const section of SECTIONS[kind]) {
        if (section.kind === 'audiooutput' && !canPickOutput()) continue;
        try {
          next[section.kind] = await Room.getLocalDevices(section.kind, askedAccess);
        } catch {
          next[section.kind] = [];
        }
        current[section.kind] = room.getActiveDevice(section.kind);
      }
      if (alive) {
        setDevices(next);
        setActive(current);
      }
    };
    void load();
    // Plugou ou tirou um fone/câmera: atualiza a lista.
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', load);
    };
  }, [kind, room, askedAccess]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      // A setinha que abriu o menu cuida dela mesma (abre/fecha); senão o toque nela fechava
      // aqui e o clique abria de novo na hora.
      if ((e.target as Element | null)?.closest?.('[data-device-toggle]')) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose]);

  async function choose(deviceKind: MediaDeviceKind, deviceId: string) {
    try {
      await room.switchActiveDevice(deviceKind, deviceId);
      // Quem foi aumentado acima de 100% toca pelo Web Audio: ele também troca de saída.
      if (deviceKind === 'audiooutput') setOutputDevice(deviceId);
      setActive((a) => ({ ...a, [deviceKind]: deviceId }));
    } catch {
      onError('Não foi possível trocar de aparelho. Veja se ele está ligado e livre.');
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={kind === 'audio' ? 'Microfone' : kind === 'output' ? 'Saída de som' : 'Câmera'}
      className="device-menu"
      data-closing={closing || undefined}
    >
      {kind === 'output' && !canPickOutput() && (
        <p className="px-2 py-1 text-xs leading-relaxed text-zinc-400">
          Este navegador não deixa escolher a saída de som. No Chrome ou no Edge dá; aqui, o som sai
          pelo aparelho padrão do sistema.
        </p>
      )}
      {SECTIONS[kind].map((section) => {
        const list = devices[section.kind];
        if (!list) return null;
        return (
          <div key={section.kind} className="space-y-1">
            <p className="flex items-center gap-1.5 px-2 text-[11px] font-semibold text-zinc-500">
              <Icon name={section.icon} size="0.95rem" />
              {section.label}
            </p>
            {list.length === 0 ? (
              <p className="px-2 pb-1 text-xs text-zinc-500">
                Nenhum aparelho encontrado. O navegador só mostra a lista depois de liberar o
                acesso.{' '}
                {!askedAccess && (
                  <button
                    type="button"
                    className="font-semibold text-zinc-200 underline underline-offset-2"
                    onClick={() => setAskedAccess(true)}
                  >
                    Permitir e mostrar aparelhos
                  </button>
                )}
              </p>
            ) : (
              <div role="radiogroup" aria-label={section.label} className="space-y-0.5">
                {list.map((d, i) => {
                  const on =
                    active[section.kind] === d.deviceId ||
                    (!active[section.kind] && d.deviceId === 'default');
                  return (
                    <button
                      key={d.deviceId || i}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => void choose(section.kind, d.deviceId)}
                      className="device-option"
                      data-on={on || undefined}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">
                        {d.label || `${section.label} ${i + 1}`}
                      </span>
                      {on && <Icon name="check" size="1rem" className="text-brand-300" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {/* Microfone: tratamento do som (separado dos efeitos de voz). */}
      {kind === 'audio' && <MicProcessing local={room.localParticipant} onError={onError} />}
    </div>
  );
}

/** Estado da permissão do navegador para microfone ou câmera (`denied` mostra o aviso). */
export function usePermission(name: 'microphone' | 'camera'): PermissionState | null {
  const [state, setState] = useState<PermissionState | null>(null);
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state);
    navigator.permissions
      ?.query({ name: name as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener('change', update);
      })
      .catch(() => undefined); // navegador sem essa consulta: sem aviso
    return () => status?.removeEventListener('change', update);
  }, [name]);
  return state;
}
