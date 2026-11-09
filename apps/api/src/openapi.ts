import { AUDIT_ACTIONS } from './modules/audit/audit.service.js';

/**
 * Especificação OpenAPI 3.1 do backend. É a fonte do arquivo `apps/api/openapi.json`
 * (gerar com `npm run openapi -w @screem/api`). Toda rota nova entra aqui no mesmo PR.
 * Contrato descrito em docs/backend/api-rest.md.
 */
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } },
});

export function buildOpenApi(serverUrl = 'http://localhost:3000') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Screem API',
      version: '0.1.0',
      description:
        'API do Screem (Acelera DEV). Autenticação por cookie de sessão `screem_sid` (Discord OAuth2). Erros seguem o formato `ErrorBody`; decida sempre pelo campo `error.code`.',
      license: { name: 'MIT' },
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    tags: [
      { name: 'Health', description: 'Saúde e prontidão do serviço' },
      { name: 'Auth', description: 'Login com Discord e sessão' },
      { name: 'Rooms', description: 'Salas de live e reuniões' },
      { name: 'LiveKit', description: 'Webhook do servidor de mídia' },
      { name: 'Moderation', description: 'Mutar, expulsar, banir e palestrantes (MOD ou ADMIN)' },
      { name: 'Admin', description: 'Configurações da guilda e auditoria (ADMIN)' },
      { name: 'Meetings', description: 'Reuniões: agendar, avisar, abrir, cancelar e relatório' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness',
          description: 'Responde 200 se o processo está de pé. Não consulta dependências.',
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'Serviço vivo',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: {
                      data: {
                        type: 'object',
                        required: ['status', 'uptime'],
                        properties: {
                          status: { type: 'string', enum: ['ok'] },
                          uptime: { type: 'integer', description: 'Segundos desde o início' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/ready': {
        get: {
          tags: ['Health'],
          summary: 'Readiness',
          description:
            'Verifica as dependências (hoje: MongoDB). 200 se todas ok, 503 se alguma falhar. O corpo traz o estado de cada uma.',
          operationId: 'getReady',
          responses: {
            '200': { description: 'Pronto', content: readyContent('ok') },
            '503': {
              description: 'Alguma dependência indisponível',
              content: readyContent('unavailable'),
            },
          },
        },
      },

      '/auth/discord': {
        get: {
          tags: ['Auth'],
          summary: 'Inicia o login com Discord',
          description:
            'Gera o `state`, guarda-o (com o `redirect`) num cookie assinado de 10 min e redireciona (302) ao Discord.',
          operationId: 'startDiscordLogin',
          parameters: [
            {
              name: 'redirect',
              in: 'query',
              required: false,
              description:
                'Caminho relativo do frontend para onde voltar depois do login (ex.: `/r/abc`). Qualquer valor que não comece com uma única `/` é trocado por `/`.',
              schema: { type: 'string', maxLength: 500 },
            },
          ],
          responses: { '302': { description: 'Redireciona para o Discord' } },
        },
      },
      '/auth/discord/callback': {
        get: {
          tags: ['Auth'],
          summary: 'Retorno do Discord',
          description:
            'Troca o `code` por tokens, confirma que o usuário está na guilda e cria a sessão (cookie `screem_sid`). Sempre responde 302: em sucesso para o `redirect` pedido; em falha para `{WEB_URL}/login?error=<CODE>`, com `CODE` em `INVALID_STATE`, `ACCESS_DENIED`, `NOT_IN_GUILD`, `ACCOUNT_BLOCKED`, `DISCORD_OAUTH_FAILED` ou `DISCORD_UNAVAILABLE`.',
          operationId: 'discordLoginCallback',
          parameters: [
            { name: 'code', in: 'query', schema: { type: 'string' } },
            { name: 'state', in: 'query', schema: { type: 'string' } },
            { name: 'error', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '302': {
              description: 'Redireciona ao frontend',
              headers: {
                'Set-Cookie': {
                  description: '`screem_sid` (HttpOnly, SameSite=Lax) em caso de sucesso',
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Usuário logado e papel',
          description: 'O papel é recalculado a partir dos cargos no Discord (cache de 60 s).',
          operationId: 'getMe',
          security: [{ sessionCookie: [] }],
          responses: {
            '200': {
              description: 'Usuário atual',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: { data: { $ref: '#/components/schemas/User' } },
                  },
                },
              },
            },
            '401': errorResponse('UNAUTHENTICATED: sem sessão válida'),
            '403': errorResponse('NOT_IN_GUILD (saiu do servidor) ou ACCOUNT_BLOCKED'),
            '502': errorResponse('DISCORD_UNAVAILABLE'),
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Encerra a sessão',
          description: 'Exige cabeçalho `Origin` de uma origem permitida (proteção CSRF).',
          operationId: 'logout',
          security: [{ sessionCookie: [] }],
          responses: {
            '204': { description: 'Sessão encerrada e cookie removido' },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN: Origin ausente ou não permitida'),
          },
        },
      },

      '/rooms': {
        get: {
          tags: ['Rooms'],
          summary: 'Lista salas',
          description:
            'Das mais novas para as mais antigas. Sem `status`, devolve só as abertas e as agendadas. Paginação por cursor opaco.',
          operationId: 'listRooms',
          security: [{ sessionCookie: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/RoomStatus' } },
            { name: 'type', in: 'query', schema: { $ref: '#/components/schemas/RoomType' } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Salas',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data', 'page'],
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Room' } },
                      page: {
                        type: 'object',
                        properties: {
                          next: { type: ['string', 'null'] },
                          limit: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': errorResponse('VALIDATION_ERROR (ex.: cursor inválido)'),
            '401': errorResponse('UNAUTHENTICATED'),
          },
        },
      },
      '/rooms/{id}': {
        patch: {
          tags: ['Moderation'],
          summary: 'Edita a sala',
          description:
            '`lectureMode` (modo palestra) é de MOD ou ADMIN. `title`, `description` e `maxParticipants` são só de ADMIN. Se o pedido mistura campos de papéis diferentes, vale a regra mais restrita e nada é aplicado. Só salas abertas ou agendadas.',
          operationId: 'updateRoom',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  minProperties: 1,
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string', minLength: 3, maxLength: 100 },
                    description: { type: ['string', 'null'], maxLength: 1000 },
                    maxParticipants: { type: 'integer', minimum: 2, maximum: 300 },
                    lectureMode: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Sala atualizada', content: roomContent },
            '400': errorResponse('VALIDATION_ERROR'),
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse('ROOM_NOT_OPEN'),
          },
        },
        get: {
          tags: ['Rooms'],
          summary: 'Detalhes de uma sala',
          description:
            'Dados públicos da sala. Ver a sala não dá acesso a ela: para entrar use `join`.',
          operationId: 'getRoom',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': { description: 'Sala', content: roomContent },
            '401': errorResponse('UNAUTHENTICATED'),
            '404': errorResponse('ROOM_NOT_FOUND'),
          },
        },
      },
      '/rooms/{id}/access': {
        get: {
          tags: ['Rooms'],
          summary: 'Posso entrar agora?',
          description:
            'Sem efeitos colaterais. Útil para o frontend escolher a tela (ex.: "entre no canal de voz"). `reason` é `null` quando pode entrar.',
          operationId: 'getRoomAccess',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': {
              description: 'Resultado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: {
                      data: {
                        type: 'object',
                        required: ['canJoin', 'reason', 'hint'],
                        properties: {
                          canJoin: { type: 'boolean' },
                          reason: {
                            oneOf: [
                              { $ref: '#/components/schemas/AccessReason' },
                              { type: 'null' },
                            ],
                          },
                          hint: { type: ['string', 'null'] },
                          voiceChannelName: { type: 'string' },
                          startsAt: { type: ['string', 'null'], format: 'date-time' },
                          expiresAt: { type: ['string', 'null'], format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': errorResponse('UNAUTHENTICATED'),
            '404': errorResponse('ROOM_NOT_FOUND'),
          },
        },
      },
      '/rooms/{id}/join': {
        post: {
          tags: ['Rooms'],
          summary: 'Entra na sala e recebe o token do LiveKit',
          description:
            'Valida no servidor: sala aberta, não banido, cargo (reuniões), **presença no canal de voz (lives)** e lotação. O token vale só para conectar (TTL curto); para reconectar, chame de novo. Limite de 20 chamadas por minuto por usuário.',
          operationId: 'joinRoom',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': {
              description: 'Acesso concedido',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: { data: { $ref: '#/components/schemas/JoinResult' } },
                  },
                },
              },
            },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse(
              'NOT_IN_VOICE, ROLE_NOT_ALLOWED, BANNED_FROM_ROOM ou FORBIDDEN (Origin)',
            ),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse('ROOM_NOT_OPEN ou ROOM_FULL'),
            '429': errorResponse('RATE_LIMITED'),
            '502': errorResponse('LIVEKIT_UNAVAILABLE'),
          },
        },
      },
      '/rooms/{id}/leave': {
        post: {
          tags: ['Rooms'],
          summary: 'Sai da sala',
          description: 'Registra a saída e derruba a conexão no LiveKit. Idempotente.',
          operationId: 'leaveRoom',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '204': { description: 'Saída registrada' },
            '401': errorResponse('UNAUTHENTICATED'),
            '404': errorResponse('ROOM_NOT_FOUND'),
          },
        },
      },
      '/rooms/{id}/end': {
        post: {
          tags: ['Rooms'],
          summary: 'Encerra a sala (MOD ou ADMIN)',
          description:
            'Avisa os participantes (`room:ended`), derruba a sala no LiveKit e edita o embed no Discord.',
          operationId: 'endRoom',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '204': { description: 'Sala encerrada' },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN: precisa ser MOD ou ADMIN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse('ROOM_ALREADY_ENDED ou ROOM_NOT_OPEN'),
          },
        },
      },
      '/livekit/webhook': {
        post: {
          tags: ['LiveKit'],
          summary: 'Webhook do LiveKit (uso interno)',
          description:
            'Chamado pelo servidor de mídia, autenticado pelo cabeçalho `Authorization` (JWT assinado com a chave da API do LiveKit, com o SHA-256 do corpo). Não é para frontends nem exige `Origin`. Trata `participant_joined`, `participant_left` e `room_finished`; os demais eventos são aceitos e ignorados.',
          operationId: 'livekitWebhook',
          requestBody: {
            required: true,
            content: { 'application/webhook+json': { schema: { type: 'object' } } },
          },
          responses: {
            '200': { description: 'Processado' },
            '401': errorResponse('UNAUTHENTICATED: assinatura inválida'),
          },
        },
      },

      '/rooms/{id}/participants': {
        get: {
          tags: ['Moderation'],
          summary: 'Lista quem está conectado na sala',
          description: 'Visível para moderação e para quem tem acesso à sala (ou já está nela).',
          operationId: 'listParticipants',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': {
              description: 'Participantes',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Participant' } },
                    },
                  },
                },
              },
            },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
          },
        },
      },
      '/rooms/{id}/participants/{userId}/mute': moderationAction(
        'muteParticipant',
        'Silencia um participante',
        'Revoga as fontes indicadas (padrão: todas), silencia o que já estava no ar e avisa a pessoa. Vale também se ela sair e voltar. Silenciamentos se acumulam; para desfazer use `unmute`.',
        {
          sources: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string',
              enum: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
            },
          },
          reason: { type: ['string', 'null'], maxLength: 200 },
        },
      ),
      '/rooms/{id}/participants/{userId}/unmute': moderationAction(
        'unmuteParticipant',
        'Libera um participante silenciado',
        'Devolve a permissão de publicar, respeitando o modo palestra.',
        { reason: { type: ['string', 'null'], maxLength: 200 } },
      ),
      '/rooms/{id}/participants/{userId}/kick': moderationAction(
        'kickParticipant',
        'Expulsa um participante da sala',
        'Remove da sala e do LiveKit. A pessoa pode voltar (para banir use `ban`).',
        { reason: { type: ['string', 'null'], maxLength: 200 } },
      ),
      '/rooms/{id}/participants/{userId}/ban': moderationAction(
        'banParticipant',
        'Bane um participante da sala',
        'Remove e impede a volta por `durationMinutes` (padrão 60, máximo 1440). `0` vale até o fim da sala e só ADMIN pode usar.',
        {
          durationMinutes: { type: 'integer', minimum: 0, maximum: 1440, default: 60 },
          reason: { type: ['string', 'null'], maxLength: 200 },
        },
      ),
      '/rooms/{id}/participants/{userId}/promote': moderationAction(
        'promoteParticipant',
        'Torna palestrante',
        'No modo palestra, palestrantes são os únicos membros que podem publicar.',
        null,
      ),
      '/rooms/{id}/participants/{userId}/demote': moderationAction(
        'demoteParticipant',
        'Remove de palestrante',
        'No modo palestra, a pessoa perde a permissão de publicar na hora.',
        null,
      ),
      '/rooms/{id}/bans/{userId}': {
        delete: {
          tags: ['Moderation'],
          summary: 'Remove um banimento',
          description: 'Idempotente: remover um banimento que não existe também responde 204.',
          operationId: 'removeBan',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam, userIdParam],
          responses: {
            '204': { description: 'Banimento removido' },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
          },
        },
      },
      '/settings': {
        get: {
          tags: ['Admin'],
          summary: 'Configuração da guilda (ADMIN)',
          operationId: 'getSettings',
          security: [{ sessionCookie: [] }],
          responses: {
            '200': {
              description: 'Configuração atual',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: { data: { $ref: '#/components/schemas/Settings' } },
                  },
                },
              },
            },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
          },
        },
        patch: {
          tags: ['Admin'],
          summary: 'Altera a configuração da guilda (ADMIN)',
          description:
            'Qualquer subconjunto dos campos. Canais e cargos precisam existir no Discord. Listas de cargos são substituídas por inteiro; `null` limpa um canal. Gera auditoria e o evento `settings:updated` para admins conectados.',
          operationId: 'updateSettings',
          security: [{ sessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SettingsPatch' } },
            },
          },
          responses: {
            '200': {
              description: 'Configuração atualizada',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: { data: { $ref: '#/components/schemas/Settings' } },
                  },
                },
              },
            },
            '400': errorResponse('VALIDATION_ERROR ou INVALID_DISCORD_REFERENCE'),
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
          },
        },
      },
      '/audit': {
        get: {
          tags: ['Admin'],
          summary: 'Auditoria de ações (ADMIN)',
          description:
            'Registro somente de inserção das ações de moderação e administração, do mais novo para o mais antigo.',
          operationId: 'listAudit',
          security: [{ sessionCookie: [] }],
          parameters: [
            { name: 'actorId', in: 'query', schema: { type: 'string' } },
            { name: 'targetId', in: 'query', schema: { type: 'string' } },
            { name: 'roomId', in: 'query', schema: { type: 'string' } },
            { name: 'action', in: 'query', schema: { $ref: '#/components/schemas/AuditAction' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entradas',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data', 'page'],
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } },
                      page: {
                        type: 'object',
                        properties: {
                          next: { type: ['string', 'null'] },
                          limit: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': errorResponse('VALIDATION_ERROR'),
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
          },
        },
      },

      '/meetings': {
        get: {
          tags: ['Meetings'],
          summary: 'Lista reuniões',
          description:
            'Qualquer membro vê. Sem `status`, devolve as abertas e as agendadas, da mais próxima para a mais distante. `from` e `to` filtram pelo horário de início.',
          operationId: 'listMeetings',
          security: [{ sessionCookie: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/RoomStatus' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            '200': { description: 'Reuniões', content: meetingListContent },
            '400': errorResponse('VALIDATION_ERROR'),
            '401': errorResponse('UNAUTHENTICATED'),
          },
        },
        post: {
          tags: ['Meetings'],
          summary: 'Cria uma reunião (ADMIN)',
          description:
            'Sem `startsAt` a reunião abre agora; com `startsAt` ela é agendada, abre sozinha no horário e manda lembretes. `reminders` são minutos antes do início (padrão 1440, 60 e 5; até 5; `[]` = nenhum); os que já passaram são descartados. `announce` (padrão `false`) publica o aviso já na criação; senão o admin divulga depois com `POST /meetings/{id}/announce`. Se `allowedRoleIds` não vier, vale o `/config cargo-reuniao`.',
          operationId: 'createMeeting',
          security: [{ sessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/MeetingCreate' } },
            },
          },
          responses: {
            '201': { description: 'Reunião criada', content: meetingContent },
            '400': errorResponse(
              'VALIDATION_ERROR, STARTS_AT_IN_PAST ou INVALID_DISCORD_REFERENCE',
            ),
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '409': errorResponse('ANNOUNCE_CHANNEL_NOT_SET'),
          },
        },
      },
      '/meetings/{id}': {
        get: {
          tags: ['Meetings'],
          summary: 'Detalhes de uma reunião',
          operationId: 'getMeeting',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': { description: 'Reunião', content: meetingContent },
            '401': errorResponse('UNAUTHENTICATED'),
            '404': errorResponse('ROOM_NOT_FOUND'),
          },
        },
        patch: {
          tags: ['Meetings'],
          summary: 'Edita ou reagenda uma reunião agendada (ADMIN)',
          description:
            'Só enquanto `SCHEDULED`. Mudar `startsAt` reagenda: os lembretes voltam a ser pendentes (só os que ainda fazem sentido), o aviso é editado e o canal recebe uma mensagem de reagendamento. Mudar só os demais campos edita o aviso sem mensagem nova.',
          operationId: 'updateMeeting',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/MeetingUpdate' } },
            },
          },
          responses: {
            '200': { description: 'Reunião atualizada', content: meetingContent },
            '400': errorResponse(
              'VALIDATION_ERROR, STARTS_AT_IN_PAST ou INVALID_DISCORD_REFERENCE',
            ),
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse('MEETING_NOT_EDITABLE'),
          },
        },
      },
      '/meetings/{id}/open': {
        post: {
          tags: ['Meetings'],
          summary: 'Abre uma reunião agendada antes do horário (ADMIN)',
          operationId: 'openMeeting',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': { description: 'Reunião aberta', content: meetingContent },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse('MEETING_NOT_EDITABLE'),
          },
        },
      },
      '/meetings/{id}/announce': {
        post: {
          tags: ['Meetings'],
          summary: 'Divulga a reunião no canal de avisos (ADMIN)',
          description:
            'O admin escolhe o momento: no dia ou antes, já com data e hora. Sem `resend`, divulgar duas vezes dá `ALREADY_ANNOUNCED`. Lembretes e avisos de reagendamento/cancelamento só existem depois da divulgação.',
          operationId: 'announceMeeting',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: { resend: { type: 'boolean', default: false } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Divulgada; devolve a reunião com `announced: true`' },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse(
              'ALREADY_ANNOUNCED, ANNOUNCE_CHANNEL_NOT_SET ou MEETING_NOT_EDITABLE',
            ),
            '502': errorResponse('DISCORD_SEND_FAILED'),
          },
        },
      },
      '/rooms/{id}/mute-all': {
        post: {
          tags: ['Moderation'],
          summary: 'Desliga o microfone de todos na reunião (MOD ou ADMIN)',
          description:
            'Só reuniões. Como o "silenciar todos" do Meet: desliga o que está no ar agora, mas cada pessoa pode ligar de novo. Não atinge papel igual ou superior ao seu nem você mesmo. Para impedir de falar, use o modo palestra.',
          operationId: 'muteAll',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': { description: 'Quantas pessoas foram atingidas (`data.affected`)' },
            '403': errorResponse('FORBIDDEN'),
            '409': errorResponse('MODERATION_ONLY_IN_MEETINGS ou ROOM_NOT_OPEN'),
          },
        },
      },
      '/rooms/{id}/cameras-off': {
        post: {
          tags: ['Moderation'],
          summary: 'Desliga câmera e tela de todos na reunião (MOD ou ADMIN)',
          description: 'Mesmas regras de `mute-all`, para câmera, tela e áudio da tela.',
          operationId: 'camerasOff',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': { description: 'Quantas pessoas foram atingidas (`data.affected`)' },
            '403': errorResponse('FORBIDDEN'),
            '409': errorResponse('MODERATION_ONLY_IN_MEETINGS ou ROOM_NOT_OPEN'),
          },
        },
      },
      '/guild': {
        get: {
          tags: ['Admin'],
          summary: 'Canais e cargos do servidor (ADMIN)',
          description:
            'Para o painel montar as listas de escolha (calls, canais de texto, cargos).',
          operationId: 'getGuildCatalog',
          security: [{ sessionCookie: [] }],
          responses: {
            '200': {
              description:
                '`data.channels` (id, name, kind, parentId) e `data.roles` (id, name, color, position)',
            },
            '403': errorResponse('FORBIDDEN'),
          },
        },
      },
      '/panel-users': {
        get: {
          tags: ['Admin'],
          summary: 'Pessoas com acesso ao painel concedido manualmente (ADMIN)',
          operationId: 'listPanelUsers',
          security: [{ sessionCookie: [] }],
          responses: {
            '200': { description: 'Lista com nome e foto quando a pessoa está no servidor' },
            '403': errorResponse('FORBIDDEN'),
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Dá acesso ao painel a alguém, com ou sem cargo (ADMIN)',
          description:
            'A pessoa vira ADMIN ou MOD na hora, mesmo sem cargo no Discord. Já na lista = troca o nível. Quem não está no servidor consegue entrar, só com esse acesso.',
          operationId: 'addPanelUser',
          security: [{ sessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId', 'role'],
                  additionalProperties: false,
                  properties: {
                    userId: { type: 'string', description: 'ID do Discord' },
                    role: { type: 'string', enum: ['ADMIN', 'MOD'] },
                    note: { type: ['string', 'null'], maxLength: 100 },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Adicionado' },
            '400': errorResponse('VALIDATION_ERROR'),
            '403': errorResponse('FORBIDDEN'),
          },
        },
      },
      '/panel-users/{userId}': {
        delete: {
          tags: ['Admin'],
          summary: 'Tira o acesso manual ao painel (ADMIN)',
          description:
            'Não mexe nos cargos do Discord: quem tem cargo de admin continua com acesso.',
          operationId: 'removePanelUser',
          security: [{ sessionCookie: [] }],
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '204': { description: 'Removido' },
            '403': errorResponse('FORBIDDEN'),
          },
        },
      },
      '/meetings/{id}/cancel': {
        post: {
          tags: ['Meetings'],
          summary: 'Cancela uma reunião agendada (ADMIN)',
          description:
            'Edita o aviso para "cancelada" e manda uma mensagem curta e silenciosa no canal. Reunião já aberta não se cancela: encerre-a (`POST /rooms/{id}/end`).',
          operationId: 'cancelMeeting',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '204': { description: 'Reunião cancelada' },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse('MEETING_NOT_EDITABLE'),
          },
        },
      },
      '/meetings/{id}/report': {
        get: {
          tags: ['Meetings'],
          summary: 'Relatório de presença (ADMIN)',
          description:
            'Só depois que a reunião termina. Quem saiu e voltou aparece uma vez, com a soma dos períodos. Quem ainda estava conectado no fim conta até o fim.',
          operationId: 'getMeetingReport',
          security: [{ sessionCookie: [] }],
          parameters: [roomIdParam],
          responses: {
            '200': {
              description: 'Relatório',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['data'],
                    properties: { data: { $ref: '#/components/schemas/MeetingReport' } },
                  },
                },
              },
            },
            '401': errorResponse('UNAUTHENTICATED'),
            '403': errorResponse('FORBIDDEN'),
            '404': errorResponse('ROOM_NOT_FOUND'),
            '409': errorResponse('REPORT_NOT_AVAILABLE'),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'screem_sid' },
      },
      schemas: {
        Meeting: {
          allOf: [
            { $ref: '#/components/schemas/Room' },
            {
              type: 'object',
              properties: {
                allowedRoleIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Vazio = qualquer membro. MOD e ADMIN entram sempre.',
                },
                reminders: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      minutesBefore: { type: 'integer' },
                      sent: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          ],
        },
        MeetingCreate: {
          type: 'object',
          required: ['title'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 100 },
            description: { type: ['string', 'null'], maxLength: 1000 },
            startsAt: {
              type: ['string', 'null'],
              format: 'date-time',
              description: 'Ausente ou null: abre agora',
            },
            maxParticipants: { type: 'integer', minimum: 2, maximum: 300, default: 100 },
            allowedRoleIds: { type: 'array', maxItems: 25, items: { type: 'string' } },
            announce: { type: 'boolean', default: true },
            reminders: {
              type: 'array',
              maxItems: 5,
              items: { type: 'integer', minimum: 1, maximum: 43200 },
            },
          },
        },
        MeetingUpdate: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 100 },
            description: { type: ['string', 'null'], maxLength: 1000 },
            startsAt: { type: 'string', format: 'date-time' },
            maxParticipants: { type: 'integer', minimum: 2, maximum: 300 },
            allowedRoleIds: { type: 'array', maxItems: 25, items: { type: 'string' } },
            reminders: {
              type: 'array',
              maxItems: 5,
              items: { type: 'integer', minimum: 1, maximum: 43200 },
            },
          },
        },
        MeetingReport: {
          type: 'object',
          properties: {
            durationMinutes: { type: 'integer' },
            peakParticipants: { type: 'integer' },
            attendees: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  displayName: { type: 'string' },
                  joinedAt: { type: 'string', format: 'date-time' },
                  leftAt: { type: 'string', format: 'date-time' },
                  minutes: { type: 'integer' },
                },
              },
            },
          },
        },
        Participant: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            displayName: { type: 'string' },
            avatarUrl: { type: ['string', 'null'] },
            role: { type: 'string', enum: ['MEMBER', 'MOD', 'ADMIN'] },
            joinedAt: { type: 'string', format: 'date-time' },
            isSpeaker: { type: 'boolean' },
            mutedByModeration: { type: 'boolean' },
            mutedSources: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
              },
            },
          },
        },
        Settings: {
          type: 'object',
          properties: {
            guildId: { type: 'string' },
            liveCategoryId: { type: ['string', 'null'] },
            liveTextChannelId: { type: ['string', 'null'] },
            announceChannelId: { type: ['string', 'null'] },
            adminRoleIds: { type: 'array', items: { type: 'string' } },
            modRoleIds: { type: 'array', items: { type: 'string' } },
            meetingAllowedRoleIds: { type: 'array', items: { type: 'string' } },
            maxParticipantsLive: { type: 'integer', minimum: 2, maximum: 100 },
            graceSeconds: { type: 'integer', minimum: 5, maximum: 300 },
            liveChannelIds: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Calls de voz escolhidas no painel para terem live (além da categoria, se houver)',
            },
            logChannelId: { type: ['string', 'null'], description: 'Canal de texto dos logs' },
            mentionRoleId: {
              type: ['string', 'null'],
              description: 'Cargo marcado nos avisos de reunião. null = não marca ninguém',
            },
            emptyLiveEndSeconds: {
              type: ['integer', 'null'],
              minimum: 10,
              maximum: 3600,
              description: 'Segundos com a call vazia até encerrar a live. null = padrão',
            },
            idleSessionMinutes: {
              type: 'integer',
              minimum: 1,
              maximum: 240,
              description:
                'Minutos sem ninguém transmitindo câmera/tela até a sessão entrar em espera',
            },
            activationGraceMinutes: {
              type: 'integer',
              minimum: 1,
              maximum: 60,
              description: 'Minutos para alguém começar a transmitir depois de ativar a sessão',
            },
          },
        },
        SettingsPatch: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            liveCategoryId: { type: ['string', 'null'], description: 'Categoria de canais' },
            liveTextChannelId: { type: ['string', 'null'], description: 'Canal de texto' },
            announceChannelId: { type: ['string', 'null'], description: 'Canal de texto' },
            adminRoleIds: { type: 'array', maxItems: 25, items: { type: 'string' } },
            modRoleIds: { type: 'array', maxItems: 25, items: { type: 'string' } },
            meetingAllowedRoleIds: { type: 'array', maxItems: 25, items: { type: 'string' } },
            maxParticipantsLive: { type: 'integer', minimum: 2, maximum: 100 },
            graceSeconds: { type: 'integer', minimum: 5, maximum: 300 },
            liveChannelIds: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Calls de voz escolhidas no painel para terem live (além da categoria, se houver)',
            },
            logChannelId: { type: ['string', 'null'], description: 'Canal de texto dos logs' },
            mentionRoleId: {
              type: ['string', 'null'],
              description: 'Cargo marcado nos avisos de reunião. null = não marca ninguém',
            },
            emptyLiveEndSeconds: {
              type: ['integer', 'null'],
              minimum: 10,
              maximum: 3600,
              description: 'Segundos com a call vazia até encerrar a live. null = padrão',
            },
            idleSessionMinutes: {
              type: 'integer',
              minimum: 1,
              maximum: 240,
              description:
                'Minutos sem ninguém transmitindo câmera/tela até a sessão entrar em espera',
            },
            activationGraceMinutes: {
              type: 'integer',
              minimum: 1,
              maximum: 60,
              description: 'Minutos para alguém começar a transmitir depois de ativar a sessão',
            },
          },
        },
        AuditAction: { type: 'string', enum: AUDIT_ACTIONS },
        AuditEntry: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            at: { type: 'string', format: 'date-time' },
            actorId: { type: 'string' },
            targetId: { type: ['string', 'null'] },
            roomId: { type: ['string', 'null'] },
            action: { $ref: '#/components/schemas/AuditAction' },
            reason: { type: ['string', 'null'] },
            meta: { type: 'object', additionalProperties: true },
          },
        },
        RoomType: { type: 'string', enum: ['LIVE', 'MEETING'] },
        RoomStatus: { type: 'string', enum: ['SCHEDULED', 'OPEN', 'ENDED', 'CANCELED'] },
        AccessReason: {
          type: 'string',
          enum: [
            'ROOM_NOT_OPEN',
            'BANNED_FROM_ROOM',
            'ROLE_NOT_ALLOWED',
            'NOT_IN_VOICE',
            'ROOM_FULL',
          ],
        },
        Room: {
          type: 'object',
          required: ['id', 'type', 'status', 'title', 'url', 'participantCount', 'maxParticipants'],
          properties: {
            id: {
              type: 'string',
              description: '22 caracteres base64url',
              example: 'kF3x9QzP2mT7vB1nLw0aYc',
            },
            type: { $ref: '#/components/schemas/RoomType' },
            status: { $ref: '#/components/schemas/RoomStatus' },
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            voiceChannelId: { type: ['string', 'null'], description: 'Só em lives' },
            startsAt: { type: ['string', 'null'], format: 'date-time' },
            openedAt: { type: ['string', 'null'], format: 'date-time' },
            endedAt: { type: ['string', 'null'], format: 'date-time' },
            createdBy: { type: 'string' },
            maxParticipants: { type: 'integer' },
            lectureMode: { type: 'boolean' },
            mediaState: {
              type: 'string',
              enum: ['ACTIVE', 'IDLE'],
              description:
                'Só lives: ACTIVE (em uso) ou IDLE (em espera; ativa quando alguém entra pelo link)',
            },
            participantCount: { type: 'integer' },
            url: { type: 'string', format: 'uri' },
          },
        },
        JoinResult: {
          type: 'object',
          required: ['livekit', 'participant', 'permissions', 'room'],
          properties: {
            livekit: {
              type: 'object',
              required: ['url', 'token'],
              properties: {
                url: { type: 'string', example: 'wss://live.exemplo.com' },
                token: {
                  type: 'string',
                  description: 'JWT do LiveKit; use em `room.connect(url, token)`',
                },
              },
            },
            participant: {
              type: 'object',
              properties: {
                identity: { type: 'string' },
                name: { type: 'string' },
                role: { type: 'string', enum: ['MEMBER', 'MOD', 'ADMIN'] },
              },
            },
            permissions: {
              type: 'object',
              properties: {
                canPublish: { type: 'boolean' },
                canPublishSources: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
                  },
                },
                canModerate: { type: 'boolean' },
              },
            },
            room: {
              type: 'object',
              properties: { id: { type: 'string' }, lectureMode: { type: 'boolean' } },
            },
          },
        },
        User: {
          type: 'object',
          required: ['id', 'username', 'displayName', 'avatarUrl', 'role'],
          properties: {
            id: {
              type: 'string',
              description: 'ID do Discord (snowflake)',
              example: '123456789012345678',
            },
            username: { type: 'string' },
            displayName: {
              type: 'string',
              description: 'Apelido na guilda, nome global ou username',
            },
            avatarUrl: { type: ['string', 'null'] },
            role: { type: 'string', enum: ['MEMBER', 'MOD', 'ADMIN'] },
          },
        },
        ErrorBody: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', description: 'O que aconteceu e por quê' },
                hint: { type: 'string', description: 'O que fazer a respeito' },
                details: {},
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        Error: errorResponse('Erro (veja docs/backend/erros.md)'),
      },
    },
  };
}

const roomIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'ID da sala (22 caracteres)',
  schema: { type: 'string', pattern: '^[\\w-]{22}$' },
};

const roomContent = {
  'application/json': {
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { $ref: '#/components/schemas/Room' } },
    },
  },
};

const userIdParam = {
  name: 'userId',
  in: 'path',
  required: true,
  description: 'ID do Discord de quem sofre a ação',
  schema: { type: 'string' },
};

/** Ações de moderação seguem todas o mesmo molde (204 ou erro). */
function moderationAction(
  operationId: string,
  summary: string,
  description: string,
  bodyProperties: Record<string, unknown> | null,
) {
  return {
    post: {
      tags: ['Moderation'],
      summary,
      description: `${description} Exige papel superior ao do alvo (ninguém age sobre papel igual ou superior, nem sobre si) e gera auditoria. Limite de 60 ações por minuto.`,
      operationId,
      security: [{ sessionCookie: [] }],
      parameters: [roomIdParam, userIdParam],
      ...(bodyProperties
        ? {
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: bodyProperties,
                  },
                },
              },
            },
          }
        : {}),
      responses: {
        '204': { description: 'Feito' },
        '400': errorResponse('VALIDATION_ERROR ou CANNOT_TARGET_SELF'),
        '401': errorResponse('UNAUTHENTICATED'),
        '403': errorResponse('FORBIDDEN ou HIERARCHY_VIOLATION'),
        '404': errorResponse('ROOM_NOT_FOUND ou PARTICIPANT_NOT_IN_ROOM'),
        '409': errorResponse('ROOM_NOT_OPEN'),
        '429': errorResponse('RATE_LIMITED'),
        '502': errorResponse('LIVEKIT_UNAVAILABLE'),
      },
    },
  };
}

const meetingContent = {
  'application/json': {
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { $ref: '#/components/schemas/Meeting' } },
    },
  },
};

const meetingListContent = {
  'application/json': {
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Meeting' } } },
    },
  },
};

function readyContent(status: 'ok' | 'unavailable') {
  return {
    'application/json': {
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            type: 'object',
            required: ['status', 'checks'],
            properties: {
              status: { type: 'string', enum: [status] },
              checks: {
                type: 'object',
                additionalProperties: { type: 'string', enum: ['ok', 'fail'] },
                example: { mongo: status === 'ok' ? 'ok' : 'fail' },
              },
            },
          },
        },
      },
    },
  };
}
