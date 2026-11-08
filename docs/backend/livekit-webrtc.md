# LiveKit e WebRTC

LiveKit é o **SFU**: recebe a mídia de quem publica e repassa a quem assiste. O backend nunca toca na mídia; só emite tokens, modera por API e escuta webhooks.

## Papéis de cada peça

| Peça | Faz |
|---|---|
| Frontend (SDK `livekit-client`) | Captura câmera, tela, mic; publica e assiste |
| Backend | Autoriza, emite token, modera, ouve webhooks |
| LiveKit server | Roteia a mídia |
| Coturn | Ajuda a conectar atrás de NAT/firewall |

## Nome da sala e identidade

- `room name` do LiveKit = `roomId` do Screem.
- `identity` do participante = ID Discord do usuário (único, estável).
- `name` = nome de exibição na guilda.
- `metadata` (JSON): `{ "role": "MOD", "avatarUrl": "..." }`.

Se o mesmo usuário conectar duas vezes, o LiveKit derruba a conexão antiga (comportamento padrão por `identity`). Isso evita duplicados.

## Emissão do token

`livekit.tokens.ts`, usando `livekit-server-sdk`:

```ts
const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
  identity: user.id,
  name: user.displayName,
  ttl: '10m',
  metadata: JSON.stringify({ role, avatarUrl }),
});
at.addGrant({
  room: roomId,
  roomJoin: true,
  canSubscribe: true,
  canPublish,
  canPublishSources,       // [TrackSource.MICROPHONE, CAMERA, SCREEN_SHARE, SCREEN_SHARE_AUDIO]
  canPublishData: false,
  roomAdmin: role === 'ADMIN',
});
return await at.toJwt();
```

- TTL curto (10 min): serve só para conectar. O SDK mantém a sessão depois.
- `canPublishData: false`: chat vai pelo Socket.IO, não pelo data channel.
- O token **nunca** é logado.

## Moderação (lado servidor)

Usa `RoomServiceClient`:

| Ação | Chamada |
|---|---|
| Mutar faixa | `mutePublishedTrack(room, identity, trackSid, true)` para cada faixa da fonte |
| Impedir publicar | `updateParticipant(room, identity, undefined, { canPublish: false, ... })` |
| Liberar | `updateParticipant(..., { canPublish: true, canPublishSources })` |
| Expulsar | `removeParticipant(room, identity)` |
| Encerrar sala | `deleteRoom(room)` |
| Modo palestra | `updateParticipant` em todos os não palestrantes |
| Listar | `listParticipants(room)` |

Um participante **não** consegue desmutar pelo cliente se `canPublish` estiver falso. Mute simples (só `mutePublishedTrack`) permite ao usuário desmutar; por isso o `mute` do Screem também retira a permissão até `unmute`.

## Webhooks

Configurados no `livekit.yaml`:

```yaml
webhook:
  api_key: <LIVEKIT_API_KEY>
  urls:
    - https://api.exemplo.com/api/v1/livekit/webhook
```

O backend valida a assinatura com `WebhookReceiver`. Eventos:

| Evento | Ação no backend |
|---|---|
| `participant_joined` | Cria/atualiza `participations`; emite `participant:joined` |
| `participant_left` | Fecha `participations`; emite `participant:left` |
| `track_published` | Registra fonte; atualiza `presence` |
| `room_finished` | Fecha todas as participações pendentes |

O webhook é **informativo** e idempotente: a decisão de acesso é sempre no `join`.

## Qualidade e capacidade

Configuração sugerida no frontend (qualquer frontend deve seguir):

| Fonte | Resolução / taxa | Observação |
|---|---|---|
| Câmera | 720p, 30 fps | `simulcast: true` |
| Tela | até 1080p, 15 a 30 fps | `contentHint: 'detail'`; priorize resolução sobre fps |
| Áudio | Opus, DTX, `echoCancellation: true` | `red: true` |

- `adaptiveStream` e `dynacast` ligados: o servidor só envia o que o espectador vê.
- Limite do piloto: 25 participantes, 5 publicando vídeo. Medir na Fase 9.

## Rede, portas e TURN

Portas expostas na VPS:

| Porta | Protocolo | Uso |
|---|---|---|
| 443 | TCP | HTTPS, WSS (via proxy) e TURN/TLS |
| 7880 | TCP | LiveKit HTTP/WS (atrás do proxy) |
| 7881 | TCP | WebRTC sobre TCP (fallback) |
| 7882 | UDP | Mídia WebRTC (porta única, `rtc.udp_port`) |
| 3478 | UDP/TCP | STUN/TURN (Coturn) |
| 49152-49252 | UDP | Relay do Coturn (faixa restrita) |

TURN/TLS (5349 ou 443) é opcional e não vem ligado por padrão; exige certificado para `turn.exemplo.com`.

`livekit.yaml` (resumo):

```yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882          # porta única: evita mapear 10 mil portas no Docker
  use_external_ip: true
  turn_servers:           # Coturn externo
    - { host: turn.exemplo.com, port: 3478, protocol: udp, username: livekit, credential: <TURN_PASSWORD> }
keys:
  <API_KEY>: <API_SECRET>
```

O frontend recebe os servidores ICE pelo próprio LiveKit. Para usar o Coturn, o LiveKit é configurado com `rtc.turn_servers` apontando para `turn.exemplo.com` com a credencial estática do usuário `livekit` (`--lt-cred-mech`). Credenciais efêmeras (`use-auth-secret`) ficam como melhoria futura. A configuração real está inline em `infra/docker-compose.yml`. Veja [../infra/README.md](../infra/README.md).

## Diagnóstico

| Sintoma | Causa provável |
|---|---|
| Conecta mas sem vídeo | UDP bloqueado; testar TURN/TCP 443 |
| `join` ok e falha ao conectar no WSS | URL `LIVEKIT_PUBLIC_URL` errada ou TLS inválido |
| Tela sem áudio | Navegador/aba: áudio de tela só no Chrome/Edge com opção marcada |
| Vídeo travando | Banda da VPS ou da origem; reduzir resolução, checar simulcast |
| Participantes duplicados | Identity diferente por sessão; deve ser o ID Discord |

## Teste rápido

```bash
# gerar token de teste (dev)
npx livekit-cli token create --api-key $KEY --api-secret $SECRET \
  --join --room teste --identity dev --valid-for 1h
```
