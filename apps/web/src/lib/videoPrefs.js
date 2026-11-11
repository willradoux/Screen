import { useSyncExternalStore } from 'react';
export const DEFAULT_PREFS = { fit: 'cover', position: 'center', shape: 'auto' };
const KEY = 'screem-video-prefs';
const listeners = new Set();
let cache = null;
const FITS = ['cover', 'contain'];
const POSITIONS = ['top', 'center', 'bottom'];
const SHAPES = ['auto', 'landscape', 'portrait', 'square'];
/** Lê as preferências salvas, ignorando qualquer valor inválido. */
export function parsePrefs(raw) {
    if (!raw)
        return DEFAULT_PREFS;
    try {
        const v = JSON.parse(raw);
        return {
            fit: FITS.includes(v.fit) ? v.fit : DEFAULT_PREFS.fit,
            position: POSITIONS.includes(v.position)
                ? v.position
                : DEFAULT_PREFS.position,
            shape: SHAPES.includes(v.shape)
                ? v.shape
                : DEFAULT_PREFS.shape,
        };
    }
    catch {
        return DEFAULT_PREFS;
    }
}
function read() {
    if (cache)
        return cache;
    try {
        cache = parsePrefs(localStorage.getItem(KEY));
    }
    catch {
        cache = DEFAULT_PREFS;
    }
    return cache;
}
export function setVideoPrefs(patch) {
    cache = { ...read(), ...patch };
    try {
        localStorage.setItem(KEY, JSON.stringify(cache));
    }
    catch {
        // Sem armazenamento: vale só nesta visita.
    }
    listeners.forEach((fn) => fn());
}
export function useVideoPrefs() {
    return useSyncExternalStore((fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, read, () => DEFAULT_PREFS);
}
/** Classe do Tailwind para a posição da imagem dentro do quadro. */
export const POSITION_CLASS = {
    top: 'object-top',
    center: 'object-center',
    bottom: 'object-bottom',
};
/** Proporção do quadro. `natural` é a da transmissão real (largura/altura), se já conhecida. */
export function aspectFor(shape, natural) {
    switch (shape) {
        case 'landscape':
            return '16 / 9';
        case 'portrait':
            return '9 / 16';
        case 'square':
            return '1 / 1';
        default:
            return natural && Number.isFinite(natural) ? String(natural) : '16 / 9';
    }
}
/**
 * A mesma escolha de `aspectFor`, como número (largura ÷ altura). O palco usa para dar a cada
 * vídeo um quadro do formato real da transmissão, sem faixas pretas.
 */
export function aspectRatioNumber(shape, natural) {
    switch (shape) {
        case 'landscape':
            return 16 / 9;
        case 'portrait':
            return 9 / 16;
        case 'square':
            return 1;
        default:
            return natural && Number.isFinite(natural) && natural > 0 ? natural : 16 / 9;
    }
}
