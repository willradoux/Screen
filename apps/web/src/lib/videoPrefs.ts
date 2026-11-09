import { useSyncExternalStore } from 'react';

/**
 * Como VOCÊ vê os vídeos da sala (só na sua tela; não muda o que os outros veem).
 *  - fit: preencher o quadro (corta as bordas) ou ajustar (mostra tudo, com faixas)
 *  - position: qual parte da imagem fica visível quando preenche (cima, meio, baixo)
 *  - shape: formato do quadro. "auto" segue o formato real da transmissão: se a pessoa transmite
 *    na vertical, aparece na vertical; deitou o celular, o quadro deita junto.
 */
export interface VideoPrefs {
  fit: 'cover' | 'contain';
  position: 'top' | 'center' | 'bottom';
  shape: 'auto' | 'landscape' | 'portrait' | 'square';
}

export const DEFAULT_PREFS: VideoPrefs = { fit: 'cover', position: 'center', shape: 'auto' };

const KEY = 'screem-video-prefs';
const listeners = new Set<() => void>();
let cache: VideoPrefs | null = null;

const FITS = ['cover', 'contain'];
const POSITIONS = ['top', 'center', 'bottom'];
const SHAPES = ['auto', 'landscape', 'portrait', 'square'];

/** Lê as preferências salvas, ignorando qualquer valor inválido. */
export function parsePrefs(raw: string | null): VideoPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<VideoPrefs>;
    return {
      fit: FITS.includes(v.fit as string) ? (v.fit as VideoPrefs['fit']) : DEFAULT_PREFS.fit,
      position: POSITIONS.includes(v.position as string)
        ? (v.position as VideoPrefs['position'])
        : DEFAULT_PREFS.position,
      shape: SHAPES.includes(v.shape as string)
        ? (v.shape as VideoPrefs['shape'])
        : DEFAULT_PREFS.shape,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function read(): VideoPrefs {
  if (cache) return cache;
  try {
    cache = parsePrefs(localStorage.getItem(KEY));
  } catch {
    cache = DEFAULT_PREFS;
  }
  return cache;
}

export function setVideoPrefs(patch: Partial<VideoPrefs>): void {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  listeners.forEach((fn) => fn());
}

export function useVideoPrefs(): VideoPrefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
    () => DEFAULT_PREFS,
  );
}

/** Classe do Tailwind para a posição da imagem dentro do quadro. */
export const POSITION_CLASS: Record<VideoPrefs['position'], string> = {
  top: 'object-top',
  center: 'object-center',
  bottom: 'object-bottom',
};

/** Proporção do quadro. `natural` é a da transmissão real (largura/altura), se já conhecida. */
export function aspectFor(shape: VideoPrefs['shape'], natural: number | null): string {
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
