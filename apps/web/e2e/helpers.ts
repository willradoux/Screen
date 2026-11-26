import { expect, type Page } from '@playwright/test';

export const API = process.env.E2E_API ?? 'http://localhost:3000';

/** As pessoas e a call do modo dev (apps/api/src/dev/personas.ts). */
export const WILL = '910000000000000001';
export const BETO = '910000000000000003';
export const CALL_GERAL = '900000000000000021';

/** Põe (ou tira) alguém na call do "Discord" de mentira: abre a live como no Discord. */
export async function voice(page: Page, user: string, channel: string | null) {
  const url = `${API}/api/v1/dev/voice?user=${user}${channel ? `&channel=${channel}` : ''}`;
  const res = await page.request.get(url, { maxRedirects: 0 });
  expect([200, 303]).toContain(res.status());
}

/** Entra como uma das pessoas de mentira e volta para `to`. */
export async function loginAs(page: Page, name: string, to = '/') {
  await page.goto(`${API}/api/v1/auth/discord?redirect=${encodeURIComponent(to)}`);
  await page.getByRole('link', { name: `Entrar como ${name}` }).click();
  await page.waitForURL((u) => !u.href.startsWith(API));
  await skipIntro(page);
}

/** A abertura (o bonequinho) some com qualquer tecla. */
export async function skipIntro(page: Page) {
  await page.waitForTimeout(300);
  await page.keyboard.press('Shift');
}

type Box = { x: number; y: number; width: number; height: number };

/** Duas caixas se cruzam (com 1 px de folga para bordas encostadas). */
export function overlaps(a: Box, b: Box) {
  return (
    a.x + 1 < b.x + b.width &&
    b.x + 1 < a.x + a.width &&
    a.y + 1 < b.y + b.height &&
    b.y + 1 < a.y + a.height
  );
}

/** Nada sai da largura da tela (sem rolagem para o lado). */
export async function expectNoSideScroll(page: Page) {
  const extra = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(extra).toBeLessThanOrEqual(0);
}
