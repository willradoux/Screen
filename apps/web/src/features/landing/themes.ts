/*
 * Temas da página de apresentação (/sobre): mudam o céu, o sol, o neon e a TV. São só da LP
 * (não mexem no tema do site) e ficam salvos neste navegador.
 */

export interface LpTheme {
  id: string;
  label: string;
  /** Amostra do botão de tema (as duas cores do neon). */
  swatch: [string, string];
}

export const LP_THEMES: LpTheme[] = [
  { id: 'screen', label: 'Screen', swatch: ['#d7f56b', '#9b7bff'] },
  { id: 'acelera', label: 'Acelera', swatch: ['#5ef0d0', '#00b39c'] },
  { id: 'synthwave', label: 'Synthwave', swatch: ['#ffb347', '#ff4f93'] },
  { id: 'brasa', label: 'Brasa', swatch: ['#ffcf5a', '#ff4d2e'] },
  { id: 'gelo', label: 'Gelo', swatch: ['#c7ecff', '#7b9bff'] },
];

const KEY = 'screem-lp-theme';

export function readLpTheme(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (LP_THEMES.some((t) => t.id === saved)) return saved!;
  } catch {
    // Sem armazenamento (janela anônima): vale o padrão.
  }
  return 'screen';
}

export function saveLpTheme(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
}

/** O tema seguinte (o botão do topo passa de um em um e volta ao primeiro). */
export function nextLpTheme(id: string): string {
  const i = LP_THEMES.findIndex((t) => t.id === id);
  return LP_THEMES[(i + 1) % LP_THEMES.length]!.id;
}

export const lpTheme = (id: string) => LP_THEMES.find((t) => t.id === id) ?? LP_THEMES[0]!;
