import type { ReactNode } from 'react';

/**
 * Os dois painéis pretos sobre o fundo do tema (o mesmo desenho do hub): à esquerda um
 * painel estreito (marca e navegação), à direita o conteúdo. Para as páginas sem login
 * (entrar, guia). No celular os dois painéis ficam um embaixo do outro.
 */
export function SplitPanels({
  side,
  sideLabel,
  children,
  center = false,
}: {
  side: ReactNode;
  /** Nome do painel da esquerda para leitores de tela. */
  sideLabel: string;
  children: ReactNode;
  /** Conteúdo centralizado na vertical (login). */
  center?: boolean;
}) {
  return (
    <div className="hub hub-static">
      <aside aria-label={sideLabel} className="hub-sidebar surface">
        {side}
      </aside>
      <main
        id="conteudo"
        tabIndex={-1}
        className={`hub-main surface ${center ? 'hub-main-center' : ''}`}
      >
        {children}
      </main>
    </div>
  );
}
