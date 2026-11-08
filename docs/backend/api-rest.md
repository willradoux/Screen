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

**Implementado** (Fase 5). Todas exigem login. `:id` é o id da sala (22 caracteres); id malformado ou inexistente responde `404 ROOM_NOT_FOUND`.

### `GET /rooms`
Lista salas, das mais novas para as mais antigas.
Query: `status` (`OPEN|SCHEDULED|ENDED|CANCELED`; padrão: abertas **e** agendadas), `type` (`LIVE|MEETING`), `limit` (1 a 50, padrão 20), `cursor` (o `page.next` da resposta anterior; cursor inválido dá `400 VALIDATION_ERROR`).
```json
{ "data": [ { "id": "kF3x9QzP2mT7vB1nLw0aYc", "type": "LIVE", "status": "OPEN", "title": "Live - Live 1",
              "voiceChannelId": "5000...", "participantCount": 4, "maxParticipants": 25, "lectureMode": false,
              "url": "https://app.exemplo.com/r/kF3x9QzP2mT7vB1nLw0aYc", "...": "..." } ],
  "page": { "next": "MTc5...", "limit": 20 } }
```
`participantCount` é quem está conectado de fato (webhooks do LiveKit).

### `GET /rooms/:id`
Dados públicos da sala. Ver a sala não dá acesso: para entrar use `join`.

### `GET /rooms/:id/access`
Diz se **você pode entrar agora** e por que não. Sem efeitos colaterais: não emite token. Use para escolher a tela.
```json
{ "data": { "canJoin": false, "reason": "NOT_IN_VOICE", "voiceChannelName": "Live 1",
            "hint": "Entre no canal de voz \"Live 1\" no Discord para participar." } }
```
Quando pode: `{ "canJoin": true, "reason": null, "hint": null }`.
`reason`: `ROOM_NOT_OPEN` (traz `status` e `startsAt` para a contagem regressiva), `BANNED_FROM_ROOM` (traz `expiresAt`, `null` = até o fim da sala), `ROLE_NOT_ALLOWED`, `NOT_IN_VOICE` (traz `voiceChannelName`), `ROOM_FULL` (traz `maxParticipants`).

### `POST /rooms/:id/join`
Entra na sala. **Toda a validação é feita aqui, no servidor**, na ordem: sala aberta, não banido, cargo (reuniões), presença no canal de voz (lives) e lotação. Limite: 20 chamadas por minuto por usuário (`429`).
Resposta `200`:
```json
{ "data": {
    "livekit": { "url": "wss://live.exemplo.com", "token": "eyJhbGciOi..." },
    "participant": { "identity": "123456789012345678", "name": "Fulano", "role": "MEMBER" },
    "permissions": { "canPublish": true,
                     "canPublishSources": ["microphone","camera","screen_share","screen_share_audio"],
                     "canModerate": false },
    "room": { "id": "kF3x9QzP2mT7vB1nLw0aYc", "lectureMode": false }
} }
```
Erros: `403 NOT_IN_VOICE` (`details.voiceChannelName`), `403 ROLE_NOT_ALLOWED`, `403 BANNED_FROM_ROOM` (`details.expiresAt`), `409 ROOM_NOT_OPEN` (`details.status`, `details.startsAt`), `409 ROOM_FULL`, `502 LIVEKIT_UNAVAILABLE`.

