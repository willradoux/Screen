# Screen v3: mapa da nova UI

Proposta para refazer o front no estilo das referências (painel escuro tipo "dashboard de produto"), **com a mesma stack** (React 19, Vite, Tailwind 4, React Router, livekit-client, socket.io-client) e **as mesmas regras de negócio**: só a interface muda. Inclui tudo o que o Flazo já entregou (palco ligado, subir ao palco, fixar, sala grande, mãos, legendas, efeitos, gravação, QR, PWA, banners de configuração).

Status: **rascunho para aprovar**. Nada implementado ainda.

---

## 1. O que as referências têm (a linguagem visual)

| Elemento | Como é nas referências | Vira no Screen |
|---|---|---|
| Fundo | Preto liso (`#000`), sem degradê atrás de tudo | Fundo liso. O degradê dos temas sai do fundo e vai **para dentro das capas** dos cards (como os cards com imagem colorida da ref. 1) |
| Superfícies | Cinza muito escuro (`#0f0f0f`–`#161616`), cantos grandes (~20 px) | Cards, painéis e menus nesses dois tons |
| Separação | Linha fina neutra (branco a ~7%) entre cabeçalho e corpo do card e entre áreas | Linha fina **cinza**, nunca colorida (sem as bordas coloridas da ref. 2). Ver decisão D1 |
| Cabeçalho de card | Ícone + rótulo pequeno em negrito à esquerda, menu "⋯" à direita, linha embaixo | Igual: "● Ao vivo", "Agendada", "Na call"; o "⋯" guarda as ações secundárias (Cancelar, Divulgar, Abrir no celular) |
| Rodapé de card | Título em negrito + seta "→" à direita | Nome da sala + seta (clicar no card inteiro entra) |
| Chips/pílulas | Cinza escuro, texto pequeno em negrito, ícone à esquerda; estados com fundo tingido (âmbar "On Review", verde "Done") | Filtros, estados (Ao vivo / Em espera / Agendada / Encerrada), cargos (Admin / Mod) |
| Botões | Primário = pílula branca com texto preto; secundário = pílula cinza; ícones em círculo cinza de 32 px | Mesmo: um primário branco por tela; o resto cinza |
| Barra de filtros | Pílulas (Filter, Sort, Closed...) + busca com atalho ⌘K + ação branca à direita | Auditoria, Gerenciar reuniões, Pessoas, Gravações |
| Tabelas | Cabeçalho cinza pequeno, linhas com ícone, status em pílula (ref. 2 "Upcoming Tasks") | Reuniões, Pessoas, Auditoria, Estatísticas (quem mais participou) |
| Números | Blocos com o número grande e rótulo pequeno (ref. 2) | Painel e Estatísticas. Ver decisão D3 (colorido ou neutro) |
| Colunas tipo kanban | "On Review" / "Done" com cards e "Add Task" (ref. 3) | Gerenciar reuniões: **Agendadas · Abertas · Encerradas**, com o formulário de nova reunião no topo da primeira coluna |
| Menu lateral | Marca + botão de recolher; grupos com título e seta; item ativo com fundo cinza; cartão da pessoa embaixo | Igual (detalhe na seção 3) |
| Barra de cima | Busca à esquerda, links no meio, sino/ajuda/avatar à direita | Título da página + ações à direita. Ver decisão D2 (busca) |
| Rodapé | Linha fina, copyright, ícones redondos, seletor de idioma | Opcional e mínimo: "Acelera DEV · Screen" e o tema. Ver D4 |
| Tipografia | Sans geométrica, tamanhos pequenos (12–14 px) em semibold; títulos 16–20 px | Geist, escala curta: 12 · 13 · 14 · 16 · 20 · 28 |

---

## 2. Tokens

