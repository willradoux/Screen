# Erros e códigos

## Formato

Toda resposta de erro da REST usa o mesmo corpo:

```json
{
  "error": {
    "code": "NOT_IN_VOICE",
    "message": "Você precisa estar no canal de voz para entrar nesta sala.",
    "details": { "voiceChannelName": "Live 1" },
    "requestId": "9f1c2a7e"
  }
}
```

- `code`: estável, em `SCREAMING_SNAKE_CASE`. **O frontend deve decidir pelo `code`**, nunca pelo `message`.
- `message`: texto em português, seguro para exibir ao usuário.
- `details`: opcional, depende do erro.
- `requestId`: também no cabeçalho `X-Request-Id`; use ao reportar problemas.

Nos acks do Socket.IO: `{ ok: false, error: { code, message } }`.

## Mapeamento de status HTTP

| Status | Quando |
|---|---|
| 400 | Entrada inválida |
| 401 | Sem sessão válida |
| 403 | Autenticado, sem permissão ou sem acesso |
| 404 | Recurso inexistente |
| 409 | Conflito de estado (sala fechada, cheia, já encerrada) |
| 413 | Corpo grande demais |
| 429 | Rate limit |
| 502 | Falha em serviço externo (Discord, LiveKit) |
| 503 | Dependência indisponível |
| 500 | Erro inesperado (sem detalhes ao cliente) |

## Catálogo de códigos

### Genéricos
| Código | HTTP | Descrição |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Campos inválidos; `details.fields` lista os erros |
| `INVALID_STATE` | 400 | `state` do OAuth inválido |
| `INVALID_JSON` | 400 | Corpo não é JSON válido |
| `PAYLOAD_TOO_LARGE` | 413 | Corpo acima de 100 KB |
| `UNAUTHENTICATED` | 401 | Sem sessão |
| `FORBIDDEN` | 403 | Sem capacidade para a ação |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `ROUTE_NOT_FOUND` | 404 | A rota não existe na API |
| `RATE_LIMITED` | 429 | Muitas requisições |
| `INTERNAL_ERROR` | 500 | Erro inesperado |
| `SERVICE_UNAVAILABLE` | 503 | Dependência fora do ar |

### Autenticação
(No callback do login esses códigos chegam em `?error=` na URL do frontend; veja [autenticacao.md](autenticacao.md).)

| Código | HTTP | Descrição |
|---|---|---|
| `NOT_IN_GUILD` | 403 | Usuário não está no servidor Acelera DEV |
| `ACCOUNT_BLOCKED` | 403 | Conta bloqueada na plataforma |
| `ACCESS_DENIED` | - | O usuário recusou a autorização (só no `?error=` do login) |
| `DISCORD_OAUTH_FAILED` | - | O Discord recusou o `code` (só no `?error=` do login) |

### Salas
| Código | HTTP | Descrição |
|---|---|---|
| `ROOM_NOT_FOUND` | 404 | |
| `NOT_IN_VOICE` | 403 | Não está no canal de voz da live |
| `ROLE_NOT_ALLOWED` | 403 | Cargo sem acesso à reunião |
| `BANNED_FROM_ROOM` | 403 | Banido desta sala; `details.expiresAt` |
| `ROOM_NOT_OPEN` | 409 | Sala agendada, encerrada ou cancelada; `details.startsAt` |
| `ROOM_FULL` | 409 | Lotada |
| `ROOM_ALREADY_ENDED` | 409 | |

### Tempo real (Socket.IO)
Erros do handshake chegam em `connect_error.message`; erros de comandos, no ack `{ ok: false, error: { code } }`.
| Código | Onde | Descrição |
|---|---|---|
| `UNAUTHENTICATED` | handshake | Sem cookie de sessão válido |
| `NOT_IN_GUILD` / `ACCOUNT_BLOCKED` | handshake | Mesmos significados da REST |
| `TOO_MANY_CONNECTIONS` | handshake | Mais de 3 sockets do mesmo usuário |
| `VALIDATION_ERROR` | ack | Payload inválido |
| `ROOM_NOT_FOUND` | ack | Sala inexistente |
| `FORBIDDEN` | ack | Você não tem acesso a esta sala |

### Moderação
| Código | HTTP | Descrição |
|---|---|---|
| `HIERARCHY_VIOLATION` | 403 | Alvo tem papel igual ou superior |
| `CANNOT_TARGET_SELF` | 400 | |
| `PARTICIPANT_NOT_IN_ROOM` | 404 | Alvo não está conectado |

### Reuniões e configuração
| Código | HTTP | Descrição |
|---|---|---|
| `STARTS_AT_IN_PAST` | 400 | |
| `MEETING_NOT_EDITABLE` | 409 | Só `SCHEDULED` pode ser editada |
| `ANNOUNCE_CHANNEL_NOT_SET` | 409 | Configure o canal de avisos |
| `INVALID_DISCORD_REFERENCE` | 400 | Canal/cargo informado não existe na guilda |

### Integrações
| Código | HTTP | Descrição |
|---|---|---|
| `LIVEKIT_UNAVAILABLE` | 502 | Falha no servidor de mídia |
| `DISCORD_UNAVAILABLE` | 502 | Falha na API do Discord |

## Como implementar

```ts
// shared/errors.ts
export class AppError extends Error {
  constructor(public code: string, public status: number, message: string, public details?: unknown) { super(message); }
}
export const notInVoice = (name: string) =>
  new AppError('NOT_IN_VOICE', 403, 'Você precisa estar no canal de voz para entrar nesta sala.', { voiceChannelName: name });
```

Um único middleware final converte `AppError` na resposta; erros desconhecidos viram `INTERNAL_ERROR` e são logados com stack (nunca enviados ao cliente).

## Regra de manutenção

Novo código de erro = nova linha nesta tabela + OpenAPI + teste.
