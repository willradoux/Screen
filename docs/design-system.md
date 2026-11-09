# Design system do Screem

Direção, tokens e regras de uso. O código está em `apps/web/src/index.css` (tokens), `components/ui.tsx` (componentes base), `components/Layout.tsx` (estrutura do app), `components/Wordmark.tsx` (marca) e `components/Icon.tsx` (ícones).

## Direção

**Preto e branco de verdade, com o azul só nos detalhes.**

- **Tema claro (padrão):** fundo branco real (`#ffffff`), texto e ícones pretos, detalhes em **azul escuro**.
- **Tema escuro (escolha da pessoa, em Preferências):** fundo preto real (`#000000`), texto e ícones brancos, detalhes em **azul claro**.
- **Azul é detalhe, nunca bloco:** o ponto do nome, o ponto do item ativo no menu, o anel de foco, links, uma borda de seleção, barras de gráfico, a barra de carregamento. Botões principais e estados ativos são "tinta" (preto no claro, branco no escuro).
- **Vidro:** menus e folhas flutuam como vidro translúcido (`.glass`: desfoque, borda de luz fina e brilho interno), no computador (barra lateral flutuante), no celular (topo e barra de abas em forma de pílula) e nas folhas de ajustes.
- **Listas e réguas, não cartões.** Salas, calls, reuniões e gravações são linhas separadas por uma régua de 1 px.
- **Um só elemento animado sem ação da pessoa:** o ponto vermelho que pulsa em quem está ao vivo. A tela de carregamento é a marca com uma barra fina que corre.
- **Cor com função.** Vermelho = ao vivo, gravando, perigo. Âmbar = espera, atenção. Verde = aberto, sucesso. Cinza = tudo o mais.
- **Sem emoji, sem seta decorativa, sem rótulos em caixa alta.**

## Cor

Os componentes usam a escala `zinc-*` (neutros, **cinza puro** sem tom azulado) e `brand-*` (o azul de detalhe), redefinidas em `index.css`. No tema claro a escala de neutros é invertida (`zinc-950` vira o branco do fundo, `zinc-50` vira o preto do texto), então um componente escrito uma vez serve aos dois temas.

| Papel | Claro | Escuro |
|---|---|---|
| Fundo da página (`zinc-950`) | `#ffffff` | `#000000` |
| Superfície / painel (`zinc-900`) | `#f6f6f6` | `#0d0d0d` |
| Realce, hover, ativo (`zinc-800`) | `#ececec` | `#1a1a1a` |
| Borda (`zinc-700`) | `#d9d9d9` | `#2e2e2e` |
| Texto fraco / dica (`zinc-500`) | `#737373` | `#7a7a7a` |
| Texto secundário (`zinc-400`) | `#4d4d4d` | `#a6a6a6` |
| Texto (`zinc-50`) | `#000000` | `#ffffff` |
| Azul de detalhe (`brand-500`) | `#0b3fa8` | `#6db1ff` |

Regras: não existe cor solta no código; cor nova entra em `index.css`. Texto sobre o fundo usa a escala `zinc`; texto sobre vídeo (sempre escuro) usa `text-white`.

## Tipografia

| Uso | Fonte | Por quê |
|---|---|---|
| Títulos e marca | **Sora** (variável) | Geométrica e tecnológica, boa presença em títulos e no nome |
| Interface e texto | **Manrope** (variável) | Limpa, moderna e muito legível em tamanhos pequenos |

Ambas são auto-hospedadas (`@fontsource-variable`), sem pedido a servidores de fonte de terceiros.

Escala: `xs` 12, `sm` 14 (padrão de controles e listas), `base` 16, `lg` 18, `xl` 22, `2xl` 28 (título de página), `3xl` 36, `4xl` 48. Títulos com `tracking` levemente negativo e `text-wrap: balance`. Números em colunas usam a classe `tabular`.

**Marca:** `<Wordmark />` escreve "screem" em minúsculas, Sora extrapesada com espaçamento fechado, terminando num ponto azul. Sem símbolo, sem ícone.

## Forma

Raios generosos: controles `lg` (14 px), painéis `xl` (18 px), menus e folhas de vidro `2xl` a `3xl` (24 a 32 px). Bordas de 1 px. Alvos de toque de 40 px ou mais no celular. Foco: anel de 2 px em azul, visível em tudo que é interativo. Movimento: 120 a 150 ms, respeitando `prefers-reduced-motion`.

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

Todas as telas usam a mesma linguagem: tokens, tipografia, componentes base, listas com réguas, `PageTitle` com descrição, `Section` e `EmptyState`.

Telas: entrada, Salas, Calls agora, Reuniões, Guia, Painel, Gerenciar reuniões, Configurações, Pessoas, Estatísticas, Gravações, Auditoria, sala (entrada, bloqueios, controles, palco, pessoas, efeitos, gravação) e as páginas de erro e de acesso restrito.

Ainda vale refinar com o site aberto: as telas de formulário longo (Configurações e Gerenciar reuniões) ainda agrupam o conteúdo em painéis com moldura, e a sala precisa de um ajuste fino de proporções que só se vê com vídeo de verdade.

## Auditoria de rotas

`apps/web/src/routes.test.tsx` abre **cada rota** do app (membro, moderador, admin e anônimo), confere o título e o acesso restrito, e falha se uma rota nova for criada sem entrar na lista. Hoje: `/`, `/reunioes`, `/features`, `/login`, `/admin`, `/admin/reunioes`, `/admin/config`, `/admin/pessoas`, `/admin/estatisticas`, `/admin/gravacoes`, `/admin/auditoria`, `/r/:roomId` e a página não encontrada.
