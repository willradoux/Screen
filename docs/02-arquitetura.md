# 02 - Arquitetura

## Stack

| Camada | Tecnologia | Onde roda |
|---|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS | VPS (nginx, via Coolify) |
| Backend | Node.js, TypeScript, Express, Socket.IO | Docker na VPS |
| Banco | MongoDB | Docker na VPS |
| Autenticação | Discord OAuth2 | Backend |
| Bot | discord.js (dentro do processo do backend ou serviço próprio) | Docker na VPS |
| Mídia | WebRTC com LiveKit (SFU) | Docker na VPS |
| NAT traversal | Coturn (TURN/STUN) | Docker na VPS |

## Visão geral

```
                        +-------------------+
                        |     Discord       |
                        | (OAuth2, Gateway, |
                        |   REST, Voice)    |
                        +----+---------+----+
                             ^         ^
                OAuth2/REST  |         | Gateway (voice states, slash commands)
                             |         |
+----------+  HTTPS/WSS  +---+---------+----+   gRPC/HTTP   +-----------+
| Frontend | <---------> |      Backend     | <-----------> |  LiveKit  |
| (nginx)  |             | Express+Socket.IO|   tokens,     |  (SFU)    |
+----+-----+             |   + Bot Discord  |   webhooks    +-----+-----+
     |                   +---------+--------+                     |
     |                             |                              |
     |                        +----v----+                         |
     |                        | MongoDB |                         |
     |                        +---------+                         |
     |       WebRTC (UDP/TCP, mídia)                              |
     +------------------------------------------------------------+
     |                       Coturn (TURN/STUN) na mesma VPS      |
     +------------------------------------------------------------+
```

O navegador fala com o backend para tudo que é controle (login, salas, permissões, moderação) e fala **direto com o LiveKit** para a mídia, usando um token de curta duração emitido pelo backend.

## Componentes do backend

| Módulo | Responsabilidade |
|---|---|
| `auth` | Fluxo OAuth2, sessão, logout |
| `discord` | Cliente do bot, cache de voice states, envio de embeds, slash commands |
| `rooms` | Ciclo de vida de salas (live e reunião), links, estado |
| `meetings` | Criação, agendamento, lembretes |
| `livekit` | Emissão de tokens, moderação de mídia, webhooks |
| `moderation` | Mutar, expulsar, bloquear, auditoria |
| `settings` | Configurações da guilda (categoria, canais, cargos) |
| `realtime` | Servidor Socket.IO, autenticação e rooms de socket |
| `audit` | Registro de ações sensíveis |
| `shared` | Config, logger, erros, validação, utilitários |

Detalhes em [backend/estrutura-do-projeto.md](backend/estrutura-do-projeto.md).

## Fluxo 1: entrar num canal de live

```
Membro entra no canal de voz
  -> Discord Gateway envia voiceStateUpdate ao bot
  -> Backend verifica se o canal pertence à categoria de lives
  -> Se não há sala ativa para o canal: cria Room (type=LIVE) no Mongo
  -> Bot envia embed com botão "Abrir sala" no canal de texto configurado
     (uma única vez por sala; depois só edita o embed com a lista de participantes)
  -> Membro clica no botão e abre https://app/r/<roomId>
  -> Frontend inicia login se não houver sessão
  -> Frontend chama POST /api/rooms/:id/join
  -> Backend valida presença na call (voice state) e papel
  -> Backend responde com token LiveKit + permissões
  -> Frontend conecta ao LiveKit e publica/assiste mídia
```

## Fluxo 2: login com Discord

```
Frontend -> GET /api/auth/discord           (redireciona ao Discord)
Discord  -> GET /api/auth/discord/callback?code=...&state=...
Backend  troca code por token, busca /users/@me e membro da guilda
Backend  cria sessão (cookie httpOnly) e redireciona ao frontend
Frontend -> GET /api/auth/me                (dados do usuário e papel)
```

Veja [backend/autenticacao.md](backend/autenticacao.md).

## Fluxo 3: reunião mensal

```
Admin executa /reuniao agendar titulo:"Reunião de novembro" data:2026-12-05 hora:20:00
  -> Bot valida permissão do admin
  -> Backend cria Room (type=MEETING, status=SCHEDULED, startsAt)
  -> Bot publica aviso no canal de avisos com embed e botão
  -> Scheduler envia lembretes (ex.: 24h, 1h, 5min antes)
  -> No horário, a sala passa a OPEN e membros podem entrar
  -> Admin/Mod moderam; ao fim, /reuniao encerrar ou botão no site
```

Veja [backend/reunioes.md](backend/reunioes.md).

## Fluxo 4: quem sai da call perde acesso

```
Membro sai do canal de voz (live)
  -> voiceStateUpdate
  -> Backend marca o participante como "fora da call" e inicia grace period (30 s)
  -> Se não voltar: remove do LiveKit (removeParticipant) e emite room:kicked via Socket.IO
```

Em reuniões o acesso não depende de estar em canal de voz, e sim de ter o cargo permitido.

## Decisões de arquitetura (ADRs resumidos)

| # | Decisão | Motivo |
|---|---|---|
| ADR-1 | Separar frontend e backend | Backend fica na VPS, frontend em outro container (nginx), e pode ser trocado |
| ADR-2 | LiveKit como SFU | Escala melhor que mesh P2P para salas com vários espectadores, SDKs prontos, moderação via API |
| ADR-3 | Backend emite tokens LiveKit | Autorização centralizada; o LiveKit nunca confia no cliente |
| ADR-4 | Sessão por cookie httpOnly | Evita expor token em JS; exige domínios irmãos (veja abaixo) |
| ADR-5 | Bot e API no mesmo repositório | Compartilham regras de permissão e cache de voz |
| ADR-6 | Socket.IO só para controle e estado | Mídia vai direto no LiveKit |
| ADR-7 | Presença validada no backend | Nunca confiar em dado enviado pelo cliente |
| ADR-8 | Contrato documentado | Permite trocar o frontend sem retrabalho |

### Domínios e cookies

Use subdomínios do mesmo site para o cookie funcionar sem fricção:

- `app.exemplo.com` -> frontend (nginx na VPS)
- `api.exemplo.com` -> backend (VPS)
- `live.exemplo.com` -> LiveKit (WSS)
- `turn.exemplo.com` -> Coturn

Cookie com `Domain=.exemplo.com`, `SameSite=Lax`, `Secure`, `HttpOnly`. CORS libera só a origem do frontend com `credentials: true`.

## Estrutura do repositório

```
screem/
  apps/
    api/        backend (Express, Socket.IO, bot, LiveKit)
    web/        frontend (React, Vite, Tailwind)
  packages/
    shared/     tipos e schemas compartilhados (zod)
  infra/
    docker-compose.yml
    livekit/ coturn/ nginx/
  docs/
```
