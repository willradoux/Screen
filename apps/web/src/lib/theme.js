export const THEMES = [
    {
        value: 'screem',
        label: 'Screen',
        text: 'Laranja e rosa, como o logo. É o padrão.',
        swatch: ['#ffb347', '#ff4f93'],
        bar: '#000000',
    },
    {
        value: 'verde',
        label: 'Verde',
        text: 'Verde vivo.',
        swatch: ['#6ee7a0', '#1db954'],
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
export const MODES = [
    { value: 'dark', label: 'Escuro', text: 'Componentes pretos. É o padrão.' },
    { value: 'light', label: 'Claro', text: 'Componentes brancos.' },
];
const THEME_KEY = 'screem-theme';
const MODE_KEY = 'screem-mode';
const MOTION_KEY = 'screem-motion';
export function readMotion() {
    return read(MOTION_KEY) === 'off' ? 'off' : 'on';
}
export function saveMotion(motion) {
    write(MOTION_KEY, motion);
    document.documentElement.dataset.motion = motion;
}
export function themeInfo(theme) {
    return THEMES.find((t) => t.value === theme) ?? THEMES[0];
}
function read(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        // Armazenamento bloqueado (janela anônima, por exemplo): vale o padrão.
        return null;
    }
}
function write(key, value) {
    try {
        localStorage.setItem(key, value);
    }
    catch {
        // Sem armazenamento: vale só nesta visita.
    }
}
/** Fundo salvo; sem escolha (ou com um nome antigo), vale o padrão. */
export function readTheme() {
    const saved = read(THEME_KEY);
    if (THEMES.some((t) => t.value === saved))
        return saved;
    // Cores e temas que deixaram de existir (Acelera, Brasil, Preto, Dark, Light...) voltam ao padrão.
    return 'screem';
}
export function readMode() {
    return read(MODE_KEY) === 'light' ? 'light' : 'dark';
}
export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}
export function applyMode(mode) {
    document.documentElement.dataset.mode = mode;
    // Cor da barra do navegador no celular: a do fundo.
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', mode === 'light' ? '#e9e9ec' : '#000000');
}
export function saveTheme(theme) {
    write(THEME_KEY, theme);
    applyTheme(theme);
}
export function saveMode(mode) {
    write(MODE_KEY, mode);
    applyMode(mode);
}
export function nextTheme(theme) {
    const i = THEMES.findIndex((t) => t.value === theme);
    return THEMES[(i + 1) % THEMES.length].value;
}
export function themeLabel(theme) {
    return themeInfo(theme).label;
}