Notas:
- O token expira em `JOIN_TOKEN_TTL_SECONDS` (padrão 10 min) e serve **para conectar**; depois o SDK mantém a sessão. Para reconectar, chame `join` de novo.
- `MOD` e `ADMIN` entram em qualquer live sem estar na call e passam pela restrição de cargo das reuniões.
- Quem já está dentro pode reconectar mesmo com a sala lotada.
- Modo palestra e silenciamento por moderação aparecem em `permissions.canPublish = false`.
- Mesmo com o token em mãos, quem conectar ao LiveKit **fora da call** (membro comum, live) é derrubado em seguida; veja [livekit-webrtc.md](livekit-webrtc.md#o-que-acontece-depois-do-join).

### `POST /rooms/:id/leave`
Registra a saída e derruba a conexão no LiveKit. `204`, idempotente.

### `POST /rooms/:id/end`
Capacidade `room.end` (MOD+). Encerra a sala: avisa `room:ended`, apaga a sala no LiveKit, fecha as participações e edita o embed no Discord. `204`.
Erros: `403 FORBIDDEN`, `409 ROOM_ALREADY_ENDED`, `409 ROOM_NOT_OPEN` (agendada ou cancelada).

### `PATCH /rooms/:id`
Edita a sala. Corpo (ao menos um campo, sem campos extras):
```json
{ "title": "Novo título", "description": "Pauta", "maxParticipants": 50, "lectureMode": true }
```
- `lectureMode` (modo palestra): **MOD ou ADMIN**. Ao mudar, a permissão de publicar de todos os membros conectados é recalculada na hora (só palestrantes publicam); moderação nunca é afetada.
- `title` (3 a 100), `description` (até 1000; `null` apaga) e `maxParticipants` (2 a 300): **só ADMIN**. O embed no Discord é atualizado.
- Se o pedido mistura campos de papéis diferentes, vale a regra mais restrita e **nada** é aplicado.
- Só salas `OPEN` ou `SCHEDULED` (`409 ROOM_NOT_OPEN` nas demais).
Resposta `200` com a `Room`. Emite `room:updated` e audita (`ROOM_UPDATED`).

## Moderação

**Implementado** (Fase 6). Todas exigem login e `Origin`, papel mínimo **MOD**, e **papel superior ao do alvo** ([permissoes.md](permissoes.md#regras-de-hierarquia)). O alvo precisa estar conectado à sala. Todas geram auditoria. Limite: 60 ações por minuto por usuário.

Corpo opcional, sem campos extras: `{ "reason": "texto até 200 caracteres" }`.

Erros comuns: `400 CANNOT_TARGET_SELF`, `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `403 HIERARCHY_VIOLATION`, `404 ROOM_NOT_FOUND`, `404 PARTICIPANT_NOT_IN_ROOM`, `409 ROOM_NOT_OPEN`, `502 LIVEKIT_UNAVAILABLE`.

O papel do alvo é o **mais alto** entre o de quando entrou e o atual no Discord (quem foi promovido a MOD depois de entrar não pode ser moderado por outro MOD). O dono do servidor conta como ADMIN.

### `POST /rooms/:id/participants/:userId/mute`
Corpo: `{ "sources": ["microphone","camera","screen_share","screen_share_audio"], "reason": "..." }` (`sources` opcional; padrão: todas).
Revoga essas fontes no LiveKit, silencia o que já estava no ar e avisa a pessoa (`moderation:action` com `MUTED`). `screen_share` inclui `screen_share_audio`. Silenciamentos **se acumulam** e **valem mesmo se a pessoa sair e voltar** (o próximo `join` já traz o token sem permissão). `204`.

### `POST /rooms/:id/participants/:userId/unmute`
Limpa o silenciamento e devolve a permissão de publicar, respeitando o modo palestra. `204`.

### `POST /rooms/:id/participants/:userId/kick`
Remove da sala e do LiveKit (`participant:left` com `KICKED`). A pessoa pode voltar; para impedir, use `ban`. `204`.

### `POST /rooms/:id/participants/:userId/ban`
Corpo: `{ "durationMinutes": 60, "reason": "..." }`. Padrão 60, máximo 1440; `0` (até o fim da sala) só para ADMIN (`403` para MOD). O banimento é gravado **antes** de remover a pessoa, então ela não consegue voltar na hora. `204`.

### `DELETE /rooms/:id/bans/:userId`
Remove o banimento. Idempotente. `204`.

### `POST /rooms/:id/participants/:userId/promote`
Marca como palestrante. No modo palestra, liga a permissão de publicar na hora. `204`.

### `POST /rooms/:id/participants/:userId/demote`
Remove de palestrante. No modo palestra, desliga a permissão na hora. `204`.

### `GET /rooms/:id/participants`
Lista os conectados. Visível para moderação e para quem tem acesso à sala (ou já está nela).
```json
{ "data": [ { "userId": "1234", "displayName": "Fulano", "avatarUrl": null, "role": "MEMBER",
              "joinedAt": "2026-11-08T20:00:00.000Z", "isSpeaker": false,
              "mutedByModeration": true, "mutedSources": ["microphone"] } ] }
```

---

## Reuniões

**Implementado** (Fase 7). Comportamento completo em [reunioes.md](reunioes.md). Os comandos `/reuniao` do bot usam o mesmo serviço, então as regras e os erros são os mesmos. `GET` é para qualquer membro; o resto é **ADMIN** (e exige `Origin`).

A reunião é a `Room` mais `allowedRoleIds` (vazio = qualquer membro) e `reminders`: `[{ "minutesBefore": 1440, "sent": false }]`.

### `GET /meetings`
Query: `status` (padrão: abertas **e** agendadas), `from` e `to` (ISO 8601, filtram pelo horário de início), `limit` (1 a 100, padrão 50). Ordenadas da mais próxima para a mais distante. Sem paginação por cursor.

### `GET /meetings/:id`
Uma reunião. `404 ROOM_NOT_FOUND` para ids inexistentes e para salas que são lives.

### `POST /meetings`
```json
{ "title": "Reunião mensal de dezembro",
  "description": "Pauta: novidades, retrospectiva, votação.",
  "startsAt": "2026-12-05T23:00:00.000Z",
  "maxParticipants": 100,
  "allowedRoleIds": [],
  "announce": true,
  "reminders": [1440, 60, 5] }
```
- `title` (3 a 100) é o único obrigatório; campos desconhecidos são recusados.
- `startsAt` ausente ou `null`: abre **agora**. Com `startsAt`: agendada, pelo menos 2 minutos no futuro.
- `announce` (padrão `true`) publica o aviso no canal de avisos.
- `reminders`: até 5 valores em minutos antes do início (1 a 43200), repetidos são ignorados e a lista é ordenada do maior para o menor; `[]` = nenhum; padrão `[1440, 60, 5]`. Os que já passaram são descartados.
- `allowedRoleIds` (até 25, precisam existir no Discord): se omitido, vale o `/config cargo-reuniao`.
Resposta `201`. Erros: `400 VALIDATION_ERROR`, `400 STARTS_AT_IN_PAST`, `400 INVALID_DISCORD_REFERENCE`, `409 ANNOUNCE_CHANNEL_NOT_SET` (nada é criado).

### `PATCH /meetings/:id`
Qualquer subconjunto de `title`, `description`, `startsAt`, `maxParticipants`, `allowedRoleIds`, `reminders` (ao menos um). Só enquanto `SCHEDULED` (`409 MEETING_NOT_EDITABLE`). **Mudar `startsAt` reagenda**: os lembretes voltam a ser pendentes, o aviso é editado e o canal recebe uma mensagem de reagendamento. Registra `MEETING_UPDATED`. `200` com a reunião.

### `POST /meetings/:id/open`
Abre antes do horário. Só `SCHEDULED`. `200` com a reunião. Registra `MEETING_OPENED`.

### `POST /meetings/:id/cancel`
Só `SCHEDULED`: reunião aberta se encerra com `POST /rooms/:id/end`. Edita o aviso, manda uma mensagem silenciosa no canal e registra `MEETING_CANCELED`. `204`.

### `GET /meetings/:id/report`
Lista de presença, duração e pico. Só depois de `ENDED` (`409 REPORT_NOT_AVAILABLE` antes).
```json
{ "data": { "durationMinutes": 62, "peakParticipants": 41,
            "attendees": [ { "userId": "1234", "displayName": "Fulano",
                             "joinedAt": "2026-12-05T23:00:12.000Z",
                             "leftAt": "2026-12-06T00:02:00.000Z", "minutes": 58 } ] } }
```
`minutes` é a soma dos períodos em que a pessoa ficou (quem saiu e voltou aparece uma vez).

---

## Configurações da guilda

**Implementado** (Fase 6). Só **ADMIN**. É a mesma configuração que os comandos `/config` do bot alteram.

### `GET /settings`
```json
{ "data": { "guildId": "9988", "liveCategoryId": "5566", "liveTextChannelId": "7799",
            "announceChannelId": "7788", "adminRoleIds": ["1"], "modRoleIds": ["2"],
            "meetingAllowedRoleIds": [], "maxParticipantsLive": 25, "graceSeconds": 30 } }
```

### `PATCH /settings`
Qualquer subconjunto (ao menos um campo, sem campos extras):

| Campo | Regra |
|---|---|
| `liveCategoryId` | ID de uma **categoria** existente; `null` limpa |
| `liveTextChannelId`, `announceChannelId` | ID de um **canal de texto** existente; `null` limpa |
| `adminRoleIds`, `modRoleIds`, `meetingAllowedRoleIds` | até 25 cargos existentes; a lista é **substituída por inteiro** |
| `maxParticipantsLive` | inteiro de 2 a 100 (vale para as próximas lives) |
| `graceSeconds` | inteiro de 5 a 300 |

Canal ou cargo que não existe no Discord, ou do tipo errado: `400 INVALID_DISCORD_REFERENCE` com `details: { field, id }` e **nada** é gravado. Sucesso: `200` com a configuração nova, auditoria `SETTINGS_UPDATED` (com `from`/`to` de cada campo) e o evento `settings:updated` para os admins conectados. Mudanças de cargos valem para o login em até 60 s.

---

## Auditoria

### `GET /audit`
**Implementado.** Só ADMIN. Registro **somente de inserção** das ações de moderação e administração, do mais novo para o mais antigo.
Query: `actorId`, `targetId`, `roomId`, `action`, `from`, `to` (ISO 8601), `limit` (1 a 100, padrão 50), `cursor`.
```json
{ "data": [ { "id": "6720a1f0c3d4e5f607182930", "at": "2026-11-08T20:10:00.000Z", "actorId": "1", "targetId": "2",
              "roomId": "kF3x9QzP2mT7vB1nLw0aYc", "action": "PARTICIPANT_MUTED", "reason": "ruído",
              "meta": { "sources": ["microphone"] } } ],
  "page": { "next": null, "limit": 50 } }
```
Ações registradas: `PARTICIPANT_MUTED`, `PARTICIPANT_UNMUTED`, `PARTICIPANT_KICKED`, `PARTICIPANT_BANNED`, `BAN_REMOVED`, `SPEAKER_PROMOTED`, `SPEAKER_DEMOTED`, `ROOM_ENDED`, `ROOM_UPDATED`, `MEETING_CREATED`, `MEETING_CANCELED`, `SETTINGS_UPDATED` (pela API **e** pelos comandos do bot; `meta.via` diz de onde veio). Se a gravação da auditoria falhar, a ação já feita não é desfeita e o erro vai para o log.

---

## Webhook do LiveKit

### `POST /livekit/webhook`
**Implementado.** Chamado pelo LiveKit. Valida o cabeçalho `Authorization` (JWT assinado com a chave da API do LiveKit). Não é para frontends. Eventos tratados: `participant_joined`, `participant_left`, `track_published`, `room_finished`. Detalhes em [livekit-webrtc.md](livekit-webrtc.md#webhooks).

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
