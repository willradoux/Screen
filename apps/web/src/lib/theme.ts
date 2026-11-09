export type Theme = 'dark' | 'light';

const KEY = 'screem-theme';

/** Tema salvo; sem escolha, segue o do sistema (claro ou escuro). */
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Armazenamento bloqueado (janela anônima, por exemplo): segue o sistema.
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#ffffff' : '#090b10');
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  applyTheme(theme);
}
