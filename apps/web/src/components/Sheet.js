import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
/**
 * Folha: no celular sobe de baixo (respeitando a área segura), no computador aparece ao
 * centro. Fecha com o botão, com Esc ou tocando fora. Mantém o foco dentro enquanto está aberta.
 *
 * É desenhada direto no `body` (portal): assim nunca fica presa dentro de um elemento com
 * animação ou `transform` (como a faixa de opções da chamada), que "prenderia" o `fixed`.
 */
export function Sheet({ title, onClose, children, }) {
    const dialogRef = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        // O foco vai para a janela (leitores de tela anunciam o título), sem brilho em nenhum botão.
        dialogRef.current?.focus();
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
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
    return createPortal(_jsxs("div", { className: "fixed inset-0 z-50 flex items-end justify-center md:items-center", children: [_jsx("div", { "aria-hidden": "true", "data-testid": "sheet-backdrop", onClick: onClose, className: "sheet-backdrop absolute inset-0 bg-black/50" }), _jsxs("div", { ref: dialogRef, tabIndex: -1, role: "dialog", "aria-modal": "true", "aria-label": title, className: "sheet sheet-in relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[1.75rem] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:max-w-sm md:rounded-[1.75rem] md:pb-4", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between pl-1", children: [_jsx("h2", { className: "text-base font-semibold text-zinc-50", children: title }), _jsx("button", { type: "button", onClick: onClose, "aria-label": "Fechar", className: "icon-button", children: _jsx(Icon, { name: "close" }) })] }), _jsx("div", { className: "space-y-5", children: children })] })] }), document.body);
}
