import { defineConfig, devices } from '@playwright/test';

/*
 * Testes de ponta a ponta: o site de verdade num navegador de verdade, contra a API no modo dev
 * (Discord de mentira). Antes de rodar, suba o ambiente (docs/desenvolvimento-local.md):
 *
 *   docker compose -f infra/docker-compose.dev.yml up -d
 *   npm run dev:fake -w apps/api
 *   npm run dev -w apps/web
 *   npm run e2e -w apps/web
 *
 * E2E_WEB e E2E_API trocam os endereços (padrão: localhost:5173 e localhost:3000). Usa o Chrome
 * instalado no computador (sem baixar navegador); E2E_CHANNEL=chromium usa o do Playwright.
 */
const channel = process.env.E2E_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // As pessoas de mentira e a call são as mesmas para todos os testes: um de cada vez.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: {
    baseURL: process.env.E2E_WEB ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'computador',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel },
    },
    {
      name: 'celular',
      use: { ...devices['Pixel 7'], channel },
    },
  ],
});
