import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/shared/logger.js';

const env = loadEnv({ NODE_ENV: 'test' });
const logger = createLogger(env);

describe('GET /api/v1/health', () => {
  const app = createApp(env, logger);

  it('responde ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('GET /api/v1/ready', () => {
  it('200 quando todas as dependências respondem', async () => {
    const app = createApp(env, logger, { readiness: { mongo: async () => {} } });
    const res = await request(app).get('/api/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok', checks: { mongo: 'ok' } });
  });

  it('503 e detalhe por dependência quando alguma falha', async () => {
    const app = createApp(env, logger, {
      readiness: {
        mongo: async () => {
          throw new Error('fora do ar');
        },
        outra: async () => {},
      },
    });
    const res = await request(app).get('/api/v1/ready');
    expect(res.status).toBe(503);
    expect(res.body.data).toEqual({
      status: 'unavailable',
      checks: { mongo: 'fail', outra: 'ok' },
    });
  });

  it('200 sem nenhuma dependência registrada', async () => {
    const res = await request(createApp(env, logger)).get('/api/v1/ready');
    expect(res.status).toBe(200);
  });
});

describe('rotas inexistentes', () => {
  it('retornam o formato de erro padrão', async () => {
    const res = await request(createApp(env, logger)).get('/api/v1/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
  });
});
