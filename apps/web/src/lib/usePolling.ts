import { useEffect, useRef } from 'react';

/**
 * Atualiza sozinho: chama `refresh` a cada `ms` enquanto a aba está visível, e na hora em que a
 * pessoa volta para a aba (ou para a janela). Aba escondida não consulta nada.
 *
 * Use com `reload({ silent: true })` do useAsync para a lista trocar sem piscar o carregando.
 */
export function usePolling(refresh: () => void, ms: number, enabled = true): void {
  const fn = useRef(refresh);
  fn.current = refresh;

  useEffect(() => {
    if (!enabled || import.meta.env.MODE === 'test') return;
    let last = Date.now();
    const tick = () => {
      if (document.hidden) return;
      last = Date.now();
      fn.current();
    };
    const id = window.setInterval(tick, ms);
    // Voltou para a aba depois de um tempo: atualiza já (sem esperar o próximo ciclo).
    const onBack = () => {
      if (!document.hidden && Date.now() - last > Math.min(ms, 5000)) tick();
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [ms, enabled]);
}
