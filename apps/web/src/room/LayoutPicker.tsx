import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { STAGE_LAYOUTS, type StageLayout } from './Stage';

const ICON: Record<StageLayout, IconName> = {
  auto: 'auto_awesome_mosaic',
  mosaic: 'grid_view',
};

/** Um retângulo do desenho: cinza (câmera) ou com a cor do tema (tela compartilhada). */
const Box = ({ screen = false, className = '' }: { screen?: boolean; className?: string }) => (
  <span
    className={`block rounded-[5px] ${screen ? 'bg-brand-400/80' : 'bg-white/25'} ${className}`}
  />
);

/** Desenho de cada layout: mostra como a tela fica, sem texto. */
function Preview({ value }: { value: StageLayout }) {
  if (value === 'mosaic') {
    return (
      <span className="grid h-full grid-cols-2 grid-rows-2 gap-1">
        <Box />
        <Box />
        <Box />
        <Box />
      </span>
    );
  }
  // Automático: quem fala (ou a tela, que tem prioridade) grande e o resto numa faixa.
  return (
    <span className="grid h-full grid-rows-[1fr_26%] gap-1">
      <Box screen />
      <span className="grid grid-cols-3 gap-1">
        <Box />
        <Box />
        <Box />
      </span>
    </span>
  );
}

/**
 * Botão de layout do palco: abre uma janela com os jeitos de organizar a tela, cada um
 * com um desenho e o nome. Escolher aplica na hora e fecha.
 */
export function LayoutPicker({
  value,
  onChange,
}: {
  value: StageLayout;
  onChange: (next: StageLayout) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = STAGE_LAYOUTS.find((l) => l.value === value)?.label ?? value;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Layout: ${current}`}
        data-tip={`Layout: ${current}`}
        className="ctl-button"
      >
        <span className="ctl" data-on={open || undefined}>
          <Icon name={ICON[value]} size="1.35rem" />
        </span>
      </button>

      {open && (
        <Sheet title="Layout" onClose={() => setOpen(false)}>
          <div role="radiogroup" aria-label="Layout" className="grid grid-cols-2 gap-2">
            {STAGE_LAYOUTS.map((l) => {
              const on = l.value === value;
              return (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    onChange(l.value);
                    setOpen(false);
                  }}
                  className={`layout-option ${on ? 'layout-option-on' : ''}`}
                >
                  <span aria-hidden="true" className="layout-preview">
                    <Preview value={l.value} />
                  </span>
                  <span className="text-[13px] font-medium">{l.label}</span>
                </button>
              );
            })}
          </div>
          <p className="px-1 text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-300">Automático</strong>: quem está compartilhando a tela
            fica grande; sem tela, quem está falando. Para escolher, fixe a câmera ou a tela de
            alguém (no vídeo ou na lista de pessoas).
          </p>
        </Sheet>
      )}
    </div>
  );
}
