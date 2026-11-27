import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

/*
 * Contraste de leitura em todos os temas, no escuro e no claro: todo texto visível precisa de
 * 4,5:1 com o fundo de verdade atrás dele (3:1 em texto grande). Nada de preto no preto nem de
 * cor clara no branco.
 */

const THEMES = ['screem', 'synthwave', 'sunset', 'acelera', 'gelo', 'classico'];
const PAGES = ['/', '/reunioes', '/preferencias', '/guia', '/admin', '/admin/reunioes'];

test('contraste de leitura em todos os temas, no escuro e no claro', async ({ page }, info) => {
  test.skip(info.project.name === 'celular', 'as cores são as mesmas no celular');
  test.setTimeout(240_000);
  await loginAs(page, 'Will');
  const problems: string[] = [];
  for (const mode of ['dark', 'light']) {
    for (const theme of THEMES) {
      await page.evaluate(
        ([t, m]) => {
          localStorage.setItem('screem-theme', t!);
          localStorage.setItem('screem-mode', m!);
          localStorage.setItem('screem-motion', 'off');
        },
        [theme, mode],
      );
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForTimeout(700);
        const bad = await page.evaluate(() => {
          const parse = (c: string) => {
            const m = c.match(/rgba?\(([^)]+)\)/);
            if (!m) return null;
            const [r = 0, g = 0, b = 0, a = 1] = m[1]!
              .split(/[ ,/]+/)
              .filter(Boolean)
              .map(Number);
            return [r, g, b, a];
          };
          const lum = ([r = 0, g = 0, b = 0]: number[]) => {
            const f = (v: number) => {
              const x = v / 255;
              return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const ratio = (a: number[], c: number[]) => {
            const [x = 0, y = 0] = [lum(a), lum(c)].sort((m, n) => n - m);
            return (x + 0.05) / (y + 0.05);
          };
          const bgOf = (el: Element) => {
            const stack: number[][] = [];
            for (let e: Element | null = el; e; e = e.parentElement) {
              const cs = getComputedStyle(e);
              if (cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url'))
                return null;
              const c = parse(cs.backgroundColor);
              if (c && c[3]! > 0) {
                stack.push(c);
                if (c[3]! >= 1) break;
              }
            }
            let out = [255, 255, 255];
            for (const c of stack.reverse())
              out = out.map((v, i) => v * (1 - c[3]!) + c[i]! * c[3]!);
            return out;
          };
          const res: string[] = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = n.textContent?.trim();
            const el = n.parentElement;
            if (!text || !el) continue;
            const cs = getComputedStyle(el);
            if (
              !el.getBoundingClientRect().width ||
              cs.visibility === 'hidden' ||
              Number(cs.opacity) < 0.5 ||
              el.closest('[aria-hidden="true"],.sr-only,[inert]')
            )
              continue;
            const fg = parse(cs.color);
            const bg = bgOf(el);
            if (!fg || !bg) continue;
            const col =
              fg[3]! < 1 ? fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!)) : fg;
            const size = parseFloat(cs.fontSize);
            const big = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
            const k = ratio(col, bg);
            if (k < (big ? 3 : 4.5)) res.push(`${k.toFixed(2)} "${text.slice(0, 30)}"`);
          }
          return [...new Set(res)];
        });
        for (const b of bad) problems.push(`${mode}/${theme}${path}: ${b}`);
      }
    }
  }
  await page.evaluate(() => {
    localStorage.setItem('screem-theme', 'screem');
    localStorage.setItem('screem-mode', 'dark');
    localStorage.removeItem('screem-motion');
  });
  expect(problems, problems.join('\n')).toEqual([]);
});
