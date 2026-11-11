# Design system do Screen

Direção, tokens e regras de uso da interface. Só a UI: páginas, funcionalidades e regras de negócio são as do backend e da [documentação do frontend](frontend/README.md).

**Onde está no código** (`apps/web/src/`):

| O quê | Arquivo |
|---|---|
| Tokens, temas, peças (hub, sala, widgets, palco) | `index.css` |
| Fundos, modos e animações (preferências) | `lib/theme.ts` e `public/theme-init.js` (aplica antes de pintar a tela) |
| Fundo em degradê animado | `components/Backdrop.tsx` + `lib/gradient.ts` |
| Componentes base (botão, seção, título, avisos, campos) | `components/ui.tsx` |
| Widgets (capa, avatares, números) | `components/Widget.tsx`, `components/RoomCard.tsx`, `components/CallsSection.tsx` |
| Hub (menu lateral + painel) | `components/Layout.tsx`; login e guia em `components/SplitPanels.tsx` |
| Moldura da chamada | `pages/RoomPage.tsx`, `room/Controls.tsx`, `room/Stage.tsx` |
| Logo e marca | `components/ScreenLogo.tsx`, `components/AceleraMark.tsx`, `components/Wordmark.tsx` |
| Abertura e carregamento | `components/Intro.tsx`, `components/Creature.tsx`, `components/Loader.tsx`, `components/StatusCard.tsx` |
| Mola e movimento | `lib/motion.ts` |
| Sons | `lib/sounds.ts` |

## Direção

**UI limpa e minimalista: componentes pretos sobre um fundo escolhido pela pessoa. Sem borda e sem brilho.**

- **Preto de verdade:** painéis em `#000`; peças dentro deles (cards, linhas) um tom acima (`--panel-nested`, branco a 5,5%). Nada brilha: sem glow, sem sombra colorida.
- **Sem borda:** separação por fundo, espaço e proximidade.
- **Cor com função:** vermelho = ao vivo/perigo; âmbar = espera; verde = aberto/divulgado; a cor do tema = detalhe (foco, item ativo, ícones dos números). Estado nunca só por cor: sempre com texto ou ícone.
- **Negrito onde ajuda:** títulos de página, de seção e de card; números principais.

## Antes da chamada (hub)

Estrutura do Flazo com a nossa UI: duas peças pretas sobre o fundo do tema.

- **Menu lateral:** Salas, Reuniões, Guia, Preferências; o grupo "Administração" só para quem tem acesso (Painel para moderação e admin; o resto só admin); embaixo, "Sua conta", tema e Sair. No celular vira uma gaveta aberta pelo topo.
- **Painel de conteúdo:** ocupa o resto da tela; o conteúdo vai até 80rem.
- **Login e Guia:** as mesmas duas peças (`SplitPanels`).

### Organização das páginas

- **Título da página:** nome em negrito e resumo à esquerda; a ação (ex.: Atualizar) à direita, na mesma linha. No celular a ação desce.
- **Seções** (`Section`): título em negrito com a contagem e uma linha dizendo para que serve (`count`, `description`). O cabeçalho fica alinhado à borda dos cards. A seção é nomeada pelo título para leitores de tela.
- **Grade de cards** (`.widget-grid`): colunas da mesma largura começando na mesma linha, então cards de seções diferentes se alinham.
- **Salas:** "Ao vivo agora", "Calls agora" e "Agendadas" lado a lado numa fileira (cada uma com a largura dos seus cards, até 4 por linha); o bloco inteiro, título junto, fica no meio. Os cards de uma fileira têm a mesma altura. Sem espaço, a seção desce; no celular, uma embaixo da outra.
- **Reuniões:** a próxima em destaque, grande, à esquerda (capa, título, contagem regressiva em blocos, data, lembretes, botão); a lista à direita. Empilha em telas estreitas.
- **Sem repetição:** a call do Discord que já aparece como sala não ganha um segundo card (a sala já mostra quem está na call).
- **Uma ação principal por card:** só "Entrar" (sala ao vivo) e "Enviar aviso" (reunião não divulgada) são botões brancos. Destrutivas (Cancelar, Encerrar) são texto vermelho; a confirmação é que usa o botão vermelho.

### Widgets

Card com capa grande (o degradê do tema com granulado e um esmaecido embaixo), selos na capa (estado e tipo), avatares de quem está na call saindo da capa, título, números com ícone e o botão em pílula. Tudo centralizado dentro do card. Números, aviso e botão ficam presos embaixo (`mt-auto`), então se alinham entre cards de alturas diferentes.

