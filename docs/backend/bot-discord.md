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

`voice-cache.ts` guarda `Map<userId, { channelId, guildId, since }>`.

- Ao `ready`, faz fetch das guildas e popula o cache.
- A cada `voiceStateUpdate`, atualiza e dispara o handler.
- API: `isUserInChannel(userId, channelId)` usado por `rooms/access.ts`.
- Em reconexão do gateway (`shardResume`), reconcilia comparando com o estado real.

## Eventos tratados

### `voiceStateUpdate(old, new)`
```
se new.channelId pertence à liveCategoryId e old.channelId != new.channelId:
    entrou -> ensureLiveRoom(channelId)
        sala OPEN não existe? cria; envia embed; grava announceMessageId
        existe? só atualiza embed (contagem)
se old.channelId pertence à categoria e saiu:
    notifica realtime (voice:warning) e agenda remoção após graceSeconds
    se o canal ficou vazio: agenda encerramento da sala (VOICE_EMPTY, 60 s)
```

### `interactionCreate`
Roteia slash commands e botões. Todo comando de admin revalida o papel pelo `resolveRole`.

### `channelDelete`, `roleDelete`
Limpam referências em `guild_settings` e avisam o admin.

## Embed da live

```
Título:  🔴 Live aberta: <nome do canal>
Corpo:   <usuário> iniciou uma sala. Entre no canal de voz e abra o Screem para transmitir câmera e tela.
Campos:  Participantes: 3 · Canal: #live-1
Botão:   [Abrir sala] -> https://app.exemplo.com/r/<roomId>   (estilo Link)
Rodapé:  Acelera DEV · Screem
```

- Uma mensagem por sala; é **editada** (contagem de participantes) no máximo a cada 15 s.
- Ao encerrar a sala, o embed é editado para "Live encerrada" e o botão é desativado (substituído por texto).
- O link é o `roomId` público. Segurança vem da validação de presença, não do segredo do link (veja [seguranca.md](seguranca.md)).

## Slash commands

Registrados por guilda (instantâneo) no `ready`. Todos respondem em `ephemeral` salvo indicado.

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

### `/reuniao` (ADMIN)
| Subcomando | Opções | Efeito |
|---|---|---|
| `/reuniao criar` | `titulo`, `descricao?`, `avisar?` (padrão sim) | cria e abre agora; avisa no canal |
| `/reuniao agendar` | `titulo`, `data` (`DD/MM/AAAA`), `hora` (`HH:mm`), `descricao?`, `lembretes?` | agenda; avisa no canal |
| `/reuniao reagendar` | `reuniao` (autocomplete), `data`, `hora` | muda o horário e reavisa |
| `/reuniao cancelar` | `reuniao` | cancela e avisa |
| `/reuniao encerrar` | `reuniao?` (padrão: a aberta) | encerra |
| `/reuniao listar` | - | próximas reuniões |

Fuso: `America/Sao_Paulo` (configurável por `TIMEZONE`). Datas no passado são recusadas. O Discord renderiza horários com `<t:UNIX:F>`, então cada pessoa vê no fuso dela.

### `/sala` (MOD+)
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
Menção:  @everyone ou cargo (configurável por `MEETING_MENTION_ROLE_ID`)
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

- Nunca confiar em `interaction.member` para papel; use `resolveRole`.
- Responder em até 3 s (`deferReply` quando houver I/O).
- Mensagens de erro amigáveis, em português, sem stack trace.
