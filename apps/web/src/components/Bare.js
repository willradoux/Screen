import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Página solta sobre o fundo, sem topo nem navegação (login, carregamento, guia público).
 * `center` coloca o conteúdo no meio da tela.
 */
export function Bare({ center = false, children }) {
    return (_jsx("main", { id: "conteudo", tabIndex: -1, className: `bare ${center ? 'bare-center' : ''}`, children: children }));
}
