# API REST

Base: `https://api.exemplo.com/api/v1`
Formato: JSON (`Content-Type: application/json`). Autenticação por cookie `screem_sid` (veja [autenticacao.md](autenticacao.md)).
Requisições com cookie precisam de `credentials: 'include'` e origem liberada no CORS.

## Convenções

- Sucesso: `{ "data": ... }`. Erro: veja [erros.md](erros.md).
- IDs de sala: string de 22 caracteres base64url (ex.: `kF3x9QzP2mT7vB1nLw0aYc`).
- IDs do Discord: strings (snowflakes). **Nunca** tratar como número.
- Datas: ISO 8601 em UTC (`2026-12-05T23:00:00.000Z`).
- Paginação por cursor: `?limit=20&cursor=...`.
- Rate limit padrão: 120 req/min por usuário. Cabeçalhos `RateLimit-*`.

## Tipos

```ts
type Role = 'MEMBER' | 'MOD' | 'ADMIN';
type RoomType = 'LIVE' | 'MEETING';
type RoomStatus = 'SCHEDULED' | 'OPEN' | 'ENDED' | 'CANCELED';

interface User {
  id: string;            // Discord user id
  username: string;
  displayName: string;   // apelido na guilda ou nome global
  avatarUrl: string | null;
  role: Role;
}

interface Room {
  id: string;
  type: RoomType;
  status: RoomStatus;
  title: string;
  description: string | null;
  voiceChannelId: string | null;   // só em LIVE
  startsAt: string | null;         // só em MEETING agendada
  openedAt: string | null;
  endedAt: string | null;
  createdBy: string;               // user id ou "system"
  maxParticipants: number;
  lectureMode: boolean;
  participantCount: number;
  url: string;                     // link para o frontend
}
```

---

## Health

### `GET /health`
Sem autenticação. `200 { "data": { "status": "ok", "uptime": 1234 } }`

### `GET /ready`
Checa as dependências (hoje: MongoDB; LiveKit e Discord entram nas Fases 4 e 5). Cada checagem tem timeout de 3 s. `200` se todas respondem, `503` caso contrário. O corpo **não** usa o formato de erro, para o orquestrador ler o detalhe:
```json
{ "data": { "status": "unavailable", "checks": { "mongo": "fail" } } }
```

### `GET /openapi.json` e `GET /docs`
Especificação OpenAPI 3.1 e Swagger UI interativo (`/api/v1/docs`). O arquivo `apps/api/openapi.json` é versionado e um teste falha se ele divergir do código (`npm run openapi -w @screem/api` regenera).

---

## Auth

### `GET /auth/discord`
Inicia login.
Query: `redirect` (opcional, caminho relativo, ex.: `/r/abc`).
Resposta: `302` para o Discord.

### `GET /auth/discord/callback`
Retorno do Discord. Query: `code`, `state`.
Resposta: `302` ao frontend. Em erro: `302 {WEB_URL}/login?error=<CODE>`.

### `GET /auth/me`
Auth: obrigatória.
```json
{ "data": { "id": "123456789012345678", "username": "fulano", "displayName": "Fulano",
            "avatarUrl": "https://cdn.discordapp.com/avatars/...", "role": "MOD" } }
```
Erros: `401 UNAUTHENTICATED`.

### `POST /auth/logout`
Auth: obrigatória. Apaga a sessão e o cookie. `204`.

---

## Salas

### `GET /rooms`
Lista salas visíveis ao usuário.
Query: `status` (`OPEN|SCHEDULED|ENDED`), `type`, `limit`, `cursor`.
```json
{ "data": [ { "id": "kF3x9QzP2mT7vB1nLw0aYc", "type": "LIVE", "status": "OPEN",
              "title": "Live - Sala 1", "participantCount": 4, "url": "https://app.exemplo.com/r/kF3x9QzP2mT7vB1nLw0aYc" } ],
  "page": { "next": null, "limit": 20 } }
```

### `GET /rooms/:id`
Detalhes da sala. Qualquer usuário autenticado pode **ver** os dados públicos; entrar exige `join`.
Erros: `404 ROOM_NOT_FOUND`.

