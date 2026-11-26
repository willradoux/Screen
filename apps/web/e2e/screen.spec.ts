import { expect, test, type Page } from '@playwright/test';
import {
  BETO,
  CALL_GERAL,
  WILL,
  expectNoSideScroll,
  loginAs,
  overlaps,
  skipIntro,
  voice,
} from './helpers';

/*
 * O caminho principal de quem usa o Screen, do login até falar no chat da live, e as regras de
 * layout do design ("nada por cima de nada", sem rolagem para o lado).
 */

test.beforeEach(async ({ page }) => {
  // Will e Beto na call-geral: a live abre, como quando alguém entra na call do Discord.
  await voice(page, WILL, CALL_GERAL);
  await voice(page, BETO, CALL_GERAL);
});

/** Da lista de salas até dentro da live da call-geral. */
async function enterLive(page: Page) {
  await loginAs(page, 'Will');
  await page.getByTestId('room-row').filter({ hasText: 'call-geral' }).click();
  await expect(page.getByText(/Câmera, microfone e tela começam desligados/)).toBeVisible();
  await page.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(page.getByRole('toolbar', { name: 'Controles da sala' })).toBeVisible({
    timeout: 30_000,
  });
}

/** Abre o chat pela faixa de opções (no celular ela fica dentro de "Mais opções"). */
async function openChat(page: Page) {
  const more = page.getByRole('button', { name: 'Mais opções' });
  if (await more.isVisible()) await more.click();
  await page
    .getByRole('group', { name: 'Opções da sala' })
    .getByRole('button', { name: /^Chat/ })
    .click();
}

test('login: a frase, o único botão e o caminho para conhecer o Screen', async ({ page }) => {
  await page.goto('/login');
  await skipIntro(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'As calls do Acelera DEV, no navegador.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Entrar com Discord/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Conhecer o screen' })).toHaveAttribute(
    'href',
    '/sobre',
  );
  await expectNoSideScroll(page);
});

test('salas: a live aberta aparece com quem está na call', async ({ page }) => {
  await loginAs(page, 'Will');
  await expect(page.getByRole('heading', { level: 1, name: 'Salas' })).toBeVisible();
  const card = page.getByTestId('room-row').filter({ hasText: 'call-geral' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('com Will e Beto');
  await expectNoSideScroll(page);
});

test('sala: entrar, ver o topo, falar no chat, ver as pessoas e sair', async ({ page }) => {
  await enterLive(page);
  await expect(page.getByRole('heading', { level: 1, name: /call-geral/ })).toBeVisible();

  await openChat(page);
  const text = `teste e2e ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Mensagem para a sala' }).fill(text);
  await page.keyboard.press('Enter');
  await expect(page.getByText(text)).toBeVisible();

  // A aba Pessoas mostra quem está na sala.
  await page.getByRole('tab', { name: /Pessoas/ }).click();
  await expect(page.getByRole('complementary', { name: 'Pessoas' })).toContainText('Will');

  await expectNoSideScroll(page);
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await page.getByRole('button', { name: 'Sair da sala' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Salas' })).toBeVisible();
});

test('sala: nada por cima de nada (controles, faixa de ícones, topo e painel)', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'celular', 'no celular o painel é uma gaveta, de propósito');
  await enterLive(page);
  await openChat(page);

  const box = async (name: string, role: 'complementary' | 'group' | 'toolbar' | 'top') => {
    // O topo da sala é um <header> dentro do <main> do site (não vira "banner").
    const b = await (
      role === 'top' ? page.locator('.call-top') : page.getByRole(role, { name })
    ).boundingBox();
    expect(b, name).not.toBeNull();
    return b!;
  };
  const controls = await box('Controles da sala', 'toolbar');
  const panel = await box('Chat', 'complementary');
  const rail = await box('Opções da sala', 'group');
  const top = await box('Topo', 'top');
  expect(overlaps(controls, panel), 'controles x painel').toBe(false);
  expect(overlaps(controls, rail), 'controles x faixa').toBe(false);
  expect(overlaps(controls, top), 'controles x topo').toBe(false);
  expect(overlaps(panel, top), 'painel x topo').toBe(false);

  // Convidar copia o link da sala.
  await page.getByRole('button', { name: 'Convidar' }).click();
  await expect(page.getByText('Link da sala copiado.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});
