/**
 * Aparência do Screen em duas escolhas independentes:
 *
 * - **Modo** (`data-mode`): escuro (padrão) ou claro.
 * - **Tema** (`data-theme`): a estética inteira no escuro (fundo, painéis, destaque, o bichinho e a
 *   TV da página de apresentação). Padrão: Screen (preto e lima).
 *
 * Para criar um tema: adicione aqui, em `public/theme-init.js` e as cores em `styles/premium.css`.
 */
export type Mode = 'dark' | 'light';
export type Theme = 'screem' | 'synthwave' | 'sunset' | 'acelera' | 'gelo';

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
    text: 'Preto e lima, estilo Spotify. É o padrão.',
    swatch: ['#e2f986', '#b9e04a'],
    bar: '#070707',
  },
  {
    value: 'synthwave',
    label: 'Synthwave',
    text: 'Noite neon: rosa e violeta sobre roxo bem escuro.',
    swatch: ['#ff5fa2', '#8b5cff'],
    bar: '#0b0716',
  },
  {
    value: 'sunset',
    label: 'Pôr do sol',
    text: 'Coral e rosa, quente, como o fim da tarde.',
    swatch: ['#ffb35c', '#ff4f93'],
    bar: '#0d0809',
  },
  {
    value: 'acelera',
    label: 'Acelera',
    text: 'Turquesa e azul, da Acelera DEV.',
    swatch: ['#5ef0d0', '#00a6c8'],
    bar: '#05100f',
  },
  {
    value: 'gelo',
    label: 'Gelo',
    text: 'Azul gelo sobre azul-noite, frio e calmo.',
    swatch: ['#c7ecff', '#7b9bff'],
    bar: '#060a14',
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
  // A barra do navegador no celular acompanha o fundo do tema (no escuro).
  if (document.documentElement.dataset.mode !== 'light') {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeInfo(theme).bar);
  }
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.mode = mode;
  // Cor da barra do navegador no celular: a do fundo.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'light' ? '#f2f2f4' : themeInfo(readTheme()).bar);
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
