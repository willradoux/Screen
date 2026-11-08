# Permissões e papéis

## Papéis

| Papel | Como é definido |
|---|---|
| `MEMBER` | Está na guilda e não é mod nem admin |
| `MOD` | Tem algum cargo listado em `modRoleIds` **ou** a permissão Discord `MuteMembers`/`ModerateMembers` (configurável) |
| `ADMIN` | Tem algum cargo em `adminRoleIds`, **ou** permissão Discord `Administrator`/`ManageGuild`, **ou** é o dono da guilda |

Ordem: `ADMIN` > `MOD` > `MEMBER`. O papel mais alto vence.

As listas de cargos ficam em `GuildSettings` e são editáveis por `/config` ou pela API.

## Resolução do papel

> Implementado: cargos (`adminRoleIds`/`modRoleIds`), `BOOTSTRAP_ADMIN_IDS` e, com o bot ligado (Fase 4), dono do servidor, `Administrator`/`ManageGuild` (ADMIN) e `MuteMembers`/`ModerateMembers` (MOD). Se o bot estiver desligado ou a consulta falhar, valem só cargos e `BOOTSTRAP_ADMIN_IDS` — nunca eleva por engano.
> A permissão `MuteMembers`/`ModerateMembers` como MOD ainda não é configurável.

```
resolveRole(guildId, userId):
  membro = discord.fetchMember(userId)   // cache curto de 60 s
  se membro é dono da guilda            -> ADMIN
  se membro tem permissão Administrator -> ADMIN
  se algum cargo em adminRoleIds        -> ADMIN
  se algum cargo em modRoleIds          -> MOD
  senão                                 -> MEMBER
```

O papel **não** é gravado de forma permanente na sessão. É recalculado, então remover um cargo no Discord tem efeito em até 60 s.

## Capacidades

> Implementado em `modules/permissions/capabilities.ts` (papel mínimo de cada capacidade) e testado contra esta tabela em `test/unit/capabilities.test.ts`. Detalhe: **título, descrição e capacidade da sala** (`room.edit`) são só de ADMIN; o **modo palestra** (`room.lecture`) é de MOD ou ADMIN.

| Capacidade | MEMBER | MOD | ADMIN |
|---|:-:|:-:|:-:|
| Entrar em sala de live (estando na call) | sim | sim | sim |
| Entrar em reunião (cargo permitido) | sim | sim | sim |
| Publicar câmera / microfone / tela | sim* | sim | sim |
| Assistir | sim | sim | sim |
| Enviar mensagem no chat da sala | sim | sim | sim |
| Mutar áudio/vídeo/tela de outro | não | sim | sim |
| Expulsar da sala | não | sim | sim |
| Banir temporariamente da sala | não | sim | sim |
| Encerrar sala de live | não | sim | sim |
| Ativar modo palestra (só palestrantes publicam) | não | sim | sim |
| Promover participante a palestrante | não | sim | sim |
| Criar reunião (comando e API) | não | não | sim |
| Agendar, editar e cancelar reunião | não | não | sim |
| Encerrar reunião | não | sim | sim |
| Alterar configurações da guilda | não | não | sim |
| Ler auditoria | não | não | sim |
| Moderar um ADMIN | não | não | não |

\* Exceto quando a sala está em modo palestra ou o usuário foi silenciado por moderação.

### Regras de hierarquia

- Ninguém modera alguém de papel **igual ou superior**. MOD não age sobre MOD/ADMIN. ADMIN não age sobre outro ADMIN.
- Ninguém modera a si mesmo pelas rotas de moderação (para sair, use `leave`).
- O dono da guilda não pode ser expulso nem mutado pelo sistema.

## Capacidades no token LiveKit

| Papel / estado | `canSubscribe` | `canPublish` | `canPublishSources` | `roomAdmin` |
|---|:-:|:-:|---|:-:|
| MEMBER | sim | sim | microfone, câmera, tela | não |
| MEMBER em modo palestra (não palestrante) | sim | não | - | não |
| MEMBER silenciado por moderação | sim | não | - | não |
| MOD | sim | sim | todas | não |
| ADMIN | sim | sim | todas | sim |

`roomAdmin` do LiveKit **não** é concedido a MOD. A moderação é feita pelo backend usando a API do servidor (`RoomServiceClient`), nunca pelo cliente.

## Como o backend aplica

```ts
router.post('/rooms/:id/participants/:userId/mute',
  requireAuth,
  requireCapability('moderation.mute'),
  enforceHierarchy,          // compara papel do ator e do alvo
  controller.mute)
```

- `requireCapability` consulta a matriz acima.
- `enforceHierarchy` impede agir sobre papel igual ou maior.
- Toda ação bem-sucedida chama `audit.record(...)`.

## Acesso à sala (diferente de papel)

> Implementado em `modules/rooms/access.ts`. Ordem das checagens: sala aberta, banimento, cargo (reuniões), presença na call (lives), lotação.

| Tipo de sala | Regra de acesso |
|---|---|
| `LIVE` | Estar **agora** no canal de voz ligado à sala (voice state do Discord) |
| `MEETING` | Ter um cargo em `meetingAllowedRoleIds` (vazio = qualquer membro da guilda) e a sala estar `OPEN` |
| Qualquer | Não estar banido da sala; conta não bloqueada; capacidade da sala não esgotada |

ADMIN e MOD podem entrar em **qualquer** sala de live sem estar na call (para moderar), mas aparecem como moderadores.

## Alterando o modelo

Ao adicionar uma capacidade: (1) atualizar a matriz aqui, (2) `capabilities.ts`, (3) testes em `permissions.test.ts`, (4) OpenAPI.
