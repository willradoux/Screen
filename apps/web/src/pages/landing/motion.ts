/** Animações desligadas no Screen ou movimento reduzido no sistema. */
export function motionOff(): boolean {
  if (typeof window === 'undefined') return true;
  if (document.documentElement.dataset.motion === 'off') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
