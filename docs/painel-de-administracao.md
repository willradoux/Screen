# Painel de administração e recursos do dia a dia

Guia de uso e referência de tudo que o painel faz. Para a API, veja [backend/api-rest.md](backend/api-rest.md) e o `openapi.json`; para instalar, [infra/deploy-coolify.md](infra/deploy-coolify.md).

## Quem entra no painel

| Quem | Acesso |
|---|---|
| Dono do servidor, quem tem a permissão **Administrador** do Discord | Admin |
| Quem tem um **cargo de administrador** (Configurações > Quem administra, ou `ADMIN_ROLE_IDS`) | Admin |
| Quem tem um **cargo de moderador** | Moderador: vê o painel e modera reuniões |
| Pessoas adicionadas em **Pessoas** (mesmo sem cargo, mesmo fora do servidor) | Admin ou Moderador, como você escolher |
| Todo o resto | Não entra. A tela explica o motivo e leva de volta à página principal |

A checagem é sempre no servidor. A interface só esconde o que seria recusado.

## Páginas

| Página | Para quê | Quem |
|---|---|---|
| **Painel** | Sessões de live agora, reuniões, o que falta configurar | Admin, Mod |
| **Gerenciar reuniões** | Criar, agendar, reagendar, abrir, cancelar, **Enviar aviso**, relatório | Admin |
| **Configurações** | Escolher calls, canais e cargos por seletores; tempos | Admin |
| **Pessoas** | Dar ou tirar acesso ao painel | Admin |
| **Estatísticas** | Lives, reuniões, pessoas, tempo conectado, ranking, gráfico por dia (7, 30 ou 90 dias) | Admin |
| **Gravações** | Baixar ou apagar gravações de reuniões | Admin |
| **Auditoria** | Quem fez o quê e quando | Admin |

## Lives (calls) e reuniões são coisas diferentes

| | Live (call) | Reunião |
|---|---|---|
| Como abre | Sozinha, quando alguém entra numa call habilitada | O admin cria no painel (ou `/reuniao`) |
| Quem entra | Só quem está **na call do Discord agora** (vale para todos, até admin) | Qualquer um logado (ou só os cargos escolhidos). **Não precisa estar numa call** |
| Moderação | **Não existe** (cada um controla a própria transmissão) | Silenciar, expulsar, banir, palestrante, modo palestra, silenciar todos, desligar câmeras, encerrar |
| Aviso | O bot manda o link no **chat da própria call** | O admin clica em **Enviar aviso** quando quiser |
| Gravação | Não | Sim, pelo admin |

### Habilitar calls para live

Configurações > **Calls com live**: marque as calls (agrupadas por categoria; "Marcar todas" escolhe a categoria). Também dá para escolher uma categoria inteira. O canal de texto alternativo só é usado se o bot não puder escrever no chat da call.

### Sessão de vídeo em espera

A live existe enquanto houver gente na call. O **vídeo** só fica no ar enquanto alguém usa:

- Ninguém conectado ao site por ~1 minuto: vai para espera.
- Ninguém transmitindo câmera ou tela por **N minutos** (padrão 10): vai para espera. Só microfone não conta.
- Ao entrar pelo link, a sessão é **ativada** ("Ativando sessão…"). Alguém precisa começar a transmitir em **M minutos** (padrão 3), senão volta para a espera.

Os tempos são configuráveis. O link no chat da call continua valendo. O embed mostra "Em uso" ou "Em espera".

### Reuniões: criar e divulgar

Criar não divulga nada por padrão. A reunião tem data e hora e aparece no site. Quando quiser, clique em **Enviar aviso** (ou **Enviar de novo**). Lembretes, avisos de reagendamento e de cancelamento só existem depois que a reunião foi divulgada. Quem abre o link antes da hora vê a contagem regressiva e não consegue entrar.

### Pedir a palavra

Na reunião, qualquer participante usa **Pedir a palavra**. A moderação vê a fila por ordem e clica em **Dar a palavra** (a pessoa vira palestrante e sai da fila). A fila fica na memória do servidor: reiniciar a API a zera.

## Na sala