### `GET /rooms/:id/access`
Diz se o usuário **pode entrar agora**, e por quê não. Útil para o frontend decidir a tela.
```json
{ "data": { "canJoin": false, "reason": "NOT_IN_VOICE",
            "voiceChannelName": "Live 1", "hint": "Entre no canal de voz Live 1 no Discord." } }
```
`reason`: `null | NOT_IN_VOICE | ROOM_NOT_OPEN | ROOM_FULL | BANNED_FROM_ROOM | ROLE_NOT_ALLOWED`.

### `POST /rooms/:id/join`
Entra na sala. Valida presença/cargo e devolve o token LiveKit.
Resposta `200`:
```json
{ "data": {
    "livekit": { "url": "wss://live.exemplo.com", "token": "eyJhbGciOi..." },
    "participant": { "identity": "123456789012345678", "name": "Fulano", "role": "MOD" },
    "permissions": { "canPublish": true, "canPublishSources": ["microphone","camera","screen_share"], "canModerate": true },
    "room": { "id": "kF3x9QzP2mT7vB1nLw0aYc", "lectureMode": false }
} }
```
Erros: `403 NOT_IN_VOICE`, `403 ROLE_NOT_ALLOWED`, `403 BANNED_FROM_ROOM`, `409 ROOM_NOT_OPEN`, `409 ROOM_FULL`.
Notas: o token expira em 10 minutos e é só para **conectar**; depois o SDK renova a sessão. Para reconectar, chame `join` de novo.

### `POST /rooms/:id/leave`
Registra saída. `204`.

### `POST /rooms/:id/end`
Capacidade: `room.end` (MOD+). Encerra a sala e desconecta todos. `204`.
Erros: `403 FORBIDDEN`, `409 ROOM_ALREADY_ENDED`.

### `PATCH /rooms/:id`
Capacidade: ADMIN para reunião; MOD+ para `lectureMode` em live.
Body (qualquer campo): `{ "title": "...", "description": "...", "maxParticipants": 30, "lectureMode": true }`.

---

## Moderação

