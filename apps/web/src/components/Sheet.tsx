import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * Folha: no celular sobe de baixo (respeitando a área segura), no computador aparece ao
 * centro. Fecha com o botão, com Esc ou tocando fora. Mantém o foco dentro enquanto está aberta.
 *
 * É desenhada direto no `body` (portal): assim nunca fica presa dentro de um elemento com
 * animação ou `transform` (como a faixa de opções da chamada), que "prenderia" o `fixed`.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // O foco vai para a janela (leitores de tela anunciam o título), sem brilho em nenhum botão.
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Não deixa a página de trás rolar enquanto a folha está aberta.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div
        aria-hidden="true"
        data-testid="sheet-backdrop"
        onClick={onClose}
        className="sheet-backdrop absolute inset-0 bg-black/50"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet sheet-in relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[1.75rem] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:max-w-sm md:rounded-[1.75rem] md:pb-4"
      >
        <div className="mb-3 flex items-center justify-between pl-1">
          <h2 className="text-base font-semibold text-zinc-50">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="icon-button">
            <Icon name="close" />
          </button>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
