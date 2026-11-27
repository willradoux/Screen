import { useEffect, useState } from 'react';

const isFocused = () =>
  typeof document !== 'undefined' &&
  document.visibilityState === 'visible' &&
  (typeof document.hasFocus !== 'function' || document.hasFocus());

/**
 * `true` enquanto a pessoa está olhando o Screen (aba visível e janela em foco); `false` quando
 * ela vai para outra janela ou aba. Serve para a prévia da própria tela compartilhada congelar
 * enquanto ela está aqui, como no Discord e no Teams.
 */
export function useAppFocused(): boolean {
  const [focused, setFocused] = useState(isFocused);
  useEffect(() => {
    const update = () => setFocused(isFocused());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return focused;
}
