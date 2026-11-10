import type { LocalParticipant, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';
import { Track } from 'livekit-client';
import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { applyBackground, BACKGROUND_IMAGES, backgroundSupported } from '../lib/videoEffects';
import { createVoiceProcessor, VOICE_PRESETS, type VoicePreset } from '../lib/voiceEffects';
import { speechSupported } from './captions';

interface Props {
  local: LocalParticipant;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  onError: (m: string) => void;
}

function Chip({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        active ? 'bg-zinc-50 text-zinc-950' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
      }`}
    >
      {children}
    </button>
  );
}

/** Efeitos: fundo da câmera, voz e legendas. Tudo acontece no seu navegador. */
export function EffectsPanel({ local, captionsOn, onToggleCaptions, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [bg, setBg] = useState('none');
  const [voice, setVoice] = useState<VoicePreset>('none');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickBackground(id: string, choice: Parameters<typeof applyBackground>[1]) {
    const cam = local.getTrackPublication(Track.Source.Camera)?.track as
      LocalVideoTrack | undefined;
    if (!cam) return onError('Ligue a câmera primeiro para usar um fundo.');
    setBusy(`bg-${id}`);
    try {
      if (choice.kind !== 'none' && !(await backgroundSupported())) {
        return onError(
          'Este navegador não consegue recortar o fundo. Tente o Chrome ou o Edge atualizados.',
        );
      }
      await applyBackground(cam, choice);
      setBg(id);
    } catch {
      onError('Não consegui aplicar o fundo. Seu aparelho pode ser fraco demais para esse efeito.');
    } finally {
      setBusy(null);
    }
  }

  async function pickVoice(preset: VoicePreset) {
    const mic = local.getTrackPublication(Track.Source.Microphone)?.track as
      LocalAudioTrack | undefined;
    if (!mic) return onError('Ligue o microfone primeiro para mudar a voz.');
    setBusy(`voice-${preset}`);
    try {
      if (preset === 'none') await mic.stopProcessor();
      else await mic.setProcessor(createVoiceProcessor(preset));
      setVoice(preset);
    } catch {
      onError('Não consegui aplicar o efeito de voz neste navegador.');
    } finally {
      setBusy(null);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      return onError('Escolha uma imagem (JPG ou PNG) de até 8 MB.');
    }
    void pickBackground('upload', { kind: 'image', url: URL.createObjectURL(file) });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Efeitos"
        data-tip="Efeitos"
        className="ctl-button"
      >
        <span className="ctl" data-on={open || undefined}>
          <Icon name="palette" size="1.35rem" />
        </span>
      </button>

      {open && (
        <Sheet title="Efeitos" onClose={() => setOpen(false)}>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-zinc-500">Fundo da câmera</legend>
            <div className="flex flex-wrap gap-2">
              <Chip
                active={bg === 'none'}
                disabled={busy !== null}
                onClick={() => void pickBackground('none', { kind: 'none' })}
              >
                Nenhum
              </Chip>
              <Chip
                active={bg === 'blur'}
                disabled={busy !== null}
                onClick={() => void pickBackground('blur', { kind: 'blur' })}
              >
                Desfocar
              </Chip>
              {BACKGROUND_IMAGES.map((b) => (
                <Chip
                  key={b.id}
                  active={bg === b.id}
                  disabled={busy !== null}
                  onClick={() => void pickBackground(b.id, { kind: 'image', url: b.url })}
                >
                  {b.label}
                </Chip>
              ))}
              <Chip
                active={bg === 'upload'}
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
              >
                Sua imagem…
              </Chip>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              aria-label="Enviar imagem de fundo"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <p className="text-xs text-zinc-500">
              Funciona no Chrome e no Edge. Pede um aparelho razoável.
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-zinc-500">Voz</legend>
            <div className="flex flex-wrap gap-2">
              {VOICE_PRESETS.map((v) => (
                <Chip
                  key={v.value}
                  active={voice === v.value}
                  disabled={busy !== null}
                  onClick={() => void pickVoice(v.value)}
                >
                  {v.label}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              {VOICE_PRESETS.find((v) => v.value === voice)?.hint}
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-zinc-500">Legendas ao vivo</legend>
            <Chip active={captionsOn} onClick={onToggleCaptions}>
              {captionsOn ? 'Ligadas' : 'Desligadas'}
            </Chip>
            <p className="text-xs text-zinc-500">
              {speechSupported()
                ? 'Mostra o que os outros falam e transcreve a sua fala. No Chrome e no Edge, o áudio da sua fala é enviado ao serviço de voz do navegador (Google ou Microsoft) para virar texto.'
                : 'Este navegador não transcreve voz, então você só vê as legendas dos outros. Use o Chrome ou o Edge para legendar a sua fala.'}
            </p>
          </fieldset>
        </Sheet>
      )}
    </div>
  );
}
