import { useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { setVideoPrefs, useVideoPrefs, type VideoPrefs } from '../lib/videoPrefs';

/** Um grupo de escolhas: cada opção é um desenho de como o vídeo fica + o nome. */
function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
  columns,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string; preview: ReactNode }[];
  onChange: (v: T) => void;
  columns: 2 | 3 | 4;
}) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns];
  return (
    <fieldset className="space-y-2">
      <legend className="px-1 text-xs font-semibold text-zinc-400">{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`layout-option ${on ? 'layout-option-on' : ''}`}
            >
              <span aria-hidden="true" className="video-preview">
                {o.preview}
              </span>
              <span className="text-[12px] font-semibold leading-tight">{o.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---- Desenhos (só formas; a "pessoa" é um círculo e um ombro) ---- */

const Person = ({ className = '' }: { className?: string }) => (
  <span className={`video-person ${className}`}>
    <span className="video-person-head" />
    <span className="video-person-body" />
  </span>
);

/** Preencher: a imagem ocupa o quadro todo (pode cortar as bordas). */
const FitCover = () => (
  <span className="video-frame">
    <span className="video-image inset-0" />
    <Person />
  </span>
);

/** Mostrar tudo: a imagem inteira aparece, com faixas onde sobra. */
const FitContain = () => (
  <span className="video-frame">
    <span className="video-image inset-x-[22%] inset-y-0" />
    <Person className="scale-75" />
  </span>
);

const Position = ({ at }: { at: 'top' | 'center' | 'bottom' }) => (
  <span className="video-frame">
    <span className="video-image inset-0" />
    <Person
      className={at === 'top' ? '-translate-y-[22%]' : at === 'bottom' ? 'translate-y-[22%]' : ''}
    />
  </span>
);

const Shape = ({ ratio }: { ratio: 'auto' | 'landscape' | 'portrait' | 'square' }) => {
  if (ratio === 'auto') {
    return (
      <span className="flex h-full items-center justify-center text-brand-300">
        <Icon name="auto_awesome_mosaic" size="1.4rem" />
      </span>
    );
  }
  const size = {
    landscape: 'h-[58%] w-[86%]',
    portrait: 'h-[86%] w-[40%]',
    square: 'h-[72%] aspect-square',
  }[ratio];
  return (
    <span className="flex h-full items-center justify-center">
      <span className={`video-shape ${size}`} />
    </span>
  );
};

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
        data-tip="Vídeo"
        className="ctl-button"
      >
        <span className="ctl" data-on={open || undefined}>
          <Icon name="settings" size="1.35rem" />
        </span>
      </button>

      {open && (
        <Sheet title="Como ver o vídeo" onClose={() => setOpen(false)}>
          <p className="px-1 text-xs text-zinc-500">
            <strong className="text-zinc-300">Vale só para a sua tela.</strong> Não muda o que os
            outros veem.
          </p>
          <Choice
            legend="Enquadramento"
            columns={2}
            value={prefs.fit}
            onChange={set('fit')}
            options={[
              { value: 'cover', label: 'Preencher', preview: <FitCover /> },
              { value: 'contain', label: 'Mostrar tudo', preview: <FitContain /> },
            ]}
          />
          <Choice
            legend="Parte da imagem (quando preenche)"
            columns={3}
            value={prefs.position}
            onChange={set('position')}
            options={[
              { value: 'top', label: 'Cima', preview: <Position at="top" /> },
              { value: 'center', label: 'Centro', preview: <Position at="center" /> },
              { value: 'bottom', label: 'Baixo', preview: <Position at="bottom" /> },
            ]}
          />
          <Choice
            legend="Formato do quadro"
            columns={4}
            value={prefs.shape}
            onChange={set('shape')}
            options={[
              { value: 'auto', label: 'Automático', preview: <Shape ratio="auto" /> },
              { value: 'landscape', label: 'Horizontal', preview: <Shape ratio="landscape" /> },
              { value: 'portrait', label: 'Vertical', preview: <Shape ratio="portrait" /> },
              { value: 'square', label: 'Quadrado', preview: <Shape ratio="square" /> },
            ]}
          />
          <p className="px-1 text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-300">Automático</strong> segue a transmissão: quem
            transmite na vertical aparece na vertical; se deitar o celular, o quadro deita junto.
          </p>
        </Sheet>
      )}
    </div>
  );
}