```
Fundo           --bg            #000000          (claro: #f4f4f5)
Superfície 1    --surface       #0f0f0f          cards, menu lateral
Superfície 2    --surface-2     #161616          cabeçalho de card, linhas de tabela no hover
Superfície 3    --surface-3     #1f1f1f          chips, campos, botões secundários
Linha           --hairline      rgb(255 255 255 / .07)
Texto           --text          #f5f5f5   --text-2 #a1a1a1   --text-3 #6b6b6b
Primário        --action        #ffffff (texto #000)
Destaque        --accent        cor do tema (foco, item ativo, ícones de número)
Estados         ao vivo #ef4444 · espera #f59e0b · aberto/divulgado #22c55e · agendado = accent
                (chip = fundo do estado a 14% + texto do estado)
Raios           card 20 · interno 14 · campo 12 · pílula 999
Espaço          base 4: 4 8 12 16 20 24 32 48
Movimento       100–240 ms saída suave; mola só em toque/arrastar; tudo some com movimento reduzido
```

**Temas** (Screen, Acelera, Brasil, Portugal, Alemanha, Preto e branco, Preto): passam a mudar só o `--accent` e o degradê das **capas** dos cards. O fundo fica sempre liso. Modo claro continua existindo (superfícies brancas/cinza claro, mesmo layout).

---

## 3. Estrutura do app (shell)

```
┌───────────────┬────────────────────────────────────────────────────┐
│ [■] Screen  |<│  Salas                         [↻ Atualizar] [◐] (W) │
│               │  2 abertas · 1 agendada                              │
│ Navegar     ⌃ ├────────────────────────────────────────────────────┤
│ → Salas    ●  │                                                      │
│ ▤ Reuniões    │   conteúdo da página                                 │
│ ? Guia        │                                                      │
│               │                                                      │
│ Administração⌃│                                                      │
│ ▦ Painel      │                                                      │
│ ▤ Ger. reuniões                                                      │
│ ☺ Pessoas     │                                                      │
│ ▥ Estatísticas│                                                      │
│ ◉ Gravações   │                                                      │
│ ⚙ Configurações                                                      │
│ ◷ Auditoria   │                                                      │
│               │                                                      │
│ ┌───────────┐ │                                                      │
│ │(W) Will ⌄ │ │  ← menu: Preferências, Tema, Instalar app, Sair      │
│ └───────────┘ │                                                      │
└───────────────┴────────────────────────────────────────────────────┘
```

- **Menu lateral** (240 px; recolhe para só ícones com o botão `|<`, lembrado no navegador): grupo "Navegar" e grupo "Administração" (só aparece para quem tem acesso; Painel para mod e admin, o resto só admin, como hoje). Item ativo: fundo `--surface-3` + ponto do accent.
- **Cartão da pessoa** embaixo: avatar, nome, cargo; abre um menu com Preferências, Tema, Instalar app e Sair (tudo que hoje está espalhado no rodapé do menu).
- **Barra de cima** da página: título + resumo à esquerda, ações à direita (Atualizar com a trava de 4 s, botão de tema, avatar no celular).
- **Banners de configuração** (os do Flazo, "falta configurar") ficam logo abaixo da barra de cima, como um card de aviso.
- **Celular**: menu vira gaveta pela esquerda; barra de cima fixa com o botão de menu.
- **Guia** passa a usar o mesmo shell (hoje ele troca de layout e mostra "Entrar" mesmo logado, o que confunde). As seções do guia viram um sumário no topo da página. Para quem não está logado, o guia continua público, com o botão Entrar.

---

## 4. Página por página

### Login (`/login`)
Fundo liso, um card central: marca Screen, uma frase do que é, botão branco "Entrar com Discord", erro do `?error=` num chip vermelho. Rodapé com "Acelera DEV". Sem o painel lateral de hoje.

### Salas (`/`)
```
Salas                                         [↻ Atualizar]
2 abertas · 1 agendada
─────────────────────────────────────────────────────────
Ao vivo agora (2)
┌ ● Ao vivo        ⋯ ┐ ┌ ● Em espera      ⋯ ┐
├────────────────────┤ ├────────────────────┤
│  capa (degradê)    │ │  capa (degradê)    │
│  A B C   4/25      │ │  1/25              │
├────────────────────┤ ├────────────────────┤
│ Live - Codando   → │ │ Live - AWS       → │
└────────────────────┘ └────────────────────┘

Calls agora (só as que não aparecem como sala)
[ ● Live 1 · 3 pessoas · Abrir a sala → ]   ← pílula larga (como as pílulas da ref. 1)

Agendadas (1)
┌ Agendada · 11/11 18:48 ⋯ ┐
│ Reunião mensal…        → │
└──────────────────────────┘
```
- Card = cabeçalho (estado + "⋯"), capa com o degradê do tema e as pessoas, rodapé com o nome e a seta. O card inteiro é o link de entrar.
- "⋯": Abrir no celular (QR), Cancelar (admin, reunião agendada).
- Calls sem sala viram pílulas largas, não cards.
- Vazio: card pontilhado com o que fazer ("Entre num canal de voz de lives no Discord").