- Microfone, câmera e tela são independentes e **começam desligados**. Dá para transmitir só a câmera, só a tela ou as duas.
- **Compartilhar tela não existe no celular**: Chrome e Safari móveis não permitem (nem como PWA). O botão aparece desabilitado com a explicação.
- **Vídeo** (engrenagem): preencher ou mostrar tudo, parte da imagem (cima, centro, baixo) e formato do quadro (automático, horizontal, vertical, quadrado). Vale só na sua tela. No automático o quadro segue a transmissão: vertical fica vertical, e deitar o celular deita o quadro.
- **Efeitos**:
  - **Fundo**: desfocar, imagens prontas ou a sua. Roda no navegador (modelo e WebAssembly servidos pelo próprio site, em `/mediapipe`). Pede Chrome ou Edge atualizados e um aparelho razoável.
  - **Voz**: Robô, Eco, Rádio. Roda no navegador, antes de a voz sair. **Não há mudança de tom** (voz grave ou aguda).
  - **Legendas ao vivo**: mostra o que os outros falam e transcreve a sua fala. A transcrição usa o serviço de voz do navegador (Chrome: Google; Edge: Microsoft), que **recebe o áudio**. Firefox não transcreve.
- **QR code** na tela de entrada abre a sala no celular.
- Quando a reunião está sendo **gravada**, todos veem o aviso.

## Gravação de reuniões

1. Dentro de uma reunião aberta, o admin abre o painel de pessoas > **Gravação**, escolhe o que gravar e clica em **Começar a gravar**.
2. Modos: **todos em grade**, **quem fala / tela**, **só áudio** (.ogg), **uma pessoa** (rosto e voz) e **a tela de uma pessoa**.
3. Ao parar (ou quando a reunião acaba), o arquivo é finalizado e a gravação fica **Pronta**.
4. Em **Gravações** o admin baixa o arquivo. Ele tem **10 dias** (`RECORDING_RETENTION_DAYS`); depois o arquivo é **apagado de vez**. A página mostra quantos dias faltam.

Como funciona por baixo: o LiveKit **Egress** grava (precisa de Redis e de um volume compartilhado com a API, já no `infra/coolify/docker-compose.yml`). O download passa pela API com o cookie de sessão, nunca por link público. Uma limpeza roda de hora em hora.

> **Aviso legal e de confiança:** gravar pessoas exige que elas saibam. O site mostra o aviso para todos na sala, mas avise também no convite da reunião. Em termos de LGPD, defina quanto tempo guarda (aqui, 10 dias) e quem acessa (só admins).
>
> **Custo:** o Egress usa um Chrome sem tela e consome CPU. Em VPS pequena, grave com moderação e teste antes de uma reunião importante. **A gravação não foi testada contra um Egress real nesta entrega**; os testes usam um Egress simulado.

## Canal de logs

Configurações > **Registro (logs)**. O bot escreve no canal (sem marcar ninguém, com data e hora): ações dos admins e mods, live aberta e encerrada (com o motivo), quem entrou e saiu das salas, sessão em espera ou ativada, gravações, bot conectado ou desconectado e erros do sistema. O mesmo erro repetido só aparece a cada 5 minutos. Sem canal escolhido, nada é enviado.

## Avisos de configuração

Uma faixa no topo do site avisa quando falta algo: bot fora do servidor, nenhuma call escolhida, canal de avisos não escolhido. Admin vê o que fazer e o link; membro vê "fale com um administrador". Toda resposta de erro da API também traz **o que fazer** (`hint`) e um código de suporte que aparece nos logs.

## Dados da conta (OAuth)

O login pede os escopos `identify`, `email` e `guilds.members.read`. Guardamos id, nome, foto e e-mail. O e-mail fica só no banco, **nunca** é devolvido por rota nenhuma. Quem já tinha entrado precisa autorizar de novo para o e-mail ser salvo.

## Status das calls

A página inicial mostra **Calls agora**: cada call habilitada, quem está nela e o link da sala (ou "entre na call para abrir"). Vem do cache de voz do bot, não do Discord a cada pedido.

## Aplicativo (PWA)

O site é instalável (botão "Instalar app" no Chrome e no Android; "Adicionar à tela de início" no iPhone). O service worker guarda só arquivos do próprio site; **nunca** a API nem o Socket.IO. Tema claro ou escuro, escolhido no botão do cabeçalho.

## Segurança: Node2Shell (CVE-2026-111497)

Falha no decodificador Brotli do Node, com execução remota de código. Corrigida no Node **22.23.4**, 24.22.1 e 26.12.1. As imagens Docker estão fixadas em `node:22.23.4-alpine` e a API **recusa corpos comprimidos** (gzip, br) com `415`. Atualize também o Node das máquinas de desenvolvimento.

## Variáveis de ambiente novas

| Variável | Padrão | O que faz |
|---|---|---|
| `RECORDINGS_DIR` | `./recordings` (`/recordings` no compose) | Onde a API lê os arquivos gravados |
| `RECORDINGS_EGRESS_DIR` | `/out` | A mesma pasta, vista pelo Egress |
| `RECORDING_RETENTION_DAYS` | `10` | Dias para baixar antes de apagar |

Todo o resto (calls, canais, cargos, tempos, canal de logs) é configurado **no painel**, não por variável.
