import { Icon } from '../components/Icon';
import { MAX_VOLUME, setMutedForMe, setVolume, useAudioPrefs } from '../lib/audioPrefs';

/**
 * Volume de uma pessoa só para você (0 a 200%) e "Silenciar para mim". Não muda nada para os
 * outros nem passa pelo servidor.
 */
export function PersonAudio({ id, name }: { id: string; name: string }) {
  const prefs = useAudioPrefs();
  const muted = Boolean(prefs.muted[id]);
  const volume = prefs.volumes[id] ?? 1;
  const pct = Math.round(volume * 100);
  return (
    <div className="person-audio">
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
      <input
        type="range"
        min={0}
        max={MAX_VOLUME * 100}
        step={5}
        value={pct}
        disabled={muted}
        onChange={(e) => setVolume(id, Number(e.target.value) / 100)}
        aria-label={`Volume de ${name} (só para você)`}
        aria-valuetext={`${pct}%`}
        className="person-volume"
        style={{ '--fill': `${(pct / (MAX_VOLUME * 100)) * 100}%` } as React.CSSProperties}
      />
      <span className="person-volume-value tabular">{muted ? 'Mudo' : `${pct}%`}</span>
    </div>
  );
}
