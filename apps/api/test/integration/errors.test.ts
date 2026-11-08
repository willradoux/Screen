import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { errorHandler } from '../../src/shared/error-handler.js';
import { AppError, forbidden } from '../../src/shared/errors.js';
import { createLogger } from '../../src/shared/logger.js';
import { getValidated, validate } from '../../src/shared/validate.js';

const env = loadEnv({ NODE_ENV: 'test' });
const logger = createLogger(env);

describe('JSON inválido e payload grande (app real)', () => {
  const app = createApp(env, logger);

  it('JSON malformado -> 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{ nao eh json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('corpo acima de 100kb -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(150_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('validate() e tratamento de erros', () => {
  const schemas = {
    body: z.object({ title: z.string().min(3) }),
    query: z.object({ limit: z.coerce.number().int().max(50).default(20) }),
    params: z.object({ id: z.string().min(1) }),
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = { error: () => {} };
    next();
  });
  app.post('/t/:id', validate(schemas), (req, res) => {
    const v = getValidated(res, schemas);
    res.json({ title: v.body.title, limit: v.query.limit, id: v.params.id });
  });
  app.get('/proibido', (_req, _res, next) => next(forbidden()));
  app.get('/boom', () => {
    throw new Error('segredo interno');
  });
  app.get('/custom', (_req, _res, next) =>
    next(new AppError('ROOM_FULL', 409, 'Sala lotada.', { max: 25 })),
  );
  app.use(errorHandler);

  it('aceita dados válidos e aplica coerção/padrões', async () => {
    const res = await request(app).post('/t/abc').send({ title: 'Reunião' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: 'Reunião', limit: 20, id: 'abc' });
  });

  it('rejeita dados inválidos com VALIDATION_ERROR e lista de campos', async () => {
    const res = await request(app).post('/t/abc?limit=999').send({ title: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields.map((f: { path: string }) => f.path)).toEqual(['title']);
  });

  it('AppError mantém código, status e details', async () => {
    const res = await request(app).get('/custom');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'ROOM_FULL', details: { max: 25 } });
  });

  it('forbidden() -> 403 FORBIDDEN', async () => {
    const res = await request(app).get('/proibido');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('erro desconhecido vira INTERNAL_ERROR sem vazar detalhes', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('segredo interno');
  });
});
