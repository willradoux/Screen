# Reuniões e agendamento

Reuniões (`type = MEETING`) substituem o Meet nas reuniões mensais. Só **ADMIN** cria, agenda, edita, reagenda, abre antes da hora e cancela. **MOD+** pode encerrar e moderar. Qualquer membro vê a lista e entra quando a reunião abre.

Os comandos do bot (`/reuniao ...`) e a API REST (`/meetings`) usam o **mesmo serviço** (`modules/meetings/meetings.service.ts`): as regras e as mensagens de erro são as mesmas. O relógio que abre as reuniões e manda os lembretes é o `MeetingScheduler` (`modules/meetings/scheduler.ts`).

## Ciclo de vida

```
              agendar (startsAt no futuro)           horário chega, ou "abrir"
 (nada) ───────────────────────────────> SCHEDULED ──────────────────────────> OPEN
    │                                        │   ▲                                │
    │  criar (sem startsAt)                  │   └── reagendar / editar           │ encerrar, ou vazia por 15 min
    └────────────────────────────────────────┼──────────> CANCELED                ▼
          (nasce aberta)                     │                                  ENDED
                                        cancelar
```

Só `SCHEDULED` pode ser editada, reagendada, aberta antes da hora ou cancelada. Reunião `OPEN` só se encerra. As transições são condicionais no banco: duas pessoas agindo ao mesmo tempo nunca produzem um estado impossível.

## Criação

Pelo comando `/reuniao criar|agendar` ou por `POST /meetings`.

| Regra | Valor |
|---|---|
| Título | 3 a 100 caracteres |
| Descrição | até 1000 |
| `startsAt` | pelo menos 2 minutos no futuro (`STARTS_AT_IN_PAST`) |
| Capacidade | 2 a 300 (padrão 100) |
| Aviso (`announce`, padrão sim) | exige canal de avisos configurado (`ANNOUNCE_CHANNEL_NOT_SET`); a reunião **não** é criada se faltar |
| Quem pode entrar | `allowedRoleIds`; se omitido, vale o que estiver em `/config cargo-reuniao`. Cargos precisam existir no Discord |
| Lembretes | até 5, em minutos antes do início; padrão 24 h, 1 h e 5 min |

Efeitos: grava a reunião (`SCHEDULED`, ou `OPEN` se não houver `startsAt`), publica o aviso e registra `MEETING_CREATED`. Se a reunião for criada mas o envio do aviso falhar (bot sem permissão), ela existe e a resposta avisa.

## Lembretes

Os lembretes saem do `MeetingScheduler`, que verifica a cada `SCHEDULER_INTERVAL_SECONDS` (padrão 15 s) e logo ao iniciar.

- Cada lembrete é uma **mensagem nova e curta** no canal de avisos: `⏰ Reunião em breve`, o horário em `<t:UNIX:R>` e o botão da sala. Marca o mesmo cargo do aviso original (se não houver cargo configurado, não marca ninguém).
- **Sem repetir:** antes de enviar, o lembrete é *reservado* no banco por uma operação atômica; só quem conseguiu reservar envia. Duas rodadas ao mesmo tempo, ou dois servidores, nunca duplicam.
- **Se o envio falha**, a reserva é desfeita e a próxima rodada tenta de novo.
- **Atrasados são descartados:** se o servidor ficou fora do ar e o lembrete venceu há mais de 10 minutos (ou a reunião já começou), ele é marcado como enviado e **não** é mandado. A abertura da reunião, ao contrário, nunca é descartada.
- Lembretes cujo momento já passou na criação (reunião marcada para daqui a 30 min não recebe o de 1 h) nem chegam a ser criados.

## Abertura

- **No horário:** o agendador transiciona `SCHEDULED → OPEN` (`openedAt = agora`), **edita** o aviso original para `🟢 Reunião aberta agora` e registra `MEETING_OPENED` com `actorId = system`. Não manda mensagem nova (os lembretes já avisaram).
- **Antes da hora:** `POST /meetings/:id/open` faz o mesmo, com o admin como autor.
- Se o servidor estava fora do ar na hora marcada, a reunião abre na primeira rodada seguinte.

Antes de abrir, `join` devolve `409 ROOM_NOT_OPEN` com `details.startsAt`, para o frontend mostrar a contagem regressiva.

## Editar e reagendar

`PATCH /meetings/:id` ou `/reuniao reagendar` (só `SCHEDULED`; senão `409 MEETING_NOT_EDITABLE`).

- Título, descrição, capacidade e cargos: editam o registro e o aviso.
- **Mudar `startsAt` reagenda:** os lembretes voltam a ser pendentes (só os que ainda fazem sentido para o novo horário), o aviso é editado e o canal recebe `🔁 Reunião reagendada` com o novo horário. O horário antigo deixa de valer.
- Trocar só `reminders` redefine a lista, sem mensagem nova.
- Registra `MEETING_UPDATED` com as mudanças.

## Cancelar