### Estados

- **Carregando:** o "bichinho" (o logo do Screen piscando a barra, olhando para os lados com o "|<" e dando um pulinho) e o texto do que está acontecendo (`Loader`).
- **Cartões de estado** (`StatusCard`): tons `neutral`, `info`, `wait` (com o bichinho), `warning` e `error` (anunciado como alerta). Usados em sala bloqueada, encerrada, removido, erro e página não encontrada.
- **Avisos (toasts):** no canto, sem repetir o mesmo aviso, no máximo 4.

## Na chamada

`/r/:id` conectado: o menu e o topo do site somem (`useImmersive`).

- **Moldura:** preta como um monitor; a tela de dentro é transparente com desfoque, mostrando o fundo.
- **Pílula de voz:** flutua embaixo com microfone, câmera e tela (cada um com a setinha para escolher o aparelho, como no Meet, e o "!" amarelo quando o navegador bloqueou a permissão) e sair. Some com o mouse parado por 3 s e volta ao mexer (não some com ponteiro ou foco nela, com painel aberto ou para quem usa teclado).
- **Mais opções:** o botão do canto inferior direito abre uma faixa na borda direita (pessoas, pedir a palavra, layout, vídeo, tema, efeitos e você embaixo).
- **Pessoas:** no computador, uma coluna preta entre a tela e a faixa; no celular, cobre a tela. Começa fechada. Não há chat na sala.
- **Palco** (`room/Stage.tsx`):
  - Layouts Automático (destaque com tela compartilhada, mosaico sem), Mosaico e Destaque, escolhidos numa janela com desenho e nome (`room/LayoutPicker.tsx`).
  - Cada vídeo tem o quadro no formato real da transmissão (largo, quadrado ou em pé) e cresce até onde couber, sem faixas pretas (`--ar` + container queries).
  - **Fixar:** botão no canto de cada vídeo (aparece no hover/foco; fixado, fica à vista). Fixado vira destaque: a tela da pessoa, se compartilha, ou a câmera dela.
  - **Palco ligado** (modo palestra): só quem está no palco aparece; a plateia vira uma pílula com o número. Palco vazio mostra o aviso e, para admin em reunião, "Subir ao palco".
  - **Sala cheia de gente:** acima de 6 pessoas, quem só ouve (sem câmera, tela ou voz) vira o número "Só ouvindo".
- **"Como ver o vídeo"** (`room/VideoSettings.tsx`): formato, encaixe e posição, cada opção com desenho.

## Aparência: modo × fundo

Escolhas independentes, em Preferências e no botão de tema (que abre uma janela, também dentro da chamada). Ficam no navegador.

| Preferência | Valores | Padrão | Chave |
|---|---|---|---|
| Modo (`data-mode`) | Escuro, Claro | Escuro | `screem-mode` |
| Cor dos detalhes (`data-theme`) | Screen, Acelera | Screen | `screem-theme` |
| Animações (`data-motion`) | ligadas, desligadas | ligadas | `screem-motion` |
| Sons | ligados, desligados | ligados | `screem-sounds` |
| Layout do palco | Automático, Mosaico, Destaque | Automático | `screem-stage-layout` |
| Como ver o vídeo | formato, encaixe, posição | — | `screem-video-prefs` |

| Cor | Cores |
|---|---|
| Screen (padrão) | Laranja e rosa do logo (`#ffb347` → `#ff4f93`) |
| Acelera | Menta e turquesa da Acelera DEV (`#5ef0d0` → `#00b39c`) |

Valores antigos salvos (Verde, Brasil, Preto etc.) voltam para Screen.

**Criar uma cor:** adicione em `THEMES` (`lib/theme.ts`) e em `public/theme-init.js`, e defina `--brand-*`, `--bg-1..3` e `--logo-1/--logo-2` em `styles/v3.css` (`:root[data-theme='nome']`).

O degradê é o shader do AWS Hub: 40% da resolução, 30 fps, para com a aba escondida e fica parado com movimento reduzido ou animações desligadas. O granulado vai por cima.

## Marca

- **Logo do Screen** (`ScreenLogo`): SVG no formato da arte, retângulo de cantos bem redondos (302 × 238, raio 62) com o "|<" vazado (mostra o fundo). Usa a cor do texto, então fica preto sobre o fundo e claro dentro do painel. As peças têm classes para animar (`logo-glyph`, `logo-eye`).
- **Acelera DEV** (`AceleraMark`): o nome vetorizado (Geist Italic 800): "ACELERA" no degradê turquesa→azul com as linhas de velocidade e "DEV" na cor do texto. Layout em linha ou empilhado.
- O nome visível é **Screen**.

