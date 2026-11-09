import { useState } from 'react';
import { PageTitle, Section } from '../components/ui';
import { applyTheme, readTheme, saveTheme, type Theme } from '../lib/theme';

const OPTIONS: { value: Theme; label: string; text: string }[] = [
  { value: 'light', label: 'Claro', text: 'Fundo branco, texto preto. É o padrão.' },
  { value: 'dark', label: 'Escuro', text: 'Fundo preto, texto branco.' },
];

/** Preferências de quem usa: por enquanto, a aparência. Fica salvo neste navegador. */
export function PreferencesPage() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  function choose(next: Theme) {
    saveTheme(next);
    applyTheme(next);
    setTheme(next);
  }

  return (
    <>
      <PageTitle description="Valem só para você, neste navegador.">Preferências</PageTitle>
      <Section title="Aparência">
        <div role="radiogroup" aria-label="Tema" className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const on = theme === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(o.value)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  on
                    ? 'border-brand-400 bg-zinc-900'
                    : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-50">{o.label}</span>
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-brand-400' : 'bg-zinc-700'}`}
                  />
                </span>
                <span className="mt-1 block text-sm text-zinc-400">{o.text}</span>
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}
