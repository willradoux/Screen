# Reuniões e agendamento

Reuniões (`type = MEETING`) substituem o Meet nas reuniões mensais. Só **ADMIN** cria, agenda, edita e cancela. **MOD+** pode encerrar e moderar.

## Ciclo de vida

```
              /reuniao agendar                horário chega / botão "abrir"
 (nada) ───────────────────────> SCHEDULED ──────────────────────────> OPEN
    │                                │                                    │
    │  /reuniao criar                │ cancelar                           │ encerrar
    └────────────────────────────────┼──────────> CANCELED                ▼
          (abre imediatamente)       │                                   ENDED
```

## Criação

Pelo comando `/reuniao criar|agendar` ou `POST /meetings` (mesma regra, mesmo service).

Validações:
- Ator é ADMIN.
- `title` de 3 a 100 caracteres; `description` até 1000.
- `startsAt` no futuro (mínimo 2 minutos) quando informado.
- `announceChannelId` configurado se `announce = true`.
- `maxParticipants` entre 2 e 300 (padrão 100).

Efeitos:
1. Grava `Room` com `status = SCHEDULED` (ou `OPEN` se imediata).
2. Cria a sala no LiveKit apenas quando abrir (lazy).
3. Publica o aviso no canal de avisos com embed + botão.
4. Registra auditoria `MEETING_CREATED`.

## Scheduler

`meetings/scheduler.ts` roda a cada **15 segundos** (e na inicialização):

```
buscar rooms SCHEDULED com startsAt <= agora  -> open()
para cada reminder pendente com (startsAt - minutesBefore) <= agora -> sendReminder()
```

- Persistente: tudo vem do Mongo, então reiniciar o servidor não perde agendamentos.
- Idempotente: `reminders[i].sentAt` é gravado com `findOneAndUpdate` condicional, evitando envio duplo.
- Se o servidor ficou fora do ar e perdeu um lembrete por mais de 10 minutos, o lembrete é descartado (não faz sentido avisar tarde); a abertura da reunião **não** é descartada.

### Lembretes

Padrão: 24 h, 1 h e 5 min antes. O lembrete é uma **nova mensagem curta** no canal de avisos, citando o horário com `<t:UNIX:R>` e o botão. Configurável por reunião.

## Abertura

Ao abrir (`SCHEDULED -> OPEN`):
- `openedAt = agora`.
- Edita o aviso original: "🟢 Reunião aberta agora".
- Emite `room:updated` por Socket.IO.
- Participantes entram por `POST /rooms/:id/join`.

Antes de abrir, `join` retorna `409 ROOM_NOT_OPEN`, e `GET /rooms/:id/access` devolve `reason: "ROOM_NOT_OPEN"` com `startsAt` para o frontend mostrar contagem regressiva.

ADMIN pode entrar antes do horário (sala "pré-abertura") para preparar; nesse caso a sala fica `SCHEDULED` e só o ADMIN consegue entrar. [planejado]

## Acesso

Diferente das lives, **não exige estar em canal de voz**. Regra: membro da guilda e (`allowedRoleIds` vazio ou possuir um dos cargos). Limite por `maxParticipants`.

## Moderação durante a reunião

Mesmos recursos de [api-rest.md](api-rest.md#moderação). Recomendado para reuniões grandes:
- **Modo palestra**: só palestrantes publicam; demais assistem e usam chat.
- Promover quem for falar (`promote`), rebaixar depois (`demote`).
- Mutar/expulsar quem atrapalhar.

## Encerramento

Gatilhos:
- `/reuniao encerrar` ou `POST /rooms/:id/end` (MOD+).
- Sala vazia por mais de 15 minutos (`MEETING_FINISHED`) [configurável].

Efeitos: `deleteRoom` no LiveKit, `status = ENDED`, fecha participações, edita o aviso para "Reunião encerrada", gera relatório (`GET /meetings/:id/report`).

## Reagendar e cancelar

- **Reagendar**: só em `SCHEDULED`. Atualiza `startsAt`, zera `sentAt` dos lembretes futuros, edita o aviso e envia nova mensagem "Reunião reagendada".
- **Cancelar**: `status = CANCELED`, edita o aviso e avisa no canal.

## Relatório de presença

Gerado a partir de `participations`: quem entrou, saiu e por quanto tempo; pico de participantes e duração. Útil para registro da comunidade.

## Fuso horário

- Armazenamento sempre em UTC.
- Entrada via comando interpretada em `TIMEZONE` (padrão `America/Sao_Paulo`).
- Exibição ao usuário no Discord via timestamp dinâmico `<t:UNIX:F>`; no frontend, no fuso do navegador.

## Casos de borda

| Caso | Tratamento |
|---|---|
| Duas reuniões no mesmo horário | Permitido; avisa o admin no comando |
| Horário no passado | Recusado (`STARTS_AT_IN_PAST`) |
| Canal de avisos removido | Reunião é criada, aviso falha e o admin recebe mensagem de erro |
| Servidor reinicia no horário | Scheduler abre na primeira execução |
| Admin perde o cargo | Reunião já criada permanece; novas ações são recusadas |