### Reuniões (`/reunioes`)
- **Próxima reunião**: card grande com capa (degradê), título, contagem regressiva em blocos, "Ver sala" branco.
- **Lista**: tabela no estilo da ref. 2: Reunião · Quando · Quem pode entrar · Estado (pílula) · →.

### Sala (`/r/:roomId`)
Continua imersiva (sem o shell), mas no mesmo idioma visual:
```
┌──────────────────────────────────────────────────────────────┐
│ ← Salas   Live - Codando o Screem  ● Ao vivo  ◷ 12:40   (☺ 4) │  barra fina de cima
├──────────────────────────────────────────────┬───────────────┤
│                                              │ Pessoas (4)   │
│            palco (mosaico / destaque)        │ ─────────────│
│                                              │ (A) Ana   🎤  │
│                                              │ (B) Beto  ✋  │
│                                              │ ...           │
├──────────────────────────────────────────────┴───────────────┤
│        [🎤⌃] [📷⌃] [🖥]  [✋] [▦] [⋯]        [ Sair ]          │  barra de controles
└──────────────────────────────────────────────────────────────┘
```
- **Barra de cima** (nova): voltar, nome da sala, estado, tempo, "Palco ligado" quando ativo, contador de pessoas que abre o painel. Resolve o "onde estou / como saio".
- **Barra de controles fixa embaixo** (no lugar da pílula que some + botão escondido no canto): microfone e câmera com a setinha de aparelho, tela, pedir a palavra (reunião), layout, "⋯" (vídeo, efeitos, legendas, tema, abrir no celular, gravação para admin) e Sair em vermelho. Some com o mouse parado só em tela cheia; no resto fica visível (resolve "não acho as opções").
- **Painel de pessoas** à direita como um card da ref. (cabeçalho com contagem, linhas com avatar, microfone, mão levantada, menu "⋯" de moderação para mod/admin: silenciar, subir ao palco, expulsar, banir).
- **Palco**: o de agora (mosaico uniforme, destaque, fixar, palco ligado com "Subir ao palco", plateia como número, sala grande).
- **Telas antes de entrar** (verificando, bloqueado, pronto, encerrada, removido, erro): um card central no mesmo estilo, com o estado num chip.

### Preferências (`/preferencias`)
Cards de configuração com cabeçalho (ícone + título) e linhas: Modo (claro/escuro), Tema (chips com a cor), Animações (switch), Sons (switch), Vídeo (como ver o vídeo).

### Painel (`/admin`, mod e admin)
```
[ Lives no ar  3 ] [ Pessoas conectadas  5 ] [ Próxima reunião  11/11 18:48 ]
┌ Sessões de live agora (3) ─────────────────────────────┐
│ ● Live - Codando   Em uso · 4 pessoas        [Abrir]   │
└────────────────────────────────────────────────────────┘
┌ Reuniões (1)                               Gerenciar → ┐
│ ○ Reunião mensal   Divulgada   11/11 18:48             │
└────────────────────────────────────────────────────────┘
```

### Gerenciar reuniões (`/admin/reunioes`)
Kanban da ref. 3: colunas **Agendadas · Abertas · Encerradas**. Topo da primeira coluna: card "Nova reunião" (título, descrição, quando, divulgar). Cada card: chips de estado e "Divulgada", lembretes como chips, ações no "⋯" (Enviar aviso, Abrir agora, Reagendar, Cancelar, Encerrar, Ver relatório). Barra de filtros por cima. No celular as colunas viram abas.

