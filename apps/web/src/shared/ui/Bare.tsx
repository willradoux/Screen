import type { ReactNode } from 'react';

/**
 * Página solta sobre o fundo, sem topo nem navegação (login, carregamento, guia público).
 * `center` coloca o conteúdo no meio da tela.
 */
export function Bare({ center = false, children }: { center?: boolean; children: ReactNode }) {
  return (
    <main id="conteudo" tabIndex={-1} className={`bare ${center ? 'bare-center' : ''}`}>
      {children}
    </main>
  );
}
