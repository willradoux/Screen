import { useEffect, useState } from 'react';
import { applyTheme, readTheme, saveTheme, type Theme } from '../lib/theme';
import { Icon } from './Icon';

/** Alterna entre o tema escuro e o claro. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  useEffect(() => applyTheme(theme), [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
      aria-label={next === 'light' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size="1.35rem" />
    </button>
  );
}
