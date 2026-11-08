# Testes

## Ferramentas

| Tipo | Ferramenta |
|---|---|
| Unitário e integração | Vitest |
| HTTP | Supertest |
| Banco | `mongodb-memory-server` (ou container) |
| Mocks de Discord/LiveKit | Interfaces finas + fakes em `test/fixtures` |
| Socket.IO | `socket.io-client` contra servidor em porta efêmera |
| E2E (Fase 9) | Playwright + Docker Compose de teste |
| Carga (Fase 9) | `livekit-cli load-test` |

## Pirâmide

1. **Unitários** (maioria): permissões, resolução de papel, máquina de estados da sala, parser de data/hora, scheduler (com relógio falso), builders de embed.
2. **Integração**: rotas REST com Mongo em memória e Discord/LiveKit falsos.
3. **Contrato**: o `openapi.json` gerado é comparado com o commitado; divergência quebra o CI.
4. **E2E**: poucos cenários críticos.

## Cenários obrigatórios

### Autenticação
- Login ok cria sessão e cookie com atributos corretos.
- `state` inválido -> `INVALID_STATE`.
- Usuário fora da guilda -> `NOT_IN_GUILD`.
- `redirect` externo (`//evil.com`, `https://evil.com`) é descartado.
- Logout invalida a sessão e derruba sockets.

### Acesso à sala
- Live: fora do canal -> `NOT_IN_VOICE`; dentro -> token.
- Live: MOD/ADMIN entra sem estar na call.
- Reunião agendada -> `ROOM_NOT_OPEN` com `startsAt`.
- Reunião com cargo restrito -> `ROLE_NOT_ALLOWED`.
- Sala lotada -> `ROOM_FULL`; banido -> `BANNED_FROM_ROOM`.
- Token LiveKit tem `identity` igual ao ID Discord e grants corretos por papel.

### Permissões e moderação
- Matriz completa de [permissoes.md](permissoes.md) (teste parametrizado papel x ação).
- MOD não modera MOD/ADMIN; ADMIN não modera ADMIN; ninguém modera a si.
- Mute remove `canPublish`; `unmute` restaura.
- Toda ação gera `audit_logs`.

### Bot
- Entrada no canal cria uma sala e **um** embed; segunda pessoa só atualiza.
- Reinício do bot não duplica embed (usa `announceMessageId`).
- Saída da call dispara `voice:warning` e remoção após o grace period.
- Canal vazio encerra a live após `EMPTY_LIVE_END_SECONDS`.

### Reuniões
- Agendar no passado falha.
- Scheduler abre no horário e envia lembretes uma única vez (rodar duas vezes seguidas).
- Reagendar zera lembretes futuros.
- Relatório soma minutos corretamente.

### Segurança
- Webhook do LiveKit sem assinatura válida -> 401.
- Rate limit retorna 429 com `Retry-After`.
- Corpo com `$where` é rejeitado.

## Relógio falso

O scheduler recebe um `clock` injetável:

```ts
const clock = new FakeClock('2026-12-05T22:55:00Z');
const s = createScheduler({ clock, rooms, discord });
await s.tick();            // envia lembrete de 5 min
clock.advance('00:05:00');
await s.tick();            // abre a reunião
```

## Organização

```
apps/api/test/
  unit/permissions.test.ts
  unit/room-state.test.ts
  integration/auth.test.ts
  integration/rooms.test.ts
  integration/meetings.test.ts
  integration/moderation.test.ts
  integration/realtime.test.ts
  fixtures/fake-discord.ts
  fixtures/fake-livekit.ts
```

## Cobertura

Meta: 80% de linhas no backend, **100% da matriz de permissões**. Cobertura é um piso, não o objetivo.

## CI

`lint -> typecheck -> test -> build -> verificação do openapi -> npm audit (alto/crítico)`.
