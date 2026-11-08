# Bot do Discord

Biblioteca: **discord.js v14**. O bot roda no mesmo processo da API (ADR-5), mas isolado em `src/discord/`.

## Criação da aplicação

1. [Discord Developer Portal](https://discord.com/developers/applications) -> New Application.
2. **Bot**: gere o token (`DISCORD_BOT_TOKEN`).
3. **Privileged Gateway Intents**: ative `Server Members Intent`. `Message Content` **não** é necessário.
4. **OAuth2**: cadastre o redirect `https://api.exemplo.com/api/v1/auth/discord/callback` (e o de dev `http://localhost:3000/api/v1/auth/discord/callback`). Guarde `CLIENT_ID` e `CLIENT_SECRET`.
5. Convide o bot com escopos `bot applications.commands` e as permissões abaixo.

## Intents

| Intent | Motivo |
|---|---|
| `Guilds` | canais, cargos, categorias |
| `GuildVoiceStates` | entrada/saída de canais de voz |
| `GuildMembers` | cargos dos membros e permissões |

## Permissões do bot no servidor

| Permissão | Motivo |
|---|---|
| View Channels | enxergar categoria de lives e canais |
| Send Messages | enviar embeds |
| Embed Links | embeds |
| Read Message History | editar o próprio embed |
| Use Application Commands | slash commands |

Não pedir `Administrator`. O bot **não** move nem muta pessoas no Discord; a moderação é dentro do Screem.

## Cache de voice states

`discord/voice-cache.ts` guarda `userId -> channelId` (bots são ignorados).

- Ao `ready` e a cada `shardResume`, `LiveVoiceHandler.reconcile()` lê o estado real do Discord e substitui o cache.
- A cada `voiceStateUpdate`, atualiza e dispara o handler.
- API: `isInChannel(userId, channelId)`, `count(channelId)`, `membersIn(channelId)`; é o que a Fase 5 usa para decidir se alguém pode entrar na live.
- Eventos do mesmo canal são processados **em fila** (`KeyedQueue`), então duas pessoas entrando ao mesmo tempo nunca criam duas salas. Além disso, um índice único parcial no MongoDB (uma sala `OPEN` por `voiceChannelId`) garante isso mesmo com várias instâncias.

## Eventos tratados

### `voiceStateUpdate(old, new)`
```
se new.channelId pertence à liveCategoryId e old.channelId != new.channelId:
    entrou -> ensureLiveRoom(channelId)
        sala OPEN não existe? cria; envia embed; grava announceMessageId
        existe? só atualiza embed (contagem)
se old.channelId pertence à categoria e saiu:
    se o canal ficou vazio: agenda encerramento da sala (VOICE_EMPTY, EMPTY_LIVE_END_SECONDS = 60 s);
        quem entrar antes disso cancela o encerramento
    senão: agenda atualização do embed
    [Fase 5] notifica realtime (voice:warning) e remove do LiveKit após graceSeconds
```

Eventos de quem não mudou de canal (mutar, ligar câmera) são ignorados.

### `interactionCreate`
Roteia slash commands e botões. Todo comando de admin revalida o papel pelo `resolveRole`.

### `channelDelete`, `roleDelete`
Removem a referência em `guild_settings` (canal/categoria vira `null`, cargo sai das listas) e registram um aviso no log.

## Embed da live

```
Título:  🔴 Live aberta: <nome do canal>
Corpo:   <usuário> iniciou uma sala. Entre no canal de voz e abra o Screem para transmitir câmera e tela.
Campos:  Participantes: 3 · Canal: #live-1
Botão:   [Abrir sala] -> https://app.exemplo.com/r/<roomId>   (estilo Link)
Rodapé:  Acelera DEV · Screem
```

- Uma mensagem por sala, enviada ao `liveTextChannelId`; depois é **editada** (contagem de participantes) no máximo a cada 15 s por sala.
- Sem `/config canal-live` a sala é criada normalmente, só sem embed (aviso no log). O embed é publicado na próxima entrada depois da configuração.
- Se a mensagem for apagada, o próximo update reenvia e grava o novo ID.
- A menção ao usuário usa `allowed_mentions: { parse: [] }`: aparece o nome, mas ninguém é notificado.
- Ao encerrar a sala, o embed é editado para "Live encerrada" e o botão **some** (`components: []`).
- O link é o `roomId` público. Segurança vem da validação de presença, não do segredo do link (veja [seguranca.md](seguranca.md)).

## Slash commands

Registrados por guilda (instantâneo) no `ready`. Todas as respostas são `ephemeral`. O papel de quem executa é recalculado a cada comando (cargos configurados + dono/permissões do Discord), nunca vem de cache.

Todo comando que altera algo é **auditado** (`SETTINGS_UPDATED`, `MEETING_CREATED`, `MEETING_CANCELED`, `ROOM_ENDED`, com `meta.via = "command"`); comando recusado ou que só lê (`/config ver`, `/reuniao listar`) não gera registro.

Implementação: `discord/commands/` (`definitions.ts` descreve, `router.ts` autoriza, `config-handler.ts` e `meeting-handler.ts` executam). Os handlers não importam o discord.js, por isso são testados sem rede.

### `/config` (ADMIN)
| Subcomando | Opções | Efeito |
|---|---|---|
| `/config categoria-live` | `categoria` | define `liveCategoryId` |
| `/config canal-live` | `canal` | canal de texto dos embeds de live |
| `/config canal-avisos` | `canal` | canal de avisos das reuniões |
| `/config cargo-admin` | `acao: adicionar\|remover`, `cargo` | lista de admins |
| `/config cargo-mod` | `acao`, `cargo` | lista de mods |
| `/config cargo-reuniao` | `acao`, `cargo` | quem pode entrar em reuniões |
| `/config limite-live` | `max` (2 a 100) | `maxParticipantsLive` |
| `/config ver` | - | mostra a configuração atual |

### `/reuniao`
`criar`, `agendar`, `cancelar` e `listar` são só de **ADMIN**; `encerrar` é de **MOD+**.
| Subcomando | Opções | Efeito |
|---|---|---|
| `/reuniao criar` | `titulo`, `descricao?`, `avisar?` (padrão sim) | cria e abre agora; avisa no canal |
| `/reuniao agendar` | `titulo`, `data` (`DD/MM/AAAA`), `hora` (`HH:mm`), `descricao?`, `lembretes?` | agenda; avisa no canal |
| `/reuniao reagendar` | `reuniao` (autocomplete), `data`, `hora` | muda o horário e reavisa. **[Fase 7]** |
| `/reuniao cancelar` | `reuniao` (autocomplete) | só reunião `SCHEDULED`; edita o aviso para "cancelada" |
| `/reuniao encerrar` | `reuniao?` (padrão: a única aberta; se houver várias, escolha) | encerra e edita o aviso |
| `/reuniao listar` | - | próximas reuniões |

Regras do `criar`/`agendar`:
- Título de 3 a 100 caracteres; descrição até 1000.
- `agendar` exige o horário pelo menos 2 minutos no futuro e rejeita datas inexistentes (31/02) e formatos diferentes de `DD/MM/AAAA` e `HH:mm`.
- `lembretes`: até 5 valores em minutos, separados por vírgula (padrão `1440,60,5`; `0` = nenhum). Lembretes que já passaram (reunião marcada para daqui a 30 min não recebe o de 1 h) são descartados. O **envio** dos lembretes e a abertura automática no horário são da Fase 7.
- Com `avisar` (padrão sim) é obrigatório ter `/config canal-avisos`; senão o comando recusa e **não cria** a reunião.
- Se criar a reunião mas o envio do aviso falhar (bot sem permissão), a reunião existe e o admin é avisado na resposta.
- Quem pode entrar (`allowedRoleIds`) é copiado de `/config cargo-reuniao` no momento da criação.

Fuso: `America/Sao_Paulo` (configurável por `TIMEZONE`). Datas no passado são recusadas. O Discord renderiza horários com `<t:UNIX:F>`, então cada pessoa vê no fuso dela.

### `/sala` (MOD+) — [Fase 5/6]
Ainda não implementado: depende do LiveKit e da moderação.

| Subcomando | Efeito |
|---|---|
| `/sala encerrar canal` | encerra a live daquele canal |
| `/sala palestra canal ativar:bool` | modo palestra |

## Embed de reunião (aviso)

```
Título:  📅 Reunião: Reunião mensal de dezembro
Corpo:   <descrição>
Campos:  Quando: <t:1796511600:F> (<t:1796511600:R>) · Quem pode: todos os membros
Botão:   [Entrar na reunião] -> https://app.exemplo.com/r/<roomId>
Menção:  @everyone ou cargo (configurável por `MEETING_MENTION_ROLE_ID`); só na mensagem inicial, edições não notificam de novo
```

Quando a reunião abre: o mesmo aviso é editado para "🟢 Reunião aberta agora" e o botão fica ativo.

## Botões

Botões de **link** não precisam de handler. Se for necessário botão interativo (ex.: "Lembrar-me"), o `customId` segue o formato `acao:roomId` e o handler revalida tudo.

## Tolerância a falhas

| Cenário | Comportamento |
|---|---|
| Bot reinicia | Reconcilia: encerra salas LIVE sem ninguém no canal; recria cache de voz; não reenvia embeds já existentes (usa `announceMessageId`) |
| Mensagem do embed apagada | Reenvia na próxima atualização |
| Rate limit | discord.js enfileira; atualizações de embed são agrupadas (debounce 15 s) |
| Canal de avisos não configurado | `/reuniao` responde com erro e instrução para `/config canal-avisos` |
| Gateway cai | Reconexão automática; reconciliação em `shardResume` |

## Boas práticas

- Nunca confiar em `interaction.member` para papel; use `resolveRole` (feito em `CommandRouter.roleOf`).
- O bot só responde a interações da guilda configurada em `DISCORD_GUILD_ID`.
- Responder em até 3 s (`deferReply` quando houver I/O).
- Mensagens de erro amigáveis, em português, sem stack trace.