`POST /meetings/:id/cancel` ou `/reuniao cancelar`. Só `SCHEDULED`; reunião aberta se encerra. Edita o aviso para `🚫 cancelada` e manda uma mensagem curta **sem marcar ninguém**. Registra `MEETING_CANCELED`.

## Acesso à sala

Diferente das lives, **não exige estar em canal de voz**: membro da guilda e (`allowedRoleIds` vazio ou possuir um dos cargos). `MOD` e `ADMIN` entram sempre. Limite por `maxParticipants`. Detalhes em [permissoes.md](permissoes.md#acesso-à-sala-diferente-de-papel).

## Moderação durante a reunião

Mesmos recursos de [api-rest.md](api-rest.md#moderação). Recomendado para reuniões grandes:

- **Modo palestra:** só palestrantes publicam; os demais assistem.
- Promover quem for falar (`promote`), rebaixar depois (`demote`).
- Mutar, expulsar ou banir quem atrapalhar.

## Encerramento

| Gatilho | Motivo registrado |
|---|---|
| `/reuniao encerrar` ou `POST /rooms/:id/end` por ADMIN | `ENDED_BY_ADMIN` |
| O mesmo por MOD | `ENDED_BY_MOD` |
| Sala **vazia por 15 minutos** (`EMPTY_MEETING_END_MINUTES`) | `MEETING_FINISHED` (autor `system`) |

A regra do abandono: reunião `OPEN`, **sem ninguém conectado**, e o último movimento (abertura, entrada ou saída) tem 15 minutos ou mais. Com gente dentro nunca encerra, por mais tempo que passe; o prazo conta a partir da última saída. Uma reunião que ninguém aparece para abrir é encerrada 15 minutos depois de aberta.

Ao encerrar: `room:ended` para os conectados, `deleteRoom` no LiveKit, participações fechadas e o **aviso editado** para `⚫ Reunião encerrada` com o resumo: **Duração**, **Participantes** (quantas pessoas diferentes) e **Pico** (máximo de pessoas ao mesmo tempo).

## Relatório de presença

`GET /meetings/:id/report` (ADMIN), só depois de `ENDED` (`409 REPORT_NOT_AVAILABLE` antes).

```json
{ "data": { "durationMinutes": 62, "peakParticipants": 41,
            "attendees": [ { "userId": "1234", "displayName": "Fulano",
                             "joinedAt": "2026-12-05T23:00:12.000Z",
                             "leftAt": "2026-12-06T00:02:00.000Z", "minutes": 58 } ] } }
```

Como é calculado (`modules/meetings/report.ts`, função pura):

- **Duração:** da abertura ao fim da reunião.
- **Por pessoa:** quem saiu e voltou aparece **uma vez**, com `joinedAt` da primeira entrada, `leftAt` da última saída e `minutes` = **soma dos períodos** em que ficou (não o intervalo entre a primeira e a última). Ordenado pela primeira entrada.
- **Quem ainda estava conectado no fim** conta até o fim da reunião; sessões que começaram antes da abertura contam a partir dela; o que está fora do intervalo é ignorado.
- **Pico:** varredura de entradas e saídas. Quem sai e quem entra no mesmo instante não se somam.

## Fuso horário

- Armazenamento sempre em UTC.
- Comandos interpretam `DD/MM/AAAA` e `HH:mm` em `TIMEZONE` (padrão `America/Sao_Paulo`), validando datas inexistentes (31/02) e horários que o fuso pula.
- A API recebe e devolve ISO 8601 (UTC).
- Exibição: o Discord mostra `<t:UNIX:F>` no fuso de cada pessoa; o frontend usa o do navegador.

## Auditoria

`MEETING_CREATED`, `MEETING_UPDATED`, `MEETING_OPENED`, `MEETING_CANCELED` e `ROOM_ENDED`. O campo `meta.via` diz de onde veio (`command`, `api` ou `scheduler`); ações do relógio têm `actorId = "system"`.

## Casos de borda

| Caso | Tratamento |
|---|---|
| Duas reuniões no mesmo horário | Permitido; as duas abrem |
| Horário no passado ou a menos de 2 min | Recusado (`STARTS_AT_IN_PAST`) |
| Canal de avisos removido depois de criar | Lembretes não saem (aviso no log); a reunião abre normalmente |
| Servidor reinicia no horário | O agendador abre na primeira rodada; nada se perde porque tudo vem do MongoDB |
| Erro numa reunião | Registrado e isolado: as outras continuam sendo processadas |
| Admin perde o cargo | O que já foi criado permanece; novas ações são recusadas |
| Dois admins editam ao mesmo tempo | Transições condicionais: a segunda recebe `MEETING_NOT_EDITABLE` se o estado já mudou |

## Variáveis

| Variável | Padrão | Descrição |
|---|---|---|
| `SCHEDULER_INTERVAL_SECONDS` | `15` | De quanto em quanto tempo o agendador verifica |
| `EMPTY_MEETING_END_MINUTES` | `15` | Reunião aberta e vazia por tanto tempo é encerrada |
| `MEETING_MENTION_ROLE_ID` | vazio | Cargo marcado nos avisos e lembretes (vazio = não marca ninguém) |
