import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('usa padrões e deriva CORS de WEB_URL', () => {
    const env = loadEnv({ NODE_ENV: 'test' });
    expect(env.PORT).toBe(3000);
    expect(env.corsOrigins).toEqual(['http://localhost:5173']);
  });

  it('rejeita valores inválidos', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', PORT: 'abc' })).toThrow(
      /Variáveis de ambiente inválidas/,
    );
  });

  it('aceita várias origens', () => {
    const env = loadEnv({ NODE_ENV: 'test', CORS_ORIGINS: 'https://a.com, https://b.com' });
    expect(env.corsOrigins).toHaveLength(2);
  });
});
