/**
 * Aparência do Screen em duas escolhas independentes:
 *
 * - **Modo** (`data-mode`): escuro (componentes pretos, o padrão) ou claro (componentes
 *   brancos). A chamada é sempre escura.
 * - **Fundo** (`data-theme`): degradê animado ou foto. O padrão usa as cores do logo.
 *
 * Para criar um fundo novo: adicione aqui e defina as cores em index.css
 * (`:root[data-theme='nome']`). Fundo com foto só precisa de `photo`.
 */
export type Mode = 'dark' | 'light';
export type Theme = 'screem' | 'acelera' | 'brasil' | 'portugal' | 'alemanha' | 'mono' | 'preto';

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
    text: 'As cores do logo. É o padrão.',
    swatch: ['#ffaa7f', '#ff4f93'],
    bar: '#fde3da',
  },
  {
    value: 'acelera',
    label: 'Acelera',
    text: 'A Acelera UI: menta e turquesa.',
    swatch: ['#00c8b2', '#00e0a4'],
    bar: '#cfeee4',
  },
  {
    value: 'brasil',
    label: 'Brasil',
    text: 'Verde, amarelo e azul, em tons suaves.',
    swatch: ['#f2d36b', '#2f9e66'],
    bar: '#f6ecc4',
  },
  {
    value: 'portugal',
    label: 'Portugal',
    text: 'Verde e vermelho sobre um creme quente.',
    swatch: ['#3a8a5c', '#c4473f'],
    bar: '#f3e6cf',
  },
  {
    value: 'alemanha',
    label: 'Alemanha',
    text: 'Dourado e vermelho, com o preto no texto.',
    swatch: ['#e2b04a', '#b8322f'],
    bar: '#f5e6bd',
  },
  {
    value: 'mono',
    label: 'Preto e branco',
    text: 'Sem cor nenhuma: só tons de cinza.',
    swatch: ['#d9d9d9', '#2b2b2b'],
    bar: '#e6e6e6',
  },
  {
    value: 'preto',
    label: 'Preto',
    text: 'Só escuro, sem cor nenhuma.',
    swatch: ['#2a2a2a', '#000000'],
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
  // Fundos que deixaram de existir (claro/escuro antigos, nuvens, noite) voltam ao padrão.
  return 'screem';
}

export function readMode(): Mode {
  return read(MODE_KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeInfo(theme).bar);
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.mode = mode;
}

/** O fundo "Preto" é só escuro: escolher ele liga também o modo escuro. */
export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme);
  applyTheme(theme);
  if (theme === 'preto') saveMode('dark');
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
