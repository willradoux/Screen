import { useEffect, useState } from 'react';

const POINTER = ['pointermove', 'pointerdown', 'touchstart', 'wheel'] as const;

/**
 * `true` depois de `ms` sem a pessoa mexer o mouse ou tocar na tela. Volta para `false` no
 * primeiro movimento. Com `hold` (ponteiro ou foco nos controles), nunca fica ocioso.
 *
 * Acessibilidade: quem usa o teclado não perde os controles. Uma tecla mostra tudo e
 * desliga o "some sozinho" até o mouse voltar a ser usado.
 */
export function useIdle(ms: number, { enabled = true, hold = false } = {}): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled || hold) {
      setIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    const keyboard = () => {
      setIdle(false);
      window.clearTimeout(timer);
    };
    for (const event of POINTER) window.addEventListener(event, wake, { passive: true });
    window.addEventListener('keydown', keyboard);
    return () => {
      window.clearTimeout(timer);
      for (const event of POINTER) window.removeEventListener(event, wake);
      window.removeEventListener('keydown', keyboard);
    };
  }, [ms, enabled, hold]);

  return idle;
}
