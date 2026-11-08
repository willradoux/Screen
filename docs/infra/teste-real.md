# Teste real: do zero até uma live funcionando

Tudo que existe no repositório foi testado com dublês do Discord e do LiveKit (e MongoDB de verdade). **Este roteiro é o que falta**: rodar com o Discord e o LiveKit reais, na sua máquina, antes de ir para a VPS. Leva uns 30 minutos.

Você precisa de: Docker Desktop aberto, Node 22, uma conta no Discord com permissão de administrar um servidor de testes (**não use o Acelera DEV para o primeiro teste**) e, para ver duas pessoas, um segundo navegador (ou perfil/janela anônima) logado com **outra conta** do Discord que esteja no mesmo servidor.

## 1. Criar a aplicação no Discord

1. [Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **OAuth2**: copie o *Client ID* e gere o *Client Secret*. Em *Redirects* adicione `http://localhost:3000/api/v1/auth/discord/callback`.
3. **Bot**: *Reset Token* e copie o token. Ative **Server Members Intent**. (Não precisa de Message Content.)
4. **OAuth2 → URL Generator**: escopos `bot` e `applications.commands`; permissões *View Channels*, *Send Messages*, *Embed Links*, *Read Message History*. Abra a URL gerada e adicione o bot ao **servidor de testes**.
5. No Discord, em *Configurações → Avançado*, ative o **Modo desenvolvedor**. Clique com o botão direito no servidor → **Copiar ID** (é o `DISCORD_GUILD_ID`) e no seu usuário → **Copiar ID** (é o `BOOTSTRAP_ADMIN_IDS`).

> Nunca cole o Client Secret nem o token do bot em chats, issues ou commits. Eles ficam só no `.env` (que o Git ignora).

## 2. Preparar o servidor de testes

Crie uma **categoria** (ex.: “Lives”) com um ou dois **canais de voz**, um canal de texto para os embeds das lives (ex.: `#lives`) e outro para os avisos (ex.: `#avisos`). Dê ao bot permissão de ver e escrever nesses canais de texto.

## 3. Configurar e subir

```bash
cp apps/api/.env.example apps/api/.env
```

Edite `apps/api/.env`:

| Variável | Valor |
|---|---|
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | do passo 1.2 |
| `DISCORD_BOT_TOKEN` | do passo 1.3 |
| `DISCORD_GUILD_ID` | do passo 1.5 |
| `BOOTSTRAP_ADMIN_IDS` | o **seu** ID de usuário (assim você é admin desde o primeiro minuto) |
| `COOKIE_SECRET` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (precisa decodificar para 32 bytes) |
| `LIVEKIT_*` | já vêm certos para o modo dev (`devkey` / `secret`, `ws://localhost:7880`) |

Depois, em três terminais:

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # MongoDB + LiveKit (modo dev)
npm run dev:api                                         # API + bot em :3000
npm run dev:web                                         # frontend em :5173
```

## 4. Roteiro de verificação

Marque cada item. “Esperado” é o que deve acontecer; se for diferente, anote o que viu e a mensagem do terminal da API.

### Base
- [ ] `curl localhost:3000/api/v1/health` → `{"data":{"status":"ok",...}}`.
- [ ] `curl localhost:3000/api/v1/ready` → `200` com `"mongo":"ok"`.
- [ ] No terminal da API aparece “bot conectado ao Discord” e “slash commands registrados”.
- [ ] `http://localhost:3000/api/v1/docs` abre a documentação interativa.

### Configuração pelo Discord
- [ ] `/config categoria-live` (escolha a categoria), `/config canal-live`, `/config canal-avisos`.
- [ ] `/config ver` mostra tudo certo.
- [ ] Um usuário sem permissão tenta `/config ver` → “não tem permissão”.

### Live (use as duas contas)
- [ ] Conta A entra num canal de voz da categoria → em até alguns segundos aparece o **embed “🔴 Live aberta”** com o botão “Abrir sala” em `#lives`. **Só um embed.**
- [ ] Clique em **Abrir sala** → o navegador vai para `localhost:5173/r/...` → tela de login → **Entrar com Discord** → volta para a sala com o botão **Entrar na sala**.
- [ ] Conta B (no segundo navegador, **fora** do canal de voz) abre o mesmo link → “Entre na call para participar”, **sem** botão de entrar.
- [ ] Conta B entra no canal de voz → a tela dela libera **sozinha** em até ~5 s.
- [ ] As duas entram. Ligue o **microfone** de A e fale: B ouve e a borda verde aparece em A. Ligue a **câmera**: B vê o vídeo.
- [ ] A clica **Tela** e escolhe uma janela: B vê a tela em destaque (e, se marcou “compartilhar áudio”, ouve).
- [ ] O embed no Discord mostra “Participantes: 2”.

### Sair da call
- [ ] B sai do canal de voz **sem fechar a página** → aparece “Você saiu do canal de voz… volte em 30s”.
- [ ] Se B voltar ao canal antes de 30 s, o aviso some. Se não voltar, é **removida da sala**.
- [ ] Quando todos saem do canal, a live **encerra em ~60 s** e o embed vira “⚫ Live encerrada”.

### Moderação (você, como admin, e a conta B como membro)
- [ ] Abra o painel **Pessoas**: você vê Silenciar, Tornar palestrante, Expulsar, Banir para B, e **nada** para si mesmo.
- [ ] **Silenciar** B: B recebe aviso, os botões de câmera/microfone dela ficam desabilitados. Ela sai e volta: **continua silenciada**.
- [ ] **Modo palestra**: B perde os botões; ao ser **tornada palestrante**, recupera.
- [ ] **Expulsar** B: tela “Você foi removido da sala”; ela consegue entrar de novo.
- [ ] **Banir** B por 15 min: ela não entra mais (“Você foi removido desta sala”).
- [ ] Em `/admin/auditoria` aparecem todas essas ações.

### Reuniões
- [ ] `/reuniao criar titulo:Teste` → aviso `🟢 aberta` em `#avisos`; o link abre a sala (sem precisar estar na call).
- [ ] `/reuniao agendar titulo:Teste2 data:<hoje> hora:<daqui a 5 min> lembretes:2,1` → aviso `📅`; **2 minutos antes** chega o lembrete `⏰`; no horário o aviso vira `🟢`.
- [ ] Em `/admin/reunioes`: reagende uma reunião e veja a mensagem `🔁`; cancele outra e veja `🚫`.
- [ ] Encerre uma reunião em que alguém entrou: o aviso mostra **Duração/Participantes/Pico** e **Ver relatório** lista a presença.
- [ ] Uma reunião aberta sem ninguém é encerrada sozinha após 15 min (ajuste `EMPTY_MEETING_END_MINUTES=1` no `.env` para ver rápido).

### Resiliência
- [ ] Com uma live aberta, **reinicie a API** (`Ctrl+C` e `npm run dev:api`): **não** aparece embed duplicado e a live continua.
- [ ] Pare o LiveKit (`docker compose -f infra/docker-compose.dev.yml stop livekit`): entrar numa sala dá “servidor de vídeo indisponível”, sem travar a página.
- [ ] Faça logout em outra aba: a sala aberta mostra “Sua sessão terminou”.

## 5. Se algo falhar

| Sintoma | Onde olhar |
|---|---|
| “Variáveis de ambiente inválidas” ao subir a API | A mensagem lista quais; confira `TOKEN_ENCRYPTION_KEY` (base64 de 32 bytes) e os IDs (17 a 20 dígitos) |
| Login volta com `?error=INVALID_STATE` | Cookie bloqueado: use `localhost` (não `127.0.0.1`) nos dois lados |
| Login volta com `NOT_IN_GUILD` | A conta não está no servidor de `DISCORD_GUILD_ID` |
| Bot não cria embed | Permissões do bot nos canais de texto; `/config canal-live`; logs da API |
| `/config` não aparece | O bot foi convidado com o escopo `applications.commands`? Reinicie a API |
| Conecta mas sem vídeo | `docker compose ... logs livekit`; portas 7881/tcp e 7882/udp livres; Firefox/VPN às vezes bloqueiam WebRTC local |
| Câmera/tela não pedem permissão | Use `http://localhost` (é contexto seguro); em outro host precisa de HTTPS |

Quando tudo estiver marcado, o caminho para produção é [README.md](README.md) (VPS, domínios e TURN).
