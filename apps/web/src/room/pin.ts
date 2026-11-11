import { flushSync } from 'react-dom';
/**
 * O que está fixado no palco (só na tela de quem fixou, ou para todos quando é o destaque do
 * admin):
 *  - `"{identity}"`     → a tela da pessoa, se ela compartilha; senão a câmera (é o formato do
 *    destaque do admin, `spotlightId`);
 *  - `"cam:{identity}"` → a câmera da pessoa, mesmo que ela compartilhe a tela.
 */
export const cameraPin = (identity: string) => `cam:${identity}`;
export const screenPin = (identity: string) => identity;

export function parsePin(pin: string | null | undefined): {
  identity: string;
  camera: boolean;
} | null {
  if (!pin) return null;
  return pin.startsWith('cam:')
    ? { identity: pin.slice(4), camera: true }
    : { identity: pin, camera: false };
}

/**
 * Troca o que está fixado com animação: o vídeo escolhido sai da faixa e cresce até o lugar
 * grande (e o de antes encolhe para a faixa), em ~0,25 s, com a View Transitions do navegador.
 * Sem suporte, ou com animações desligadas, troca na hora.
 */
export function withPinTransition(update: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  const still =
    document.documentElement.dataset.motion === 'off' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  if (!doc.startViewTransition || still || import.meta.env.MODE === 'test') {
    update();
    return;
  }
  document.documentElement.dataset.pinning = '';
  const t = doc.startViewTransition(() => flushSync(update)) as { finished?: Promise<void> };
  void t.finished?.finally(() => delete document.documentElement.dataset.pinning);
}

/** Nome da peça para a animação (precisa ser único e um identificador CSS válido). */
export const transitionName = (key: string) => `pin-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
