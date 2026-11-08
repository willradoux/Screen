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
    },
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'screem_sid' },
      },
      schemas: {
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