## Tipografia e forma

Geist (variável) em tudo. Título de página `2xl`/`3xl` em negrito; título de seção `lg` em negrito; texto `sm`; metadados `xs`. Componentes com cantos grandes (cards 26 px), botões em pílula.

## Movimento

- **Abertura** (a cada carregamento da página, inclusive reload; trocar de tela dentro do app não toca): o logo salta, pisca, olha para os lados, pisca de novo, estica virando uma cápsula e o "Acelera DEV" aparece dentro; ~3,8 s. Pula com clique ou tecla.
- **Mola exata** (`lib/motion.ts`), entradas `.rise`/`.stagger`, troca de página suave, botões encolhem ao toque.
- Animações desligadas ou `prefers-reduced-motion`: sem abertura, sem deriva do fundo, sem transições de entrada.

## Sons

Sintetizados (Web Audio, `lib/sounds.ts`): você entrou, alguém entrou, alguém saiu, aviso e erro. Um som só para várias pessoas juntas; nunca o único sinal (sempre há texto ou mudança na tela). Desligáveis em Preferências.

## Acessibilidade (WCAG 2.2 AA)

- **Foco visível:** contorno de 2 px na cor do foco em todo controle (`:focus-visible`).
- **Contraste:** texto ≥ 4,5:1; texto branco sobre vermelho com `#c81e1e` (botão) e `#c8352a` (selo "Ao vivo"). Modo claro com as cores de estado escurecidas.
- **Alvos:** ≥ 24 px (caixas de seleção de 18 px dentro de rótulos de 32 px); controles da chamada com 44 px; 40 px em telas de toque.
- **Estrutura:** um `h1` por página, headings sem saltos, landmarks (`main` com "Pular para o conteúdo"), seções nomeadas.
- **Nomes:** todo botão de ícone com nome; controles da chamada com o nome completo e dica visível no mouse e no teclado.
- **Gráfico de Estatísticas:** os mesmos números numa tabela para leitores de tela.
- `prefers-contrast: more` deixa tudo opaco; `forced-colors` (alto contraste do Windows) ganha bordas reais.

**Conferido:** checagem automática no navegador (nomes, alt, headings, ids, contraste, alvos) nas páginas do hub, sem falhas. **Falta:** axe e teclado em testes automáticos (Playwright) e teste com leitor de tela (NVDA).

## Noite (10 → 11/11/2026): v3, testes e acabamento

Registro do trabalho feito sozinho à noite (só front, só commits locais, sem push):

