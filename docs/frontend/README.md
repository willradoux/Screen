# Frontend

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, React Router, `livekit-client` e `socket.io-client`. Hospedado na VPS: build estático servido por nginx (`apps/web/Dockerfile`).

**Este frontend é descartável.** Tudo que ele sabe vem do contrato do backend ([backend/](../backend/README.md)); nada de regra de negócio mora aqui. A interface só esconde ou desabilita o que o servidor recusaria, e o servidor confere tudo de novo.

## Rodando

```bash
npm run dev:api      # backend em :3000 (precisa do .env, veja docs/infra)
npm run dev:web      # frontend em :5173 (compila o pacote shared antes)
npm test -w @screem/web
```

Variáveis (`apps/web/.env`, só as com prefixo `VITE_` vão para o navegador; **nunca** coloque segredos):

| Variável | Padrão | Descrição |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api/v1` | Base da API REST |
| `VITE_SOCKET_URL` | `http://localhost:3000` | Origem do Socket.IO |

Em desenvolvimento, `localhost:5173` e `localhost:3000` são o mesmo *site* para cookies, então o login funciona sem configurar domínio. Em produção use subdomínios do mesmo domínio ([02-arquitetura.md](../02-arquitetura.md#domínios-e-cookies)).

## Estrutura

```
apps/web/src/
  main.tsx, App.tsx          entrada e rotas (sala e admin carregam sob demanda)
  auth/AuthProvider.tsx      quem está logado (GET /auth/me)
  lib/
    api.ts                   cliente da API: um método por rota, erros como ApiError
    errors.ts                código de erro -> texto para a pessoa
    format.ts                datas, contagens, redirect seguro
    moderation-rules.ts      hierarquia espelhada do backend (só para a interface)
    media.ts                 erros de câmera/microfone/tela em texto útil
    types.ts, config.ts
  components/                Layout, guardas de rota, UI básica, avisos (toasts)
  room/
    sessionReducer.ts        máquina de estados da entrada na sala (pura)
    useRoomSession.ts        orquestra API + LiveKit + Socket.IO
    useParticipants.ts       pessoas e faixas do LiveKit
    Stage.tsx                grade de vídeos, destaque de tela, áudio remoto
    Controls.tsx             microfone, câmera, tela, sair
    ParticipantsPanel.tsx    lista de pessoas e moderação
    Screens.tsx              telas de bloqueio, encerrada, removido, erro
    publish-rules.ts         por que o botão está desabilitado
  pages/                     Login, Salas, Reuniões, Sala, e admin/ (reuniões, config, auditoria)
```

## Rotas

| Rota | Quem | Conteúdo |
|---|---|---|
| `/login` | todos | Botão "Entrar com Discord"; mostra `?error=` |
| `/` | logado | Salas abertas e agendadas (`GET /rooms`) |
| `/reunioes` | logado | Reuniões e a próxima com contagem regressiva |
| `/r/:roomId` | logado | **A sala.** É o link que o bot manda no Discord e **não pode mudar** |
| `/admin/reunioes` | ADMIN | Criar, agendar, reagendar, abrir, cancelar, encerrar, relatório |
| `/admin/config` | ADMIN | Canais, cargos e limites |
| `/admin/auditoria` | ADMIN | Registros com filtros e "carregar mais" |

Quem não está logado vai para `/login?redirect=<caminho>` e volta para onde estava. O `redirect` só aceita caminhos do próprio site (o backend valida de novo).

## Login

1. O botão aponta para `GET {API}/auth/discord?redirect=/r/abc` (navegação, não `fetch`).
2. O Discord devolve para a API, que cria a sessão (cookie `HttpOnly`) e redireciona de volta.
3. O frontend chama `GET /auth/me` com `credentials: 'include'`.
   - `401`: anônimo. `403 NOT_IN_GUILD` / `ACCOUNT_BLOCKED`: vai ao login com a explicação.
   - Falhas do callback chegam em `/login?error=<CODE>` (`INVALID_STATE`, `ACCESS_DENIED`, `NOT_IN_GUILD`, `ACCOUNT_BLOCKED`, `DISCORD_OAUTH_FAILED`, `DISCORD_UNAVAILABLE`).

## A tela de sala

Estados (em `sessionReducer.ts`):

```
checking ─▶ ready ─▶ joining ─▶ connected ─▶ disconnected
    │                               │              │
    └─▶ blocked (consulta de novo)  └─▶ ended / removed (finais)
```

| Estado | Origem | O que mostra |
|---|---|---|
| `checking` | `GET /rooms/:id` + `GET /rooms/:id/access` | "Verificando seu acesso" |
| `blocked` | `access.canJoin = false` | O motivo e o que fazer (abaixo) |
| `ready` | `access.canJoin = true` | Tela de entrada com o botão **Entrar na sala** |
| `joining` | `POST /rooms/:id/join` e conexão | "Conectando" |
| `connected` | LiveKit + Socket.IO conectados | Vídeos, controles, lista de pessoas |
| `disconnected` | LiveKit caiu | Aviso com **Reconectar** (refaz o `join`) |
| `ended` | `room:ended` | Motivo do encerramento |
| `removed` | `moderation:action` KICKED/BANNED | Motivo e até quando |
| `error` | qualquer falha | Texto do erro e **Tentar de novo** (exceto sala inexistente) |

Bloqueios (`access.reason`) e se a tela continua consultando sozinha:

| Motivo | Tela | Consulta de novo? |
|---|---|---|
| `NOT_IN_VOICE` | "Entre no canal de voz “X” no Discord" | a cada 5 s; entra assim que a pessoa está na call |
| `ROOM_NOT_OPEN` + `SCHEDULED` | Horário e contagem regressiva | a cada 10 s; abre sozinha |
| `ROOM_NOT_OPEN` + `ENDED`/`CANCELED` | Sala encerrada / reunião cancelada | não |
| `ROOM_FULL` | "A sala está lotada" | a cada 10 s |
| `BANNED_FROM_ROOM` | Prazo do banimento | não |
| `ROLE_NOT_ALLOWED` | Reunião restrita | não |

**Por que existe a tela "Entrar na sala":** os navegadores só tocam áudio e liberam captura depois de um clique. O clique chama `room.startAudio()`. Câmera e microfone sempre começam **desligados**.

Depois de entrar:

- `POST /rooms/:id/join` devolve `livekit.url` e `livekit.token`; o frontend conecta com as opções recomendadas ([livekit-webrtc.md](../backend/livekit-webrtc.md#qualidade-e-capacidade)): `adaptiveStream`, `dynacast`, simulcast, DTX e câmera em 720p. Tela: até 1080p/30 fps, com `contentHint: 'detail'` (legibilidade acima de fluidez).
- Em seguida abre o Socket.IO, envia `room:subscribe` (e de novo a cada reconexão) e trata os eventos: `room:ended`, `moderation:action`, `voice:warning`/`voice:restored`, `room:updated`, `participant:updated`, `participant:joined`/`left`, `session:revoked`.
- Quem compartilha tela ganha destaque (tela grande e pessoas numa faixa); sem compartilhamento, grade. Quem está falando ganha borda.
- O áudio de todos e o áudio de tela tocam em elementos escondidos; são recriados só quando as faixas mudam.
- Sair: derruba LiveKit e Socket.IO, chama `POST /rooms/:id/leave` (falha dele não trava) e volta para `/`.

### Botões desabilitados e por quê

`publish-rules.ts` explica em texto, na ordem: silenciado pela moderação, modo palestra sem ser palestrante, sem nenhuma fonte permitida. Moderação e admin nunca são restringidos. O LiveKit é quem impede de verdade (permissões do token e mudanças em tempo real); a interface só evita um botão que não funcionaria.

### Moderação (MOD e ADMIN)

O painel de pessoas mostra, para cada uma, só as ações que a hierarquia permite ([permissoes.md](../backend/permissoes.md)): silenciar/liberar, tornar/tirar palestrante, expulsar e banir (com confirmação). Banir "até o fim da sala" só aparece para admin. Há ainda **Modo palestra** e **Encerrar sala**. Se o servidor recusar, o motivo aparece num aviso.

## Erros

Decide-se sempre pelo `code`, nunca pelo texto do servidor. `lib/errors.ts` traduz cada código; um código desconhecido cai numa frase genérica (nunca quebra). Falha de rede vira `NETWORK_ERROR`.

## Reuniões no painel de admin

O campo de horário usa o **fuso do navegador** (`datetime-local`) e a API recebe ISO 8601 em UTC. Já o comando `/reuniao agendar` do bot usa o fuso do servidor (`TIMEZONE`, padrão Brasília). Lembretes: 24 h, 1 h e 5 min, desmarcáveis. Reuniões encerradas têm botão **Ver relatório** (duração, pico e presença).

## Testes

`npm test -w @screem/web` (Vitest + Testing Library, jsdom). Cobrem o cliente da API, as mensagens de erro, a máquina de estados da sala, as regras de hierarquia e de publicação, as guardas de rota, o login, a tela de sala inteira (com dublês de LiveKit e Socket.IO: bloqueios, entrada, controles, remoção, encerramento, queda e reconexão), o painel de moderação e as telas de admin.

O que **não** é coberto por teste automático: a captura real de câmera, microfone e tela, a reprodução de vídeo/áudio e o LiveKit de verdade. Isso exige navegador com dispositivos e um servidor LiveKit; veja o checklist de paridade abaixo.

## Deploy (VPS, Coolify)

O frontend é o serviço `web` de `infra/coolify/docker-compose.yml`: `apps/web/Dockerfile` compila o Vite e o nginx (`apps/web/nginx.conf`) serve os arquivos.

- `VITE_API_URL` e `VITE_SOCKET_URL` são derivados de `PUBLIC_API_URL` e **embutidos no build**: mudou a URL da API, faça Redeploy.
- O nginx reescreve qualquer rota para `index.html` (SPA) e define os cabeçalhos de segurança (CSP com `connect-src` para a API e `wss://live...`, `img-src` com `cdn.discordapp.com`, `Permissions-Policy` liberando câmera, microfone e tela só para o próprio site). Veja [seguranca.md](../backend/seguranca.md#cabeçalhos-http).
- Domínio `screen.exemplo.com`, **irmão** do da API, para o cookie funcionar.
- Passo a passo: [deploy-coolify.md](../infra/deploy-coolify.md).

## Trocando o frontend

1. Leia o contrato: [api-rest.md](../backend/api-rest.md), [eventos-socketio.md](../backend/eventos-socketio.md) e [autenticacao.md](../backend/autenticacao.md).
2. Implemente login, a rota `/r/:roomId` com todos os estados da tabela acima, e os eventos.
3. Aponte o domínio ou ajuste `WEB_URL` no backend (muda CORS e os links dos embeds).

Nada mais muda no backend.

## Checklist de paridade (para qualquer frontend)

- [x] Login e logout
- [x] Rota `/r/:roomId` com todos os estados
- [x] Publicar câmera, tela e microfone (código pronto; falta teste com dispositivos reais)
- [x] Assistir e grade, com destaque de tela
- [x] Reconexão (Socket.IO reassina a sala; LiveKit tem botão de reconectar)
- [x] Moderação
- [x] Telas de admin
- [x] Tratamento dos códigos de erro relevantes
- [ ] Testado em Chrome, Firefox e Safari com câmera, microfone e tela de verdade
