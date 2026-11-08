# Eventos Socket.IO

> **Estado da implementação (Fase 5):** conexão autenticada, `room:subscribe`, `room:unsubscribe`, `participant:joined`, `participant:left`, `room:ended`, `voice:warning`, `voice:restored` e `session:revoked`. Ficam para as próximas fases: `chat:send`/`chat:message`, `presence:*`, `moderation:action`, `participant:updated`, `room:updated` e `settings:updated`.

O Socket.IO leva **estado e notificações de controle**. A mídia vai direto pelo LiveKit.

## Conexão

```ts
import { io } from 'socket.io-client';
const socket = io(API_ORIGIN, {
  path: '/socket.io',
  withCredentials: true,        // envia o cookie de sessão
  transports: ['websocket'],
});
```

- Autenticação no handshake pelo cookie `screem_sid`. Falha: `connect_error` com `message = "UNAUTHENTICATED"`.
- Um socket pode estar em várias salas, mas o frontend normalmente usa uma.
- Namespace padrão (`/`).

## Convenção

- Nomes: `dominio:acao` em minúsculas (`room:joined`).
- Cliente -> servidor: **comandos** com *acknowledgement* (callback) que devolve `{ ok: true, data }` ou `{ ok: false, error: { code, message } }`.
- Servidor -> cliente: **eventos** sem resposta.
- Todos os payloads são validados com zod no servidor.

## Cliente -> servidor

### `room:subscribe`
Passa a receber eventos de uma sala. Exige que o usuário tenha feito `join` pela REST (tem participação ativa) **ou** seja MOD+.
```ts
socket.emit('room:subscribe', { roomId }, (res) => { /* res.ok */ });
```
Resposta `data`: snapshot `{ room, participants[], bans[] (MOD+) }`.

### `room:unsubscribe`
`{ roomId }`.

### `chat:send`
`{ roomId, text }` (1 a 500 caracteres). Limite: 5 mensagens / 5 s por usuário. Mensagens **não** são persistidas no MVP.

### `presence:ping`
`{ roomId }` a cada 15 s. Mantém a participação viva; sem ping por 45 s o servidor considera desconectado.

### `presence:state`
`{ roomId, state: { cameraOn, micOn, screenOn } }`. Apenas informativo para a UI; a verdade é do LiveKit.

## Servidor -> cliente

### `room:updated`
Metadados da sala mudaram (título, modo palestra, status).
```json
{ "roomId": "kF3x...", "changes": { "lectureMode": true } }
```

### `room:ended`
```json
{ "roomId": "kF3x...", "reason": "ENDED_BY_MOD" }
```
`reason`: `ENDED_BY_MOD | ENDED_BY_ADMIN | VOICE_EMPTY | MEETING_FINISHED | CANCELED`.
O cliente deve desconectar do LiveKit.

### `participant:joined`
```json
{ "roomId": "kF3x...", "participant": { "userId": "1234", "displayName": "Fulano", "avatarUrl": null, "role": "MEMBER", "isSpeaker": false } }
```

### `participant:left`
```json
{ "roomId": "kF3x...", "userId": "1234", "reason": "LEFT" }
```
`reason`: `LEFT | LEFT_VOICE | KICKED | BANNED | DISCONNECTED`.

### `participant:updated`
Mudança de papel na sala, palestrante ou silenciamento por moderação.
```json
{ "roomId": "kF3x...", "userId": "1234", "isSpeaker": true, "mutedByModeration": false }
```

### `moderation:action`
Enviado ao **alvo** da ação.
```json
{ "roomId": "kF3x...", "action": "MUTED", "by": "5678", "reason": "ruído", "sources": ["microphone"] }
```
`action`: `MUTED | UNMUTED | KICKED | BANNED`. Em `KICKED/BANNED` o cliente deve sair da sala e mostrar a mensagem.

### `voice:warning`
Aviso de que o usuário saiu do canal de voz (live) e será removido em `graceSeconds`.
```json
{ "roomId": "kF3x...", "secondsLeft": 30 }
```
Se voltar ao canal, chega `voice:restored`.

### `voice:restored`
`{ "roomId": "kF3x..." }`.

### `chat:message`
```json
{ "roomId": "kF3x...", "id": "m_01", "userId": "1234", "displayName": "Fulano", "text": "olá", "at": "2026-11-08T20:00:00.000Z" }
```

### `session:revoked`
Sessão invalidada (logout em outro lugar, conta bloqueada). O servidor desconecta o socket em seguida.

### `settings:updated`
Só para ADMIN conectados. `{ "keys": ["announceChannelId"] }`.

## Salas internas (rooms do Socket.IO)

| Nome | Quem entra |
|---|---|
| `room:<roomId>` | Quem fez `room:subscribe` |
| `user:<userId>` | Automático ao conectar (avisos pessoais) |
| `admins` | Automático para ADMIN |

## Reconexão

1. O Socket.IO reconecta sozinho.
2. No evento `connect` o cliente deve **reemitir** `room:subscribe`.
3. A resposta traz o snapshot atual; descarte o estado local anterior.
4. A conexão LiveKit é independente e tem reconexão própria.

## Exemplo

```ts
socket.on('connect', () => socket.emit('room:subscribe', { roomId }, render));
socket.on('participant:joined', (p) => addParticipant(p.participant));
socket.on('moderation:action', (m) => { if (m.action === 'KICKED') leaveRoom(m.reason); });
socket.on('room:ended', () => leaveRoom('Sala encerrada'));
```

## Limites

| Item | Valor |
|---|---|
| Tamanho máximo de payload | 16 KB |
| Conexões por usuário | 3 simultâneas |
| `chat:send` | 5 msgs / 5 s |
| Ping de presença | 15 s (timeout 45 s) |