- **Testes de componente** (`apps/web/src/components/v3.test.tsx`, 19 testes): logo e carregamento, card de sala, calls sem repetição, preferências (chaves, modo e cor), janela de tema, palco (grade uniforme, fixar no toque), login, atalhos do painel só para admin, resumo de gravações e menu da conta (Esc devolve o foco, clique fora fecha). Total do front: 302 testes passando.
- **Movimento fluido**: troca de página e entradas com mola só com transform e opacidade (o desfoque saiu: pesava no celular); cards entram em sequência; capa sobe no hover e o card encolhe ao apertar; número da contagem "vira"; avisos com mola. Tudo some com "Animações desligadas" ou movimento reduzido.
- **Contraste conferido** em 10 páginas × 2 modos × 3 cores (checagem automática no navegador): no escuro o cinza dos textos menores subiu (`--z-500: #969696`) e a chave ligada tem o botão preto sobre a cor viva. Sem falhas depois disso.
- **Mais testes (madrugada)**: barra da sala (recolhida só com ícones e botões funcionando; expandir mostra a sala e "Na chamada"; recolher de novo), `useIdle` (some depois de 3 s parado, volta no movimento, não some com ponteiro/foco nos controles, teclado mostra tudo e não deixa sumir) e Auditoria em cartões (toda célula tem `data-label`), e Efeitos logo depois da câmera na pílula. Prettier, eslint, tsc, build e a suíte inteira do front passando (618 testes em 38 arquivos; um teste lento às vezes estoura o tempo com a máquina carregada e passa ao rodar de novo).
- **Fim da lista da noite**: tudo o que estava pendente foi testado e registrado aqui. O que não dá pra testar no jsdom (gaveta da barra no celular, que é só CSS em ≤640px) foi conferido no navegador nas molduras de celular do laboratório. Commits só locais; o push espera a correção de segurança do Flazo.
- **Barra de rolagem fina** (pedido do Will, estilo Spotify): sem trilho, só uma pílula cinza de ~4px arredondada (a área toda tem 6px) que clareia no hover, na página (celular) e nos painéis; o Firefox usa `scrollbar-width: thin`. De quebra: a margem da barra do celular vazava pra fora do `.hub`/`body` e criava 8px de rolagem à toa em telas curtas (agora `display: flow-root`).
- **Abertura e chave no celular** (print do Will no iPhone): o logo da abertura era preto (`#0a0a0a`) e sumia no modo escuro; agora usa o laranja/rosa do Screen, como o ícone do topo. A chave liga/desliga ficava esticada no celular (a regra de toque `min-height: 40px` valia para ela também) e o botão saía do lugar; agora a chave mantém 46×26 e a área de toque cresce por fora, invisível.
- **Abertura sem cápsula**: o logo do Screen não vira mais a pílula com a Acelera dentro (com o laranja, o nome ficava sobre um fundo colorido). Agora o logo encolhe e some, e fica só o nome "ACELERA DEV" solto no fundo do tema ("DEV" na cor do texto, então funciona no claro também).
- **Quem fala acende** (como no Discord): borda verde no card que entra rápido, sai devagar e pulsa de leve; sem câmera, anel verde que "respira" em ondas em volta do avatar; na legenda o microfone vira três barrinhas de som; na lista da barra o anel acende com transição. Leitor de tela ouve "falando". Com animações desligadas fica aceso, parado.
- **Carregamentos só quando precisa**: a sala não segura mais 1,4 s de carregamento à toa; o bichinho só aparece se a espera passar de 0,3 s (e entra em 0,2 s); entradas de página e cards em 280 ms com metade do atraso entre eles.
- **Correção**: 95 arquivos `.js` compilados (de um `tsc -b` rodado sem querer) tinham entrado no commit `86fadbe`; o Vite preferia o `.js` ao `.tsx` e escondia mudanças. Saíram em `bb76e6f`. A suíte real tem 309 testes (os 618 de antes contavam as cópias).
- **Setinha do aparelho** (ao lado do mic e da câmera) agora é botão de verdade: abre e fecha o menu; antes o toque nela fechava o menu como "clique fora" e o clique abria de novo. **Minha câmera**: por padrão aparece como os outros veem (sem espelhar); em "Como ver o vídeo" dá para escolher "Espelhada".
- **Bonequinho do topo** (`components/LiveLogo.tsx`, usado pelo `LogoMark`): SVG no degradê da cor escolhida (`--logo-1`/`--logo-2`) com dois olhos "| |". A piscadinha é o olho direito dobrando em "<" (o "|<" do logo) e voltando, a cada 2,6–6 s; os olhos seguem o mouse (sem mouse, de vez em quando olha para um lado). Um `pointermove` passivo e um `requestAnimationFrame` que só roda enquanto há movimento. Fica parado com animações desligadas ou movimento reduzido.
- **Tema Verde saiu**: ficam só Screen e Acelera (quem tinha Verde salvo volta para Screen).
- **Mais leve**: o código da sala (LiveKit, ~200 kB comprimido) é baixado em segundo plano quando o navegador fica ocioso, então entrar numa sala não espera download (não baixa com "economia de dados"); os cards dentro do painel perderam o desfoque de vidro (o fundo é sólido: não aparecia e pesava ao rolar). O resto do pacote já estava dividido por página.
- **Abertura com a piscadinha nova**: o bonequinho entra com os olhos "| |" e a piscada é o olho direito dobrando em "<" (mesma função `wink` do `LiveLogo`), em vez da barra achatando.
- **Capa viva**: a live com a sessão em espera não escurece mais a capa (o filtro tirava a cor do tema e apagava o selo "Ao vivo"); só encerrada ou cancelada fica cinza.
- **Microfone e câmera com setinha numa peça só**: a pílula inteira ganha a cor do estado (vermelho desligado, cor do tema ligado), sem bolinha por dentro; o foco do teclado contorna a peça toda. A seta gira (para cima fechado, para baixo aberto) e o menu de aparelhos volta para dentro ao fechar (180 ms). Prévia "Minha câmera" virou o desenho da pessoa acenando (a mão troca de lado na espelhada).
- **Voz em tempo real** (`room/useVoiceLevels.ts`): o volume de cada microfone aberto (até 16) é medido no navegador com o `createAudioAnalyser` do LiveKit, num único `requestAnimationFrame`, e escrito direto nos elementos com `data-voice-id` (`data-talking` e `--voice`). Acende na hora e apaga depois de ~0,3 s de silêncio; barrinhas, anel e borda seguem o volume. Sem medidor, vale o `isSpeaking` do servidor (que chega atrasado e passa pelo lote de 250 ms).
- **Barra da sala**: aberta, não some mais com o mouse parado; o tempo até sumir subiu para 5 s; volta em ~0,2 s (só a saída é lenta). No celular o palco não muda mais de tamanho quando os controles somem (redimensionar o vídeo travava a volta).
- **Prévia do link** (Discord, WhatsApp): `theme-color` estático laranja (`#ff7a45`, a barrinha do cartão; antes era um pêssego claro) e tags Open Graph (nome, título, descrição e `/icon-512.png`). Em uso, o tema continua trocando a cor da barra do navegador.
- **Fixar e automático (sala normal)**: o layout "Destaque" saiu; ficam Automático e Mosaico. Automático = um grande e a faixa: a tela compartilhada tem prioridade; sem tela, quem está falando (fica até outra pessoa falar). Cada pessoa fixa, só na própria tela, a **câmera** (`cam:{id}`) ou a **tela** (`{id}`, o mesmo formato do destaque do admin) de qualquer um, no vídeo ou na lista de Pessoas (`room/pin.ts`). Os controles somem depois de 30 s sem mexer o mouse.
- **Animação de fixar/desfixar**: `withPinTransition` (room/pin.ts) usa a View Transitions do navegador: cada quadro do palco tem um `view-transition-name` e o vídeo escolhido desliza da faixa para o lugar grande (e o de antes para a faixa) em ~0,26 s; o botão de fixar dá um "clique". Sem suporte ou com animações desligadas, troca na hora.
- **Zoom na tela compartilhada** (`room/ZoomPan.tsx`): só para quem assiste a tela de outra pessoa (quem compartilha não tem zoom na própria). Rodinha do mouse mira onde o mouse está (até 500%), arrastar move, clique duplo aproxima/volta, pinça no celular e botões − % + que aparecem ao passar o mouse. Vale só na tela de quem deu zoom; o transform vai direto numa camada (sem redesenho do React).
- **Como você ouve a sala** (`lib/audioPrefs.ts`, só no seu navegador, nada passa pelo servidor): botão de fone na pílula ("Som da sala": para de ouvir todo mundo; vale só na visita), e na lista de Pessoas, para cada um, "Mutar só para mim" e volume de 0 a 200% (salvos no navegador). Acima de 100% o `RemoteAudio` toca a pessoa por um ganho do Web Audio. "Silenciar" continua sendo a moderação, para a sala toda.
- **Qualidade pela sala de verdade** (`lib/bigRoom.ts`, `profileFor({ people, videos })`): até 5 vídeos ligados e até 30 pessoas, câmera 720p e tela 1080p a 60 quadros; até 100 pessoas, normal (30 quadros); mais de 100 pessoas na sala (não vagas), o modo econômico do Flazo. Antes valia pelas vagas (≥100 = 360p mesmo com 3 pessoas). A qualidade é escolhida ao ligar a câmera/tela.
- **Volume como no Discord**: na lista "Na chamada" da barra, clicar numa pessoa abre o volume e o "mutar só para mim" dela (`room/PersonAudio.tsx`, o mesmo da lista de Pessoas).
- **Bichinho em todo lugar**: o `Creature` (carregamento, avisos da sala, login) agora é o mesmo bonequinho do topo (`LiveLogo color="current"`): olhos "| |" que seguem o mouse, piscadinha em "<" e o pulinho, na cor do texto (tema no carregamento, claro nos avisos).
- **Alfinete como no Discord**: sempre à vista e apagado em cada vídeo; acende quando o mouse passa no vídeo (e fica aceso quando fixado). Só o botão fixa. No celular dá para tocar direto nele.
- **Calendário do Screen** (`components/DateTimeField.tsx`): no lugar do `datetime-local` do navegador (que não dá para estilizar), nas reuniões (criar e reagendar). Mesmo valor de antes ("2026-12-05T20:00"), então `localInputToIso`/`isoToLocalInput` e o backend não mudam. Digita "05/12/2026 20:00" ou escolhe no calendário em português (dias passados apagados, hoje com anel), colunas de hora e minuto (de 5 em 5), "Abrir agora (sem data)" e "Pronto". Sai de dentro do campo, o mês desliza ao trocar e o escolhido estala; Esc e clique fora fecham.
- **Saída de som e setinhas como no Discord**: o fone virou peça com setinha (escolhe por onde o som sai; a setinha do mic escolhe só o microfone). Ícone primeiro, setinha à direita apontando para baixo (gira ao abrir). O amplificador de quem passou de 100% sai pela mesma saída (`AudioContext.setSinkId`). Sem permissão o navegador esconde os aparelhos: o menu oferece "Permitir e mostrar aparelhos". Firefox/Safari não deixam escolher a saída e o menu avisa.
- **Atualização automática das listas saiu** (pedido do Will): Salas, calls e Reuniões voltam a atualizar ao abrir a página e no botão "Atualizar".
- **Quem apresenta sempre em alta** (áudio do Flazo: lives com 1 a 4 transmitindo, quase sempre só câmera, tela travada): com até 4 vídeos, a câmera de quem transmite sai em alta (720p60, com camadas), mesmo com 500 assistindo; a plateia recebe a camada que o servidor aguenta (`cameraQualityFor`, regra do Flazo). Tela e áudio ficam leves acima de 100 pessoas. Teste de carga local (1 núcleo, 4 GB): 2 transmitindo e 500 recebendo a camada leve = CPU média 75%, sem perda.
- **Espelho para todo mundo** (`lib/videoEffects.ts`): "Minha câmera: espelhada" vira cada quadro do vídeo enviado (um `VideoTransformer` da própria biblioteca de efeitos), então todos veem espelhado. Com fundo (desfoque/imagem) junto, o `BackgroundTransformer` recebe o quadro já virado (a câmera aceita um processador só). A prévia mostra o vídeo enviado (sem virar de novo) e o efeito volta sozinho ao religar a câmera. Conferido no navegador com uma câmera falsa: o que estava à esquerda sai à direita, com e sem desfoque.
- **Animação de voz com som cortado**: quem você mutou só para você (ou com o fone cortado) continua acendendo ao falar, pelo aviso do servidor (o Chrome não entrega ao medidor o som de um player mudo). Com o seu microfone mutado, você nunca acende.
- **Legendas saíram** (pedido do Will): sem botão nos Efeitos, sem faixa na sala e fora da página "Como funciona". O envio de legendas pela conexão da sala (do Flazo) ficou sem uso.
- **Pílula compacta**: com o fone novo ela precisa de ~435 px; em tela estreita (celular, ou janela pequena com painel/barra abertos) os botões encolhem (38 px, 34 px abaixo de 380 px) em vez de cortar o botão de sair. Conferido numa moldura de 360 px.
- **Volume da voz e da transmissão separados**: cada pessoa tem "Voz" (o microfone) e, se compartilha a tela com som, "Tela" (a transmissão), de 0 a 200%, só para você (`volumeKey(id, "tela")`). "Mutar só para mim" cala as duas. O mic já sai com a redução de ruído do navegador ligada (padrão do LiveKit: noiseSuppression, voiceIsolation, echoCancellation).
- **Tela cheia de um vídeo** (como no YouTube): cada câmera e tela tem um botão de tela cheia ao lado do alfinete; o vídeo ocupa o monitor (Fullscreen do navegador) e as miniaturas embaixo (aparecem ao mexer o mouse) trocam de vídeo sem sair. Esc ou "Sair da tela cheia" volta. O zoom com a rodinha continua na tela compartilhada.
- **Chat e enquete** (`room/ChatPanel.tsx`, eventos em `realtime/chat.ts` do backend): botão "Chat" na barra (com bolinha de mensagens novas) abre o painel ao lado da chamada. Mensagens ficam no localStorage do navegador e somem quando a sala fecha (`room:ended`); uma a cada 3 s (o botão conta a espera). Enquete fixada no topo como no YouTube: membro sugere, moderação aceita/recusa, voto único, resultado em barras ao vivo; moderação cria na hora, encerra, tira do topo e apaga mensagens.
- **Celular em pé (um grande e a faixa)**: o vídeo grande ocupa toda a largura e a altura que sobra (câmera preenche; tela compartilhada inteira) e as miniaturas viram uma fileira de quadrinhos de 78×104 centralizada, que rola de lado. Antes o grande ficava em 64% da altura e a miniatura crescia demais.
