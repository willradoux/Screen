# Modelo de dados (MongoDB)

Banco: `screem`. Todos os documentos têm `createdAt` e `updatedAt` (timestamps do Mongoose). IDs do Discord são sempre `string`.

## Coleções

### `users`
| Campo | Tipo | Notas |
|---|---|---|
| `_id` | string | ID Discord do usuário |
| `username` | string | |
| `globalName` | string \| null | |
| `avatarHash` | string \| null | URL montada na API |
| `blocked` | boolean | Bloqueio na plataforma |
| `lastLoginAt` | Date | |

Índice: `_id` (padrão).

### `sessions`
| Campo | Tipo | Notas |
|---|---|---|
| `_id` | string | SHA-256 do id do cookie |
| `userId` | string | |
| `discordAccessToken` | string | criptografado (AES-256-GCM) |
| `discordRefreshToken` | string | criptografado |
| `discordExpiresAt` | Date | |
| `ip`, `userAgent` | string | para auditoria |
| `expiresAt` | Date | **TTL index** |
| `absoluteExpiresAt` | Date | |

Índices: `{ userId: 1 }`, TTL em `expiresAt` (`expireAfterSeconds: 0`).

### `rooms`
| Campo | Tipo | Notas |
|---|---|---|
| `_id` | string | 22 chars base64url |
| `guildId` | string | |
| `type` | `LIVE` \| `MEETING` | |
| `status` | `SCHEDULED` \| `OPEN` \| `ENDED` \| `CANCELED` | |
| `title` | string | |
| `description` | string \| null | |
| `voiceChannelId` | string \| null | LIVE |
| `announceMessageId` | string \| null | mensagem do embed |
| `announceChannelId` | string \| null | |
| `startsAt` | Date \| null | MEETING |
| `openedAt`, `endedAt` | Date \| null | |
| `createdBy` | string | user id ou `system` |
| `maxParticipants` | number | |
| `allowedRoleIds` | string[] | MEETING |
| `lectureMode` | boolean | |
| `speakerIds` | string[] | palestrantes |
| `reminders` | `{ minutesBefore: number, sentAt: Date \| null }[]` | |
| `livekitRoomName` | string | igual ao `_id` |
| `endReason` | string \| null | |

Índices:
- `{ guildId: 1, status: 1, type: 1 }`
- `{ voiceChannelId: 1 }` **único parcial** onde `status = 'OPEN'` (garante uma sala aberta por canal)
- `{ startsAt: 1 }` parcial onde `status = 'SCHEDULED'` (scheduler)

Máquina de estados:
```
SCHEDULED -> OPEN -> ENDED
SCHEDULED -> CANCELED
LIVE nasce direto em OPEN
```

### `participations`
Uma linha por entrada de usuário em sala (histórico e relatório).
| Campo | Tipo | Notas |
|---|---|---|
| `_id` | ObjectId | |
| `roomId` | string | |
| `userId` | string | |
| `roleAtJoin` | Role | |
| `joinedAt` | Date | |
| `leftAt` | Date \| null | |
| `leaveReason` | string \| null | `LEFT`, `LEFT_VOICE`, `KICKED`, `BANNED`, `DISCONNECTED`, `ROOM_ENDED` |
| `mutedByModeration` | boolean | |

Índices: `{ roomId: 1, userId: 1 }`, `{ roomId: 1, leftAt: 1 }`.

### `room_bans`
| Campo | Tipo |
|---|---|
| `roomId`, `userId` | string |
| `bannedBy` | string |
| `reason` | string \| null |
| `expiresAt` | Date \| null (`null` = até o fim da sala) |

Índices: `{ roomId: 1, userId: 1 }` único; TTL em `expiresAt`.

### `guild_settings`
Um documento por guilda.
| Campo | Tipo | Padrão |
|---|---|---|
| `_id` | string | guildId |
| `liveCategoryId` | string \| null | null |
| `liveTextChannelId` | string \| null | canal dos embeds de live |
| `announceChannelId` | string \| null | canal de avisos |
| `adminRoleIds` | string[] | [] |
| `modRoleIds` | string[] | [] |
| `meetingAllowedRoleIds` | string[] | [] |
| `maxParticipantsLive` | number | 25 |
| `graceSeconds` | number | 30 |
| `updatedBy` | string | |

### `audit_logs`
Somente inserção.
| Campo | Tipo | Notas |
|---|---|---|
| `at` | Date | |
| `actorId` | string | |
| `targetId` | string \| null | |
| `roomId` | string \| null | |
| `action` | enum | ver abaixo |
| `reason` | string \| null | |
| `meta` | object | dados extras |

Índices: `{ at: -1 }`, `{ actorId: 1, at: -1 }`, `{ roomId: 1, at: -1 }`.

Ações: `PARTICIPANT_MUTED`, `PARTICIPANT_UNMUTED`, `PARTICIPANT_KICKED`, `PARTICIPANT_BANNED`, `BAN_REMOVED`, `SPEAKER_PROMOTED`, `SPEAKER_DEMOTED`, `ROOM_ENDED`, `ROOM_UPDATED`, `MEETING_CREATED`, `MEETING_UPDATED`, `MEETING_CANCELED`, `MEETING_OPENED`, `SETTINGS_UPDATED`, `SESSION_REVOKED`, `USER_BLOCKED`.

## Retenção

| Coleção | Retenção |
|---|---|
| `sessions` | TTL automático |
| `room_bans` | TTL automático |
| `participations` | 12 meses |
| `audit_logs` | 24 meses |
| `rooms` | indefinida (leve) |

## Migrações

Sem migração automática no MVP. Mudanças de schema ficam em `apps/api/src/db/migrations/NNN-descricao.ts` e rodam via `npm run migrate -w apps/api`. Cada migração é idempotente.

## Backup

`mongodump` diário em cron na VPS, retenção de 7 diários e 4 semanais. Veja [../infra/README.md](../infra/README.md).
