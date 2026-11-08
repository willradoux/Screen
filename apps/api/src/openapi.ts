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
    tags: [{ name: 'Health', description: 'Saúde e prontidão do serviço' }],
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
    },
    components: {
      schemas: {
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