Todas exigem papel superior ao alvo ([permissoes.md](permissoes.md#regras-de-hierarquia)) e geram auditoria. Body opcional `{ "reason": "texto" }`.

### `POST /rooms/:id/participants/:userId/mute`
Body: `{ "sources": ["microphone","camera","screen_share"], "reason": "..." }`
Silencia as fontes indicadas (default: todas) **e** remove permissão de publicar até `unmute`. `204`.

### `POST /rooms/:id/participants/:userId/unmute`
Restaura a permissão de publicar. `204`.

### `POST /rooms/:id/participants/:userId/kick`
Remove da sala. Pode voltar. `204`.

### `POST /rooms/:id/participants/:userId/ban`
Body: `{ "durationMinutes": 60, "reason": "..." }` (padrão 60, máximo 1440; ADMIN pode usar `0` = até o fim da sala). `204`.

### `DELETE /rooms/:id/bans/:userId`
Remove o banimento. `204`.

### `POST /rooms/:id/participants/:userId/promote`
Marca como palestrante (pode publicar em modo palestra). `204`.

### `POST /rooms/:id/participants/:userId/demote`
Remove de palestrante. `204`.

### `GET /rooms/:id/participants`
Lista participantes conectados.
```json
{ "data": [ { "userId": "1234", "displayName": "Fulano", "avatarUrl": null, "role": "MEMBER",
              "joinedAt": "2026-11-08T20:00:00.000Z", "isSpeaker": false, "mutedByModeration": false } ] }
```

---

## Reuniões

Detalhes de comportamento em [reunioes.md](reunioes.md). Todas exigem ADMIN, exceto `GET`.

### `GET /meetings`
Query: `status`, `from`, `to`. Lista reuniões.

### `POST /meetings`
Cria reunião.
```json
{ "title": "Reunião mensal de dezembro",
  "description": "Pauta: novidades, retrospectiva, votação.",
  "startsAt": "2026-12-05T23:00:00.000Z",
  "maxParticipants": 100,
  "allowedRoleIds": [],
  "announce": true,
  "reminders": [1440, 60, 5] }
```
- `startsAt` ausente = reunião **imediata** (abre agora).
- `announce` publica no canal de avisos.
- `reminders` em minutos antes do início.
Resposta `201` com `Room`.
Erros: `400 VALIDATION_ERROR`, `400 STARTS_AT_IN_PAST`, `409 ANNOUNCE_CHANNEL_NOT_SET`.

### `PATCH /meetings/:id`
Edita título, descrição, `startsAt`, `maxParticipants`, `reminders`. Só enquanto `SCHEDULED`. Reagendar reenvia o aviso.

### `POST /meetings/:id/open`
Abre antes do horário. `200`.

### `POST /meetings/:id/cancel`
Cancela e avisa no canal. `204`.

### `GET /meetings/:id/report`
Lista de presença e duração (ADMIN). Disponível após `ENDED`.
```json
{ "data": { "durationMinutes": 62, "peakParticipants": 41,
            "attendees": [ { "userId": "1234", "displayName": "Fulano", "joinedAt": "...", "leftAt": "...", "minutes": 58 } ] } }
```

---

## Configurações da guilda

ADMIN apenas.

### `GET /settings`
```json
{ "data": { "guildId": "9988", "liveCategoryId": "5566", "announceChannelId": "7788",
            "liveTextChannelId": "7799", "adminRoleIds": ["1"], "modRoleIds": ["2"],
            "meetingAllowedRoleIds": [], "maxParticipantsLive": 25, "graceSeconds": 30 } }
```

### `PATCH /settings`
Atualiza qualquer subconjunto dos campos. Valida que canais/cargos existem na guilda. `200`.

---

## Auditoria

### `GET /audit`
ADMIN. Query: `actorId`, `targetId`, `action`, `roomId`, `from`, `to`, `limit`, `cursor`.
```json
{ "data": [ { "id": "...", "at": "2026-11-08T20:10:00.000Z", "actorId": "1", "targetId": "2",
              "roomId": "kF3x...", "action": "PARTICIPANT_MUTED", "reason": "ruído", "meta": { "sources": ["microphone"] } } ] }
```

---

## Webhook do LiveKit

### `POST /livekit/webhook`
Chamado pelo LiveKit. Valida o cabeçalho `Authorization` (JWT assinado com a chave da API do LiveKit). Não é para frontends. Eventos tratados: `participant_joined`, `participant_left`, `track_published`, `room_finished`. Detalhes em [livekit-webrtc.md](livekit-webrtc.md#webhooks).

---

## Exemplo completo (fetch)

```ts
const res = await fetch(`${API}/rooms/${id}/join`, { method: 'POST', credentials: 'include' });
if (!res.ok) {
  const { error } = await res.json();   // error.code, error.message
  throw error;
}
const { data } = await res.json();
await livekitRoom.connect(data.livekit.url, data.livekit.token);
```

## Lista rápida de rotas

| Método | Rota | Auth | Papel |
|---|---|---|---|
| GET | /health, /ready | não | - |
| GET | /auth/discord, /auth/discord/callback | não | - |
| GET | /auth/me | sim | qualquer |
| POST | /auth/logout | sim | qualquer |
| GET | /rooms, /rooms/:id, /rooms/:id/access, /rooms/:id/participants | sim | qualquer |
| POST | /rooms/:id/join, /rooms/:id/leave | sim | qualquer |
| POST | /rooms/:id/end | sim | MOD+ |
| PATCH | /rooms/:id | sim | MOD+ / ADMIN |
| POST | /rooms/:id/participants/:userId/{mute,unmute,kick,ban,promote,demote} | sim | MOD+ |
| DELETE | /rooms/:id/bans/:userId | sim | MOD+ |
| GET | /meetings | sim | qualquer |
| POST/PATCH | /meetings, /meetings/:id | sim | ADMIN |
| POST | /meetings/:id/{open,cancel} | sim | ADMIN |
| GET | /meetings/:id/report | sim | ADMIN |
| GET/PATCH | /settings | sim | ADMIN |
| GET | /audit | sim | ADMIN |
| POST | /livekit/webhook | assinatura | LiveKit |
