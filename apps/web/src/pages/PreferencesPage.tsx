import { useState } from 'react';
import { PageTitle, Section } from '../components/ui';
import { playSound, readSounds, saveSounds } from '../lib/sounds';
import {
  MODES,
  THEMES,
  readMode,
  readMotion,
  readTheme,
  saveMode,
  saveMotion,
  saveTheme,
  type Mode,
  type Motion,
  type Theme,
} from '../lib/theme';

/** Preferências de quem usa: modo (escuro/claro) e fundo. Fica salvo neste navegador. */
export function PreferencesPage() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [mode, setMode] = useState<Mode>(() => readMode());
  const [motion, setMotion] = useState<Motion>(() => readMotion());
  const [sounds, setSounds] = useState(() => readSounds());

  function choose(next: Theme) {
    saveTheme(next);
    setTheme(next);
    setMode(readMode()); // o fundo Preto liga o modo escuro
  }

  return (
    <>
      <PageTitle description="Valem só para você, neste navegador.">Preferências</PageTitle>
      <Section title="Modo">
        <div role="radiogroup" aria-label="Modo" className="grid grid-cols-2 gap-2">
          {MODES.map((o) => {
            const on = mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  saveMode(o.value);
                  setMode(o.value);
                }}
                className={`glass glass-button p-3 text-left ${on ? 'glass-selected' : ''}`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`h-6 w-6 rounded-full ${o.value === 'dark' ? 'bg-[#000] shadow-[0_0_0_1px_rgb(255_255_255/0.2)]' : 'bg-[#fff]'}`}
                  />
                  <span className="text-sm font-semibold text-white">{o.label}</span>
                </span>
                <span className="mt-1.5 block text-xs text-zinc-400">{o.text}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <div className="h-6" />
      <Section title="Fundo">
        <div role="radiogroup" aria-label="Fundo" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((o) => {
            const on = theme === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(o.value)}
                className={`glass glass-button p-3 text-left ${on ? 'glass-selected' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className="block h-16 rounded-xl bg-cover bg-center"
                  style={{
                    backgroundImage: o.photo
                      ? `url(${o.photo})`
                      : `linear-gradient(135deg, ${o.swatch[0]}, ${o.swatch[1]})`,
                  }}
                />
                <span className="mt-2.5 flex items-center justify-between px-0.5">
                  <span className="text-sm font-semibold text-white">{o.label}</span>
                  {on && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-400" />}
                </span>
                <span className="block px-0.5 text-xs text-zinc-400">{o.text}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <div className="h-6" />
      <Section title="Animações">
        <button
          type="button"
          role="switch"
          aria-checked={motion === 'on'}
          onClick={() => {
            const next: Motion = motion === 'on' ? 'off' : 'on';
            saveMotion(next);
            setMotion(next);
          }}
          className="glass glass-button flex w-full items-center justify-between gap-4 p-4 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-white">
              {motion === 'on' ? 'Animações ligadas' : 'Animações desligadas'}
            </span>
            <span className="mt-0.5 block text-xs text-zinc-400">
              Desligue se o movimento incomodar ou se o aparelho for mais lento. A abertura, as
              transições e o fundo ficam parados.
            </span>
          </span>
          <span aria-hidden="true" className="switch" data-on={motion === 'on' || undefined}>
            <span className="switch-knob" />
          </span>
        </button>
      </Section>
      <div className="h-6" />
      <Section title="Sons">
        <button
          type="button"
          role="switch"
          aria-checked={sounds}
          onClick={() => {
            saveSounds(!sounds);
            setSounds(!sounds);
            if (!sounds) playSound('notify');
          }}
          className="glass glass-button flex w-full items-center justify-between gap-4 p-4 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-white">
              {sounds ? 'Sons ligados' : 'Sons desligados'}
            </span>
            <span className="mt-0.5 block text-xs text-zinc-400">
              Um toque curto quando alguém entra ou sai da sala e quando chega um aviso.
            </span>
          </span>
          <span aria-hidden="true" className="switch" data-on={sounds || undefined}>
            <span className="switch-knob" />
          </span>
        </button>
      </Section>
    </>
  );
}
