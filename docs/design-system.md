# Design system do Screem

Direção, tokens e regras de uso. O código está em `apps/web/src/index.css` (tokens), `components/ui.tsx` (componentes base), `components/Layout.tsx` (estrutura do app), `components/Wordmark.tsx` (marca) e `components/Icon.tsx` (ícones).

## Direção

**Sala de controle de transmissão.** O produto mostra o que está no ar e quem está dentro, então a interface se parece com um painel de operação: listas com réguas em vez de cartões iguais, um estado sempre visível ao lado de cada item e um único azul que significa "ativo". Pedido do projeto: preto, branco e azul claro, nos dois temas.

Escolhas deliberadas para fugir do visual de template:

- **Listas e réguas, não cartões.** Salas, calls, reuniões e gravações são linhas separadas por uma régua de 1 px. Cartões só aparecem quando o conteúdo precisa mesmo de moldura (um formulário, um aviso). Nada de sombra decorativa.
- **Um só elemento animado sem ação da pessoa:** o ponto vermelho que pulsa em quem está de fato ao vivo. Todo o resto só se move em resposta a um clique.
- **Cor com função.** Azul = ativo, selecionado, ação principal. Vermelho = ao vivo, gravando, perigo. Âmbar = espera, atenção. Verde = aberto, sucesso. Cinza = tudo o mais.
- **Sem emoji, sem seta decorativa, sem rótulos em caixa alta.** Rótulos em frase normal.

## Cor

Os componentes usam a escala `zinc-*` (neutros) e `brand-*` (azul) do Tailwind, **redefinidas** em `index.css`. No tema claro a escala de neutros é invertida (`zinc-950` vira o branco do fundo, `zinc-50` vira o quase preto do texto), então um componente escrito uma vez serve aos dois temas.

| Papel | Escuro | Claro |
|---|---|---|
| Fundo da página (`zinc-950`) | `#090b10` | `#fbfcfe` |
| Superfície / painel (`zinc-900`) | `#10141c` | `#f3f6fb` |
| Realce, hover, ativo (`zinc-800`) | `#1c2230` | `#e5eaf3` |
| Borda (`zinc-700`) | `#2a3344` | `#d3dbe8` |
| Texto fraco / dica (`zinc-500`) | `#667289` | `#7c8aa3` |
| Texto secundário (`zinc-400`) | `#8f9bb0` | `#5b6a84` |
| Texto (`zinc-200` a `zinc-50`) | `#cbd3e1` a `#f3f6fb` | `#26334a` a `#0b1220` |
| Azul de sinal (`brand-500`) | `#6cb4ff` | `#1f6fe5` |
| Texto sobre o azul (`on-brand`) | `#05101f` | `#ffffff` |

Semânticas: erro `red`, atenção `amber`, sucesso `emerald`, informação = o próprio azul. Cada uma tem uma variante legível em cada tema (nos avisos, o texto vermelho do tema claro é escuro para manter o contraste).

Regras: não existe cor solta no código. Se precisar de uma cor nova, ela entra em `index.css`. Texto sobre o azul usa `text-on-brand`, nunca `text-white`.

## Tipografia

| Uso | Fonte | Por quê |
|---|---|---|
| Títulos e marca | **Bricolage Grotesque** (variável) | Grotesca com caráter e boa presença em títulos curtos; combina com o nome em minúsculas |
| Interface e texto | **Instrument Sans** (variável) | Legível em tamanhos pequenos, levemente condensada (cabe mais em tabelas e no celular), com números de boa leitura |

Ambas são auto-hospedadas (`@fontsource-variable`), então não há pedido a servidores de fonte de terceiros.

Escala: `xs` 12, `sm` 14 (padrão de controles e listas), `base` 16, `lg` 18, `xl` 22, `2xl` 28 (título de página), `3xl` 36, `4xl` 48 (só na tela de entrada). Títulos com `tracking` levemente negativo e `text-wrap: balance`; parágrafos com `text-wrap: pretty`; linhas de texto corrido limitadas a ~65 caracteres. Números em colunas usam a classe `tabular`.

**Marca:** `<Wordmark />` escreve "screem" em minúsculas, Bricolage extrapesada com espaçamento bem fechado e termina num ponto azul (o sinal de "no ar"). Sem símbolo, sem ícone.

## Forma

Raios: controles `lg` (10 px), painéis `xl` (14 px), barras flutuantes `2xl` (18 px). Bordas de 1 px. Alvos de toque de 40 px ou mais no celular. Foco: anel de 2 px em azul, visível em tudo que é interativo. Movimento: 120 a 150 ms, respeitando `prefers-reduced-motion`.

## Componentes (`ui.tsx`)

| Componente | Quando usar |
|---|---|
| `Button` (`primary`, `secondary`, `danger`, `ghost`; `sm`, `md`; `loading`) | Uma ação principal por tela no máximo; o resto é `secondary` ou `ghost` |
| `inputClass` | Mesma classe para input, select e textarea (altura, borda e foco iguais) |
| `Field` | Rótulo + controle + dica. Rótulo sempre visível |
| `Alert` (`error`, `warning`, `info`, `success`) | Aviso em linha com ícone semântico, título e o que fazer |
| `Badge`, `StatusDot` | Estado curto (ao vivo, agendada, em espera). O ponto `live` é o único que pulsa |
| `Card` | Moldura para formulários e blocos que não são listas |
| `PageTitle` | Cabeçalho de página: título, descrição, ações, régua embaixo |
| `Section` | Subdivisão de uma página: título pequeno e conteúdo |
| `EmptyState` | Vazio: diz o que falta e o que fazer. Sem ilustração |
| `Avatar`, `Spinner` | Pessoa e carregamento |

Estrutura (`Layout.tsx`): no computador, barra lateral fixa com navegação, "Administração" em grupo separado e a conta embaixo. No celular, topo enxuto e barra de abas embaixo, com "Mais" para o restante.

## Acessibilidade

Contraste de texto acima de 4,5:1 nos dois temas; foco visível; navegação por teclado em tudo; rótulos em todos os campos; ícones decorativos escondidos de leitores de tela e os informativos com `label`; avisos com `role` correto; `prefers-reduced-motion` respeitado; alvos de toque grandes; `safe-area` no celular instalado como app.

## Estado da migração

Reconstruídos por inteiro com esta linguagem: base (tokens, tipografia, componentes), estrutura do app (barra lateral e abas), tela de entrada, Salas, Reuniões, Calls agora, Guia (`/features`).

As demais telas (administração, sala, gravações, estatísticas, pessoas, configurações, auditoria) já usam os mesmos tokens e componentes base, portanto têm a mesma cor, fonte, raio e foco, mas **a composição de cada uma ainda segue a versão anterior** e deve ser refeita tela a tela no mesmo padrão (listas com réguas, `PageTitle` com descrição, `Section`, `EmptyState`).
