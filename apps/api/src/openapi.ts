/**
 * Especificação OpenAPI 3.1 do backend. É a fonte do arquivo `apps/api/openapi.json`
 * (gerar com `npm run openapi -w @screem/api`). Toda rota nova entra aqui no mesmo PR.
 * Contrato descrito em docs/backend/api-rest.md.
 */
export function buildOpenApi(serverUrl = 'http://localhost:3000') {
  const errorResponse = (description: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } },
  });

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
    },
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'screem_sid' },
      },
      schemas: {
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
                message: { type: 'string' },
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
