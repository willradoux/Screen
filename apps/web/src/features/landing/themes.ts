import { nextTheme, readTheme, saveTheme, themeInfo, type Theme } from '../../shared/lib/theme';

/*
 * A LP usa o mesmo tema do site: o céu, o sol, o neon e a TV mudam junto. Trocar aqui troca no
 * site também (fica salvo neste navegador). Cada tema do site tem o seu cenário em landing.css
 * (`data-lp-theme`).
 */

const SCENE: Record<Theme, string> = {
  screem: 'screen',
  synthwave: 'neon',
  classico: 'synthwave',
  sunset: 'brasa',
  acelera: 'acelera',
  gelo: 'gelo',
};

export interface LpTheme {
  id: Theme;
  /** Cenário da LP (o `data-lp-theme` do landing.css). */
  scene: string;
  label: string;
  swatch: [string, string];
}

export function lpTheme(id: Theme): LpTheme {
  const t = themeInfo(id);
  return { id: t.value, scene: SCENE[t.value], label: t.label, swatch: t.swatch };
}

export const readLpTheme = (): Theme => readTheme();

/** Troca o tema do site e da LP de uma vez (o seguinte da lista). */
export function nextLpTheme(id: Theme): Theme {
  const next = nextTheme(id);
  saveTheme(next);
  return next;
}
