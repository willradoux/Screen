import { jsx as _jsx } from "react/jsx-runtime";
import { ScreenLogo } from './ScreenLogo';
/**
 * O "bichinho": o logo do Screen vivo enquanto algo carrega — a barra pisca, o "|<" olha para os
 * lados e ele dá um pulinho. Só CSS (leve). Usa a cor do texto, então fica preto sobre o fundo e
 * claro dentro do painel. Parado com movimento reduzido ou animações desligadas. Decorativo.
 */
export function Creature({ className = 'h-12' }) {
    return (_jsx("span", { className: `creature inline-block ${className}`, children: _jsx(ScreenLogo, { className: "h-full w-auto" }) }));
}
