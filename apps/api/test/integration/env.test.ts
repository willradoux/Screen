import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('usa padrões e deriva CORS de WEB_URL', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(3000);
    expect(env.corsOrigins).toEqual(['http://localhost:5173']);
  });

  it('rejeita valores inválidos', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Variáveis de ambiente inválidas/);
  });

  it('aceita várias origens', () => {
    expect(loadEnv({ CORS_ORIGINS: 'https://a.com, https://b.com' }).corsOrigins).toHaveLength(2);
  });
});
