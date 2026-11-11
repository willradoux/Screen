import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FeaturesPage } from './FeaturesPage';

const setup = () =>
  render(
    <MemoryRouter>
      <FeaturesPage />
    </MemoryRouter>,
  );

describe('FeaturesPage', () => {
  it('abre na aba "O que tem", sem exigir login, com os recursos principais', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Transmita tela/);
    expect(screen.getAllByTestId('feature').length).toBeGreaterThanOrEqual(10);
    for (const t of ['Gravação de reuniões', 'Pedir a palavra', 'Economia de recursos']) {
      expect(screen.getByRole('heading', { name: t })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: 'O que tem' })).toHaveAttribute('aria-selected', 'true');
  });

  it('troca para o tutorial dos membros e dos admins', async () => {
    setup();
    await userEvent.click(screen.getByRole('tab', { name: 'Tutorial para membros' }));
    const members = screen.getByRole('region', { name: 'Tutorial para membros' });
    expect(within(members).getAllByTestId('step').length).toBeGreaterThan(5);
    expect(within(members).getByText(/Compartilhar tela: só no computador/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Tutorial para admins' }));
    const admins = screen.getByRole('region', { name: 'Tutorial para admins' });
    expect(within(admins).getByText(/Gravar uma reunião/)).toBeInTheDocument();
    expect(within(admins).getByText(/10 dias/, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByTestId('feature')).not.toBeInTheDocument();
  });

  it('tem botão para entrar e o seletor de tema', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: /tema/i })).toBeInTheDocument();
  });
});
