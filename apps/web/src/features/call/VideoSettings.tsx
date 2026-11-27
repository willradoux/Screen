import { useRef, useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { Popover } from '../../shared/ui/Popover';
import { setVideoPrefs, useVideoPrefs, type VideoPrefs } from './lib/videoPrefs';

/** Uma linha de escolha: o nome em cima e as opções numa pílula (como o "Modo" do Tema). */
function Segment<T extends string>({
  legend,
  hint,
  value,
  options,
  onChange,
}: {
  legend: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="pop-row">
      <p className="pop-row-label">
        {legend}
        {hint && <span className="pop-row-hint"> · {hint}</span>}
      </p>
      <div role="radiogroup" aria-label={legend} className="pref-segment pop-segment">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ajustes de como os vídeos aparecem NA SUA TELA (preencher, posição e formato do quadro). */
export function VideoSettings() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const prefs = useVideoPrefs();
  const set =
    <K extends keyof VideoPrefs>(key: K) =>
    (value: VideoPrefs[K]) =>
      setVideoPrefs({ [key]: value } as Partial<VideoPrefs>);

  return (
    <div>
      <button
        type="button"
        ref={button}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ajustes do vídeo"
        data-tip="Vídeo"
        className="ctl-button"
      >
        <span className="ctl" data-on={open || undefined}>
          <Icon name="settings" size="1.35rem" />
        </span>
      </button>

      {open && (
        <Popover anchor={button} title="Vídeo" width={360} onClose={() => setOpen(false)}>
          <Segment
            legend="Enquadramento"
            value={prefs.fit}
            onChange={set('fit')}
            options={[
              { value: 'cover', label: 'Preencher' },
              { value: 'contain', label: 'Mostrar tudo' },
            ]}
          />
          {prefs.fit === 'cover' && (
            <Segment
              legend="Parte da imagem"
              value={prefs.position}
              onChange={set('position')}
              options={[
                { value: 'top', label: 'Cima' },
                { value: 'center', label: 'Centro' },
                { value: 'bottom', label: 'Baixo' },
              ]}
            />
          )}
          <Segment
            legend="Formato do quadro"
            value={prefs.shape}
            onChange={set('shape')}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'landscape', label: 'Deitado' },
              { value: 'portrait', label: 'Em pé' },
              { value: 'square', label: 'Quadrado' },
            ]}
          />
          <Segment
            legend="Minha câmera"
            hint="todo mundo te vê assim"
            value={prefs.selfie}
            onChange={set('selfie')}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'mirror', label: 'Espelhada' },
            ]}
          />
        </Popover>
      )}
    </div>
  );
}
