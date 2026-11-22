import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}));

import { LandingPage } from './LandingPage';

describe('LandingPage (/sobre)', () => {
  it('apresenta o Screen, explica os passos e chama para entrar com o Discord', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Sua call do Discord/);
    expect(screen.getAllByRole('link', { name: /Entrar com Discord/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'O bot manda o link' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Modo palco' })).toBeInTheDocument();
    // Sem gravação (saiu da interface).
    expect(screen.queryByText(/grava/i)).not.toBeInTheDocument();
  });
});
