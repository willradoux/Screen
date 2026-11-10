# Design system do Screem

Direção, tokens e regras de uso. Código: `apps/web/src/index.css` (tokens e peças), `lib/theme.ts` (modos e fundos), `components/Backdrop.tsx` (fundo), `components/Layout.tsx` (antes da chamada), `pages/RoomPage.tsx` (moldura da chamada), `components/Intro.tsx` (abertura), `lib/motion.ts` (mola), `components/ui.tsx` (componentes base).

## Direção

**UI limpa: componentes pretos sobre um fundo escolhido pela pessoa. Sem borda em componente.**

- **Antes da chamada (hub):** a estrutura do Flazo — menu lateral com Salas, Reuniões, Guia e Preferências, o grupo "Administração" para quem tem acesso e, embaixo, a pessoa ("Sua conta"), o tema e Sair — com a nossa UI: o menu é uma peça preta flutuando sobre o fundo e o conteúdo ocupa o resto da tela (até 68rem). No celular o menu vira uma gaveta aberta pelo topo. Título da página direto no fundo, na cor do tema (`.ink`); todo o resto em peças pretas.
- **Na chamada** (`/r/:id`, conectado): moldura preta como um monitor; a tela de dentro é transparente com desfoque, mostrando o fundo. O topo do site some (`useImmersive`).
  - **Voz embaixo:** uma pílula preta flutuando sobre a tela com microfone, câmera e tela (desligados ficam em vermelho suave), "Mais opções" e sair. Some com o mouse parado por 3 s e volta ao mexer (não some com ponteiro ou foco nela, painel aberto ou para quem usa teclado).
  - **Opções à direita:** o botão do canto inferior direito abre uma faixa estreita na borda direita da moldura (pessoas, pedir a palavra, layout, vídeo, efeitos e você embaixo), que desliza e encolhe a tela. Dicas com o nome à esquerda de cada ícone. Botão ligado fica na cor do tema.
  - **Painel de pessoas:** no computador vira uma coluna preta da moldura entre a tela e a faixa, e a tela encolhe; no celular cobre a tela. (Não há chat na sala.)
  - **Palco:** Automático (destaque com tela compartilhada, mosaico sem), Mosaico e Destaque, escolhidos numa janela com desenho e nome (`room/LayoutPicker.tsx`). Cada vídeo tem o quadro no formato real da transmissão (largo, quadrado ou em pé) e cresce até onde couber, sem faixas pretas (`--ar` + container queries).
- **Sem borda:** separação por fundo, espaço e sombra. Listas são peças separadas por espaço.
- **Cor com função:** vermelho = ao vivo/perigo; âmbar = espera; verde = aberto; a cor do tema = detalhe (foco, item ativo, agendado).

## Aparência: modo × fundo

Duas escolhas independentes, em Preferências (e o fundo também no botão de tema).

| Modo (`data-mode`) | Componentes |
|---|---|
| Escuro (padrão) | Pretos (`rgb(6 6 6 / .9)` com desfoque), texto branco |
| Claro | Brancos, texto preto (escala `zinc` e `white`/`black` invertidas) |

A chamada é sempre escura.

| Fundo (`data-theme`) | Tipo | Cores |
|---|---|---|
| Screem (padrão) | Degradê animado | As do logo: `#fde6dc`, `#ffaa7f`, `#ff4f93` |
| Acelera | Degradê animado | Acelera UI: `#dcefe8`, `#00c8b2`, `#00e0a4` |
| Brasil | Degradê animado | `#f6ecc4`, `#4fae7a`, `#2f6db5` |
| Portugal | Degradê animado | `#f3e6cf`, `#5f9a6f`, `#c4473f` |
| Alemanha | Degradê animado | `#f5e6bd`, `#e2b04a`, `#b8322f` |

**Criar um fundo:** adicione em `THEMES` (`lib/theme.ts`) e em `public/theme-init.js`, e defina `--bg-1..3`, `--ink`, `--ink-soft` e `--brand-*` em `index.css` (`:root[data-theme='nome']`). Para foto, basta `photo: '/backgrounds/arquivo.webp'`.

O degradê é o shader do AWS Hub: 40% da resolução, 30 fps, para com a aba escondida e fica parado com movimento reduzido. O granulado vai por cima (`--grain-opacity` por tema).

## Marca

Screem (badge do logo + "screem") e a marca da comunidade em SVG (`components/AceleraMark.tsx`): "ACELERA" no degradê turquesa→azul com as linhas de velocidade e "DEV" na cor do texto. Aparece na abertura e no login.

## Tipografia e forma

Inter Tight em tudo. Título de página `2xl`, texto `sm`. Componentes com raio 22 px, botões em pílula, alvos de toque de 40 px ou mais.

## Movimento

- **Abertura** (uma vez por sessão): o badge salta no preto, o preto fecha em volta dele e some. Pula com clique ou tecla.
- **Entrar na chamada:** a tela "acende" como um monitor.
- **Mola exata** (`lib/motion.ts`), entradas `.rise`/`.stagger`, botões encolhem ao toque. Tudo desliga com movimento reduzido.

## Acessibilidade

- Foco sem borda: só para quem usa teclado, um brilho suave na cor do tema; campos de texto apenas clareiam o fundo.
- Modo claro: vermelho, âmbar, verde e a cor do tema escurecidos para 4,5:1 sobre branco. A chamada mantém as cores do escuro.
- Texto direto no fundo (`.ink-soft`) com 80% de opacidade; `prefers-contrast: more` deixa tudo opaco; `forced-colors` ganha bordas reais.
- Controles da chamada com nome completo para leitores de tela, dicas visíveis no mouse e no teclado, alvos de 44 px.
- `prefers-reduced-motion` desliga abertura, transições, deriva do fundo e animações.

## A fazer

Telas longas do painel, ajuste fino da sala com vídeo real e várias pessoas, teste com leitor de tela.

## Organização das páginas (hub)

- **Título da página:** nome e resumo à esquerda, ação (ex.: Atualizar) à direita, na mesma linha da borda do conteúdo.
- **Seções:** título em negrito com a contagem e uma linha dizendo para que serve (`Section` com `count` e `description`). Cada seção é nomeada pelo próprio título para leitores de tela.
- **Grade de cards:** uma grade só (`.widget-grid`), colunas da mesma largura começando na mesma linha; em Salas o bloco fica centralizado com a largura da seção com mais cards.
- **Uma ação principal por card:** só "Entrar" (sala ao vivo) e "Enviar aviso" (reunião não divulgada) são botões brancos; ações destrutivas (Cancelar, Encerrar) são texto vermelho, e a confirmação é que usa o botão vermelho.
- **Sem repetição:** a call do Discord que já aparece como sala não ganha um segundo card.
- **Acessibilidade conferida:** texto branco sobre vermelho ≥ 4,5:1 (`#c81e1e`, `#c8352a`), alvos ≥ 24 px (caixas de seleção 18 px dentro de rótulos de 32 px), headings sem saltos, gráfico de Estatísticas com tabela para leitores de tela.
