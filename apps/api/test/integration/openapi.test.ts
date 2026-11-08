import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { buildOpenApi } from '../../src/openapi.js';
import { createLogger } from '../../src/shared/logger.js';

const env = loadEnv({ NODE_ENV: 'test' });
const app = createApp(env, createLogger(env));

describe('OpenAPI', () => {
  it('openapi.json commitado está atualizado (rode: npm run openapi -w @screem/api)', () => {
    const committed = JSON.parse(
      readFileSync(new URL('../../openapi.json', import.meta.url), 'utf-8'),
    );
    expect(committed).toEqual(buildOpenApi());
  });

  it('GET /openapi.json serve a especificação', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/health', '/ready']));
  });

  it('GET /docs serve o Swagger UI com CSP própria', async () => {
    const res = await request(app).get('/api/v1/docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('todas as rotas da spec existem no app', async () => {
    for (const path of Object.keys(buildOpenApi().paths)) {
      const res = await request(app).get(`/api/v1${path}`);
      expect(res.status, path).not.toBe(404);
    }
  });
});
