import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PreferencesPage } from '../pages/PreferencesPage';
import { readTheme } from '../lib/theme';
import { canShareScreen, isMobileDevice } from '../lib/media';
import { Sheet } from './Sheet';

describe('Sheet (folhas de ajustes)', () => {
  it('fecha pelo botão, por Esc e tocando fora', async () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Ajustes" onClose={onClose}>
        <p>conteúdo</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('clicar dentro da folha não fecha', async () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Ajustes" onClose={onClose}>
        <button type="button">dentro</button>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'dentro' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('trava a rolagem da página enquanto aberta e libera ao fechar', () => {
    const { unmount } = render(
      <Sheet title="Ajustes" onClose={() => undefined}>
        x
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('tema', () => {
  it('o padrão é o claro, mesmo se o sistema estiver no escuro', () => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(readTheme()).toBe('light');
    vi.unstubAllGlobals();
  });

  it('escolher o escuro nas preferências vale e fica salvo', async () => {
    localStorage.clear();
    render(<PreferencesPage />);
    expect(screen.getByRole('radio', { name: /Claro/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: /Escuro/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(readTheme()).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: /Claro/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('compartilhar tela', () => {
  const setUa = (ua: string, extra: object = {}) =>
    vi.stubGlobal('navigator', {
      userAgent: ua,
      maxTouchPoints: 0,
      mediaDevices: { getDisplayMedia: () => undefined },
      ...extra,
    });

  it('celular Android e iPhone: indisponível, mesmo com a função existindo', () => {
    setUa('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36');
    expect(isMobileDevice()).toBe(true);
    expect(canShareScreen()).toBe(false);
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1');
    expect(canShareScreen()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('iPad que se apresenta como Mac também', () => {
    setUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', { maxTouchPoints: 5 });
    expect(isMobileDevice()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('computador: disponível', () => {
    setUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36');
    expect(isMobileDevice()).toBe(false);
    expect(canShareScreen()).toBe(true);
    vi.unstubAllGlobals();
  });
});
