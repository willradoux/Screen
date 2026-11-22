import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}));

import { LandingPage } from './LandingPage';

/** Abre a página e liga a TV sem som (o jsdom não tem áudio). */
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
}

describe('LandingPage (/sobre): a TV', () => {
  it('carrega, liga a TV e abre no canal 1 com o título e o botão do Discord', async () => {
    await openTv();
    expect(screen.queryByRole('dialog', { name: 'Carregando o Screen' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Canal 1: Início' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Liga a call/);
    expect(screen.getAllByRole('link', { name: /Entrar com Discord/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Ligar o som' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('troca de canal pelos botões, pelo guia, pelas setas e pela rodinha da TV', async () => {
    await openTv();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo canal' }));
    expect(screen.getByRole('region', { name: 'Canal 2: Entra na call' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Canal 6: Recursos' }));
    expect(screen.getByRole('heading', { name: 'Tudo que a call precisa.' })).toBeInTheDocument();
    expect(screen.queryByText(/grava/i)).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: 'Dúvidas rápidas' })).toBeInTheDocument();

    // A rodinha é um seletor: com foco, as setas giram um canal por vez.
    const knob = screen.getByRole('slider', { name: 'Seletor de canal' });
    expect(knob).toHaveAttribute('aria-valuenow', '7');
    knob.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(knob).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getByRole('heading', { name: 'Bora pra call?' })).toBeInTheDocument();
  });
});
