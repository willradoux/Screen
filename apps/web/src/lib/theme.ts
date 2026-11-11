/**
 * Aparência do Screen em duas escolhas independentes:
 *
 * - **Modo** (`data-mode`): escuro (padrão) ou claro.
 * - **Cor** (`data-theme`): a cor dos detalhes (botão de entrar, chaves ligadas, item ativo,
 *   capas dos cards). O padrão é a do Screen: laranja indo para o rosa, como o logo.
 *
 * Para criar uma cor: adicione aqui, em `public/theme-init.js` e as cores em `styles/v3.css`.
 */
export type Mode = 'dark' | 'light';
export type Theme = 'screem' | 'acelera';

export interface ThemeInfo {
  value: Theme;
  label: string;
  text: string;
  /** Amostra para o seletor (duas cores do degradê). */
  swatch: [string, string];
  /** Foto de fundo (em vez do degradê animado). */
  photo?: string;
  /** Cor da barra do navegador no celular. */
  bar: string;
}

export const THEMES: ThemeInfo[] = [
  {
    value: 'screem',
    label: 'Screen',
    text: 'Laranja e rosa, como o logo. É o padrão.',
    swatch: ['#ffb347', '#ff4f93'],
    bar: '#000000',
  },
  {
    value: 'acelera',
    label: 'Acelera',
    text: 'Menta e turquesa, da Acelera DEV.',
    swatch: ['#5ef0d0', '#00b39c'],
    bar: '#000000',
  },
];

export const MODES: { value: Mode; label: string; text: string }[] = [
  { value: 'dark', label: 'Escuro', text: 'Componentes pretos. É o padrão.' },
  { value: 'light', label: 'Claro', text: 'Componentes brancos.' },
];

const THEME_KEY = 'screem-theme';
const MODE_KEY = 'screem-mode';
const MOTION_KEY = 'screem-motion';

/** Animações ligadas (padrão) ou desligadas pela pessoa em Preferências. */
export type Motion = 'on' | 'off';

export function readMotion(): Motion {
  return read(MOTION_KEY) === 'off' ? 'off' : 'on';
}

export function saveMotion(motion: Motion): void {
  write(MOTION_KEY, motion);
  document.documentElement.dataset.motion = motion;
}

export function themeInfo(theme: Theme): ThemeInfo {
  return THEMES.find((t) => t.value === theme) ?? THEMES[0]!;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Armazenamento bloqueado (janela anônima, por exemplo): vale o padrão.
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
}

/** Fundo salvo; sem escolha (ou com um nome antigo), vale o padrão. */
export function readTheme(): Theme {
  const saved = read(THEME_KEY);
  if (THEMES.some((t) => t.value === saved)) return saved as Theme;
  // Cores e temas que deixaram de existir (Acelera, Brasil, Preto, Dark, Light...) voltam ao padrão.
  return 'screem';
}

export function readMode(): Mode {
  return read(MODE_KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.mode = mode;
  // Cor da barra do navegador no celular: a do fundo.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'light' ? '#e9e9ec' : '#000000');
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme);
  applyTheme(theme);
}

export function saveMode(mode: Mode): void {
  write(MODE_KEY, mode);
  applyMode(mode);
}

export function nextTheme(theme: Theme): Theme {
  const i = THEMES.findIndex((t) => t.value === theme);
  return THEMES[(i + 1) % THEMES.length]!.value;
}

export function themeLabel(theme: Theme): string {
  return themeInfo(theme).label;
}