### Pessoas (`/admin/pessoas`)
Formulário de adicionar num card à esquerda; tabela à direita: Pessoa · Cargo (chip) · Observação · Desde · "⋯" (tirar acesso).

### Estatísticas (`/admin/estatisticas`)
Seletor de período em pílulas (7 · 30 · 90 dias), blocos de números, card do gráfico por dia (barras no accent, com a tabela para leitor de tela), card "Quem mais participou" como tabela.

### Gravações (`/admin/gravacoes`)
Grade de cards com capa (degradê), título, duração, tamanho, dias até expirar (chip), ações Baixar (branco) e Apagar no "⋯".

### Configurações (`/admin/config`)
Cards por grupo (Canais, Cargos, Limites, Tempos), cada um com cabeçalho e linhas de campo; um botão "Salvar" fixo embaixo quando há mudança.

### Auditoria (`/admin/auditoria`)
Barra de filtros (pílulas + busca), tabela: Quando · Quem · Ação (chip) · Alvo · Sala · Motivo; "Carregar mais" no fim.

### Estados gerais
- Carregando: o bichinho (logo do Screen) + texto, ou esqueletos cinza nos cards e tabelas.
- Vazio: card pontilhado com ícone, frase e o próximo passo.
- Erro: card com chip vermelho, o que aconteceu e "Tentar de novo".
- Avisos (toasts): canto de baixo, cards escuros pequenos.
- Janelas (modais): card central com cabeçalho e "×", Esc fecha, foco volta.

---

## 5. O que fica, o que sai, o que muda

| Fica (já funciona) | Sai | Muda |
|---|---|---|
| Toda a lógica, rotas, chamadas da API e testes | Fundo degradê animado (shader) atrás de tudo | Temas: só accent + capas |
| Palco novo (layouts, fixar, palco ligado, sala grande) | Painéis pretos flutuando sobre o fundo | Sala: barra de cima e barra de controles fixas no lugar da pílula que some + botão escondido |
| Escolha de aparelho, permissões, sons, preferências | Abertura longa em todo reload (ver D5) | Guia dentro do shell |
| Logo e Acelera DEV em SVG, bichinho do carregamento | Layout próprio do Guia e do Login | Gerenciar reuniões em colunas |
| Acessibilidade conferida (contraste, alvos, foco, headings) | | Listas longas viram tabelas |

---

## 6. Decisões para o Will

- **D1. Linha fina cinza** entre cabeçalho e corpo dos cards (como nas refs)? Ela organiza muito, mas é uma "borda". Alternativa: separar só por tom de cinza.
- **D2. Busca (⌘K)** na barra de cima para achar salas e reuniões? É coisa nova (filtra o que já foi carregado, sem pedir nada ao servidor). Ou fica sem busca.
- **D3. Blocos de números coloridos** (como a ref. 2: verde, turquesa, amarelo) ou neutros com o ícone no accent?
- **D4. Rodapé** com "Acelera DEV · Screen" ou sem rodapé?
- **D5. Abertura**: manter em todo reload, só na primeira visita do dia, ou trocar por algo curto (o logo piscando ~1 s)?
- **D6. Sala**: barra de controles sempre visível (mais fácil de achar) ou sumindo com o mouse parado (mais limpa)?

---

## 7. Como fazer (ordem sugerida)

1. Tokens novos e componentes base (card com cabeçalho/rodapé, chip, pílula, tabela, barra de filtros, menu "⋯", campo, modal) numa página de laboratório (`/__lab`, só em dev).
2. Shell: menu lateral, cartão da pessoa, barra de cima, gaveta no celular.
3. Salas e Reuniões.
4. Sala (barra de cima, barra de controles, painel de pessoas, telas antes de entrar).
5. Admin: Painel, Gerenciar reuniões (colunas), Pessoas, Estatísticas, Gravações, Configurações, Auditoria.
6. Login, Guia, Preferências, estados e avisos.
7. Passada de acessibilidade (teclado, leitor de tela, contraste nos dois modos) e responsividade (360, 768, 1280, 1920); testes e build em cada etapa.

Cada etapa sobe separada, sem mexer em `apps/api`, `infra` ou `packages`.
