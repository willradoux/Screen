import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}));

import { LandingPage } from './LandingPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );

describe('LandingPage (/sobre): a TV', () => {
  it('abre no canal 1 com o título e o botão do Discord', () => {
    renderPage();
    expect(screen.getByRole('region', { name: 'Canal 1: Início' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Liga a call/);
    expect(screen.getAllByRole('link', { name: /Entrar com Discord/ }).length).toBeGreaterThan(0);
  });

  it('troca de canal pelos botões da TV, pelo guia e pelas setas do teclado', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo canal' }));
    expect(screen.getByRole('region', { name: 'Canal 2: Entra na call' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Canal 6: Recursos' }));
    expect(screen.getByRole('heading', { name: 'Tudo que a call precisa.' })).toBeInTheDocument();
    expect(screen.queryByText(/grava/i)).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: 'Dúvidas rápidas' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Canal anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Canal 1: Início' }));
    await userEvent.click(screen.getByRole('button', { name: 'Canal anterior' }));
    // Dá a volta: do 1 vai para o último.
    expect(screen.getByRole('heading', { name: 'Bora pra call?' })).toBeInTheDocument();
  });
});
