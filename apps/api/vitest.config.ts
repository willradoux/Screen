import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    // Sobe um MongoDB em memória uma vez para os testes de test/db.
    globalSetup: ['test/db/global-setup.ts'],
    testTimeout: 30_000,
  },
});
