import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // O e2e grava rastros em e2e/.results: o dev server não vigia (no Windows o arquivo fica
  // travado e derrubava o vite).
  server: { port: 5173, watch: { ignored: ['**/e2e/.results/**', '**/test-results/**'] } },
  test: {
    environment: 'jsdom',
    // Os testes de ponta a ponta (e2e/) rodam no Playwright, não aqui.
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    // Telas com a sala inteira montada passam de 5 s em máquina lenta ou ocupada (falhava ao acaso).
    testTimeout: 15_000,
  },
});
