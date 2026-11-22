import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}));

import { LandingPage } from './LandingPage';

describe('LandingPage (/sobre)', () => {
  it('apresenta o Screen, mostra a TV com os passos e chama para entrar com o Discord', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Liga a call/);
    expect(screen.getAllByRole('link', { name: /Entrar com Discord/ }).length).toBeGreaterThan(0);

    // Os passos embaixo da TV trocam o canal.
    const steps = screen.getByRole('list', { name: 'Como usar o Screen' });
    expect(steps).toHaveTextContent('O bot manda o link');
    const bot = screen.getByRole('button', { name: /O bot manda o link/ });
    await userEvent.click(bot);
    expect(bot).toHaveAttribute('aria-current', 'step');

    expect(screen.getByRole('heading', { name: 'Modo palco' })).toBeInTheDocument();
    // Sem gravação (saiu da interface).
    expect(screen.queryByText(/grava/i)).not.toBeInTheDocument();
  });
});
