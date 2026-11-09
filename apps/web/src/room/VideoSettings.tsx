import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { setVideoPrefs, useVideoPrefs, type VideoPrefs } from '../lib/videoPrefs';

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-zinc-500">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              value === o.value
                ? 'bg-zinc-50 text-zinc-950'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Ajustes de como os vídeos aparecem NA SUA TELA (preencher, posição e formato do quadro). */
export function VideoSettings() {
  const [open, setOpen] = useState(false);
  const prefs = useVideoPrefs();
  const set =
    <K extends keyof VideoPrefs>(key: K) =>
    (value: VideoPrefs[K]) =>
      setVideoPrefs({ [key]: value } as Partial<VideoPrefs>);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Ajustes do vídeo"
        className="group flex min-w-16 flex-col items-center gap-1 text-[0.7rem] font-medium text-zinc-300 focus:outline-none"
      >
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-brand-300 ${
            open ? 'bg-zinc-50 text-zinc-950' : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
          }`}
        >
          <Icon name="settings" size="1.5rem" />
        </span>
        <span aria-hidden="true">Vídeo</span>
      </button>

      {open && (
        <Sheet title="Como ver o vídeo" onClose={() => setOpen(false)}>
          <p className="text-xs text-zinc-500">
            Vale só para a sua tela; não muda o que os outros veem.
          </p>
          <Choice
            legend="Enquadramento"
            value={prefs.fit}
            onChange={set('fit')}
            options={[
              { value: 'cover', label: 'Preencher' },
              { value: 'contain', label: 'Mostrar tudo' },
            ]}
          />
          <Choice
            legend="Parte da imagem"
            value={prefs.position}
            onChange={set('position')}
            options={[
              { value: 'top', label: 'Mais para cima' },
              { value: 'center', label: 'Centro' },
              { value: 'bottom', label: 'Mais para baixo' },
            ]}
          />
          <Choice
            legend="Formato do quadro"
            value={prefs.shape}
            onChange={set('shape')}
            options={[
              { value: 'auto', label: 'Automático' },
              { value: 'landscape', label: 'Horizontal' },
              { value: 'portrait', label: 'Vertical' },
              { value: 'square', label: 'Quadrado' },
            ]}
          />
          <p className="text-xs text-zinc-500">
            Automático segue a transmissão: se a pessoa transmite na vertical, aparece na vertical;
            se deitar o celular, o quadro deita junto.
          </p>
        </Sheet>
      )}
    </div>
  );
}
