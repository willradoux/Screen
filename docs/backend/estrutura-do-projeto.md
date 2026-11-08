# Estrutura do projeto (backend)

```
apps/api/
  src/
    main.ts                 ponto de entrada: sobe HTTP, Socket.IO, bot e scheduler
    app.ts                  cria o app Express (middlewares e rotas)
    config/
      env.ts                lê e valida variáveis de ambiente (zod)
      constants.ts
    shared/
      logger.ts             pino
      errors.ts             AppError e subclasses
      http.ts               helpers de resposta e paginação
      validate.ts           middleware de validação (zod) + getValidated
      error-handler.ts      converte erros no formato padrão
      time.ts
    db/
      connection.ts
      models/               Mongoose: User, Room, Participation, GuildSettings, AuditLog
    modules/
      auth/
        auth.routes.ts
        auth.service.ts
        session.ts
        discord-oauth.ts
      permissions/
        roles.ts            resolve MEMBER | MOD | ADMIN
        capabilities.ts     matriz papel -> ações
        guards.ts           middlewares requireRole, requireCapability
      rooms/
        rooms.routes.ts
        rooms.service.ts
        rooms.state.ts      máquina de estados
        access.ts           regra de acesso (presença na call, cargo)
      meetings/
        meetings.routes.ts
        meetings.service.ts
        scheduler.ts        lembretes e abertura automática
      moderation/
        moderation.routes.ts
        moderation.service.ts
      settings/
        settings.routes.ts
        settings.service.ts
      livekit/
        livekit.client.ts   RoomServiceClient, AccessToken
        livekit.tokens.ts
        livekit.webhook.ts
      audit/
        audit.service.ts
    discord/
      client.ts             instância do discord.js
      voice-cache.ts        voice states em memória (reconciliado ao iniciar)
      events/               voiceStateUpdate, ready, interactionCreate
      commands/             /config, /reuniao ...
      embeds/               builders de embed e botões
    realtime/
      socket.ts             servidor Socket.IO, auth do handshake
      handlers/             room, moderation, chat
      emitter.ts            API interna para outros módulos emitirem eventos
  test/
    unit/ integration/ fixtures/
  openapi.json
  Dockerfile
```

## Camadas

```
routes (HTTP/Socket/Discord)  ->  service (regras)  ->  db/livekit/discord (infra)
```

- **Routes/handlers**: validam entrada, chamam um service, formatam saída. Sem regra de negócio.
- **Services**: regras de negócio, orquestração, auditoria. Não conhecem Express.
- **Infra**: acesso a Mongo, LiveKit e Discord, atrás de funções simples e mockáveis.

## Fluxo de uma requisição

1. `helmet`, CORS, `rate-limit`, `pino-http` (request id).
2. Sessão: lê cookie, carrega usuário.
3. Validação do corpo/params com zod.
4. Guard de papel/capacidade.
5. Service executa a regra.
6. Resposta padronizada ou erro tratado pelo middleware final.

## Convenções de resposta

Sucesso:

```json
{ "data": { } }
```

Lista paginada:

```json
{ "data": [ ], "page": { "next": "cursor-opaco", "limit": 20 } }
```

Erro: veja [erros.md](erros.md).

## Processo único, estado em memória

O MVP roda em **uma instância**. Em memória ficam apenas:

- cache de voice states (reconstruído ao iniciar via fetch das guildas)
- mapeamento de sockets por sala

Se for preciso escalar para várias instâncias: usar Redis adapter do Socket.IO e mover o cache de voz para Redis. Está listado em [03-roadmap.md](../03-roadmap.md), Fase 10.
