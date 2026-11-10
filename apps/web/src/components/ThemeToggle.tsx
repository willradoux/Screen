import { useEffect, useState } from 'react';
import {
  MODES,
  THEMES,
  applyMode,
  applyTheme,
  readMode,
  readMotion,
  readTheme,
  saveMode,
  saveMotion,
  saveTheme,
  themeInfo,
  type Mode,
  type Motion,
  type Theme,
} from '../lib/theme';
import { Sheet } from './Sheet';

/**
 * Botão de tema: mostra a amostra do fundo atual e abre uma janela para escolher o fundo, o
 * modo (escuro/claro) e se as animações ficam ligadas. Vale na hora e fica salvo.
 */
export function ThemeToggle({
  withLabel = false,
  variant = 'icon',
}: {
  withLabel?: boolean;
  /** `ctl`: botão redondo dos controles da chamada. */
  variant?: 'icon' | 'ctl';
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [mode, setMode] = useState<Mode>(() => readMode());
  const [motion, setMotion] = useState<Motion>(() => readMotion());
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applyMode(mode), [mode]);

  const info = themeInfo(theme);
  const swatch = (t: { swatch: [string, string]; photo?: string }) =>
    t.photo
      ? `url(${t.photo}) center / cover`
      : `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})`;

  return (
    <>
      {variant === 'ctl' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Tema: ${info.label}. Trocar tema`}
          data-tip="Tema"
          className="ctl-button"
        >
          <span className="ctl">
            <span
              aria-hidden="true"
              className="h-5 w-5 rounded-full"
              style={{ background: swatch(info) }}
            />
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Tema: ${info.label}. Trocar tema`}
          className={withLabel ? 'btn btn-ghost btn-sm' : 'icon-button'}
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full"
            style={{ background: swatch(info) }}
          />
          {withLabel && <span aria-hidden="true">{info.label}</span>}
        </button>
      )}

      {open && (
        <Sheet title="Tema" onClose={() => setOpen(false)}>
          <div role="radiogroup" aria-label="Fundo" className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const on = t.value === theme;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    saveTheme(t.value);
                    setTheme(t.value);
                  }}
                  className={`layout-option ${on ? 'layout-option-on' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className="block aspect-[16/10] w-full rounded-[10px]"
                    style={{ background: swatch(t) }}
                  />
                  <span className="text-[12px] font-semibold leading-tight">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div
            role="radiogroup"
            aria-label="Modo"
            className="grid grid-cols-2 gap-1 rounded-full bg-white/6 p-1"
          >
            {MODES.map((m) => {
              const on = m.value === mode;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    saveMode(m.value);
                    setMode(m.value);
                  }}
                  className={`h-9 rounded-full text-[13px] font-semibold transition-colors ${
                    on ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={motion === 'on'}
            onClick={() => {
              const next: Motion = motion === 'on' ? 'off' : 'on';
              saveMotion(next);
              setMotion(next);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-1 text-left"
          >
            <span>
              <span className="block text-sm font-semibold text-zinc-50">Animações</span>
              <span className="block text-xs text-zinc-500">
                {motion === 'on' ? 'Ligadas' : 'Desligadas: tudo fica parado'}
              </span>
            </span>
            <span aria-hidden="true" className="switch" data-on={motion === 'on' || undefined}>
              <span className="switch-knob" />
            </span>
          </button>
        </Sheet>
      )}
    </>
  );
}
