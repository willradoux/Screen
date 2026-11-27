import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}));

import { LandingPage } from './LandingPage';

beforeEach(() => localStorage.clear());

/** Abre a página, liga a TV sem som (o jsdom não tem áudio) e fecha o tutorial. */
async function openTv() {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
  expect(screen.getByRole('dialog', { name: 'Carregando o Screen' })).toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole('button', { name: 'entrar sem som' }, { timeout: 3000 }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Bora' }));
}

describe('LandingPage (/sobre): a TV', () => {
  it('carrega, liga a TV e abre no canal 1 com o título, o Discord e o GitHub', async () => {
    await openTv();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Canal 1: Início' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Liga a call/);
    expect(screen.getAllByRole('link', { name: /Entrar com Discord/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/willradoux/Screen',
    );
  });

  it('o tutorial aparece na primeira vez e volta pelo "?"', async () => {
    await openTv();
    expect(localStorage.getItem('screen-lp-tutorial')).toBe('ok');
    await userEvent.click(screen.getByRole('button', { name: 'Como usar esta página' }));
    const tut = screen.getByRole('dialog', { name: 'É uma TV. Troca de canal.' });
    expect(within(tut).getByText('Gire a rodinha')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('troca de canal pelos botões, pelas setas e pela rodinha da TV', async () => {
    await openTv();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo canal' }));
    expect(screen.getByRole('region', { name: 'Canal 2: Entra na call' })).toBeInTheDocument();
    // A galera da comunidade na call de exemplo.
    expect(screen.getByText('flazo')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('heading', { name: 'Tudo que a call precisa.' })).toBeInTheDocument();
    expect(screen.queryByText(/grava/i)).not.toBeInTheDocument();

    const knob = screen.getByRole('slider', { name: 'Seletor de canal' });
    expect(knob).toHaveAttribute('aria-valuenow', '6');
    knob.focus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(knob).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getByRole('heading', { name: 'Bora pra call?' })).toBeInTheDocument();
  });

  it('a TV tem controle de volume e mostra o volume na tela, como TV de verdade', async () => {
    await openTv();
    const volume = screen.getByRole('group', { name: 'Volume' });
    await userEvent.click(within(volume).getByRole('button', { name: 'Diminuir o volume' }));
    // Começa em 7 de 10; desceu um.
    expect(localStorage.getItem('screen-lp-volume')).toBe('6');
    expect(screen.getByText('SEM SOM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ligar o som' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
