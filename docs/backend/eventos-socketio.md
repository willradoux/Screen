# Eventos Socket.IO

> **Estado da implementação (Fase 6):** conexão autenticada, `room:subscribe`, `room:unsubscribe` e os eventos `participant:joined`, `participant:left`, `participant:updated`, `room:updated`, `room:ended`, `moderation:action`, `voice:warning`, `voice:restored`, `settings:updated` e `session:revoked`. Chat (`chat:send`, `chat:message`, `chat:delete`) e enquete (`poll:*`) implementados em `realtime/chat.ts`. Fica para depois: `presence:*`.

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
`{ roomId, text }` (1 a 500 caracteres, aparado). Precisa acompanhar a sala (`room:subscribe`) e estar conectado nela. **Uma mensagem a cada 3 s por pessoa** (todas as abas). Quem foi silenciado pela moderação recebe `MUTED`. Mensagens **não** são persistidas: o servidor só repassa (`chat:message`); o histórico fica no navegador de cada um e some quando a sala fecha.

### `chat:delete`
`{ roomId, id }`. Só MOD+. Avisa todos com `chat:deleted` para tirar a mensagem da tela.

### `poll:propose`
`{ roomId, question, options }` (pergunta até 200 caracteres; 2 a 5 opções de até 80). Membro: vira sugestão (`poll:pending` só para a moderação da sala; uma sugestão a cada 30 s; no máximo 10 esperando). MOD+: a enquete já abre (`poll:state`).

### `poll:approve` / `poll:reject`
`{ roomId, pollId }`. Só MOD+. Aceitar põe a enquete no topo para todos (`poll:state`); a lista de sugestões é reenviada à moderação.

### `poll:vote`
`{ roomId, pollId, option }`. Um voto por pessoa (`ALREADY_VOTED` na segunda). O placar sai agrupado, no máximo a cada 0,5 s.

### `poll:close` / `poll:clear`
`{ roomId, pollId }`. Só MOD+. `close` encerra e mantém o resultado no topo; `clear` tira do topo.

> A enquete ativa e as sugestões ficam **só na memória** enquanto a sala está aberta (somem em `room:ended`). A resposta de `room:subscribe` traz `poll` (a ativa, ou `null`) e, para MOD+, `pendingPolls`.

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
{ "roomId": "kF3x...", "id": "uuid", "userId": "1234", "displayName": "Fulano", "avatarUrl": null, "role": "MEMBER", "text": "olá", "at": "2026-11-08T20:00:00.000Z" }
```

### `chat:deleted`
`{ roomId, id }`: a moderação apagou a mensagem.

### `poll:state`
`{ roomId, poll }`: a enquete do topo (`{ id, question, options: [{ text, votes }], total, status: 'open' | 'closed', proposedBy }`) ou `null`.

### `poll:pending`
`{ roomId, polls }`: sugestões esperando a moderação (só MOD+ recebe).

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
