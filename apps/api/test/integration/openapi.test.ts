import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildOpenApi } from '../../src/openapi.js';
import { buildRoomsApp } from '../fixtures/rooms-fakes.js';

const { app } = buildRoomsApp();

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

  it('todas as rotas e métodos da spec existem no app', async () => {
    const paths = buildOpenApi().paths as Record<string, Record<string, unknown>>;
    for (const [path, methods] of Object.entries(paths)) {
      for (const method of Object.keys(methods)) {
        const call = (request(app) as unknown as Record<string, (p: string) => request.Test>)[
          method
        ];
        const res = await call!(`/api/v1${path.replace('{id}', 'x'.repeat(22))}`);
        // Rota inexistente responde ROUTE_NOT_FOUND; qualquer outra resposta prova que existe.
        expect(res.body?.error?.code, `${method.toUpperCase()} ${path}`).not.toBe(
          'ROUTE_NOT_FOUND',
        );
      }
    }
  });
});
