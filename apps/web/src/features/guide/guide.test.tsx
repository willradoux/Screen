import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GuidePage } from './GuidePage';

/* O Guia dentro do site: passos por público e as perguntas comuns. */
describe('GuidePage', () => {
  it('abre para quem participa, com os passos numerados e as perguntas comuns', () => {
    render(<GuidePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guia' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pra quem participa' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const steps = within(screen.getByRole('region', { name: 'Pra quem participa' })).getAllByTestId(
      'step',
    );
    expect(steps.length).toBeGreaterThan(5);
    expect(steps[0]).toHaveTextContent(/^01/);
    expect(screen.getByText('Por que não consigo entrar numa live?')).toBeInTheDocument();
  });

  it('troca para moderação e para admins (sem o "N." no título do cartão)', async () => {
    render(<GuidePage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Pra moderação' }));
    const mod = screen.getByRole('region', { name: 'Pra moderação' });
    expect(within(mod).getByRole('heading', { name: 'Moderar uma reunião' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Pra admins' }));
    const admins = screen.getByRole('region', { name: 'Pra admins' });
    expect(within(admins).getByRole('heading', { name: 'Criar uma reunião' })).toBeInTheDocument();
  });
});
