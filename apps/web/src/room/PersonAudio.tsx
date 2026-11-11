import { Icon } from '../components/Icon';
import {
  MAX_VOLUME,
  setMutedForMe,
  setVolume,
  useAudioPrefs,
  volumeKey,
  type AudioSource,
} from '../lib/audioPrefs';

/** Uma barra de volume (0 a 200%) com o valor ao lado. */
function VolumeSlider({
  id,
  source,
  label,
  short,
  disabled,
}: {
  id: string;
  source: AudioSource;
  label: string;
  short: string;
  disabled: boolean;
}) {
  const prefs = useAudioPrefs();
  const pct = Math.round((prefs.volumes[volumeKey(id, source)] ?? 1) * 100);
  return (
    <>
      <span className="person-volume-kind">{short}</span>
      <input
        type="range"
        min={0}
        max={MAX_VOLUME * 100}
        step={5}
        value={pct}
        disabled={disabled}
        onChange={(e) => setVolume(volumeKey(id, source), Number(e.target.value) / 100)}
        aria-label={label}
        aria-valuetext={`${pct}%`}
        className="person-volume"
        style={{ '--fill': `${(pct / (MAX_VOLUME * 100)) * 100}%` } as React.CSSProperties}
      />
      <span className="person-volume-value tabular">{disabled ? 'Mudo' : `${pct}%`}</span>
    </>
  );
}

/**
 * Como você ouve uma pessoa (só para você, nada passa pelo servidor): mutar só para mim, o
 * volume da voz e, se ela está compartilhando a tela com som, o volume da transmissão.
 */
export function PersonAudio({
  id,
  name,
  sharing = false,
}: {
  id: string;
  name: string;
  /** Está compartilhando a tela (mostra o volume da transmissão). */
  sharing?: boolean;
}) {
  const prefs = useAudioPrefs();
  const muted = Boolean(prefs.muted[id]);
  return (
    <div className="person-audio" data-two={sharing || undefined}>
      <button
        type="button"
        onClick={() => setMutedForMe(id, !muted)}
        aria-pressed={muted}
        className="person-pin"
        data-on={muted || undefined}
        aria-label={muted ? `Voltar a ouvir ${name}` : `Mutar ${name} só para mim`}
        title={muted ? 'Voltar a ouvir' : 'Mutar só para mim'}
      >
        <Icon name={muted ? 'volume_off' : 'volume_up'} size="1rem" />
      </button>
      <div className="person-volumes">
        <div className="person-volume-row">
          <VolumeSlider
            id={id}
            source="voz"
            short="Voz"
            label={`Volume de ${name} (só para você)`}
            disabled={muted}
          />
        </div>
        {sharing && (
          <div className="person-volume-row">
            <VolumeSlider
              id={id}
              source="tela"
              short="Tela"
              label={`Volume da transmissão de ${name} (só para você)`}
              disabled={muted}
            />
          </div>
        )}
      </div>
    </div>
  );
}
