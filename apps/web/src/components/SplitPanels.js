import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Os dois painéis pretos sobre o fundo do tema (o mesmo desenho do hub): à esquerda um
 * painel estreito (marca e navegação), à direita o conteúdo. Para as páginas sem login
 * (entrar, guia). No celular os dois painéis ficam um embaixo do outro.
 */
export function SplitPanels({ side, sideLabel, children, center = false, }) {
    return (_jsxs("div", { className: "hub hub-static", children: [_jsx("aside", { "aria-label": sideLabel, className: "hub-sidebar surface", children: side }), _jsx("main", { id: "conteudo", tabIndex: -1, className: `hub-main surface ${center ? 'hub-main-center' : ''}`, children: children })] }));
}
