import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateTimeField } from './DateTimeField';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="when">Quando</label>
      <DateTimeField id="when" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('DateTimeField (calendário do Screen)', () => {
  it('digitar "05/12/2099 20:00" vira o valor de datetime-local', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Quando'), '05/12/2099 20:00');
    expect(screen.getByTestId('value')).toHaveTextContent('2099-12-05T20:00');
  });

  it('escolhe dia, hora e minuto no calendário, em português', async () => {
    render(<Harness initial="2099-12-05T20:00" />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));
    const cal = screen.getByRole('dialog', { name: 'Escolher data e hora' });
    expect(cal).toHaveTextContent('dezembro 2099');
    await userEvent.click(within(cal).getByRole('button', { name: 'quinta, 10 de dezembro' }));
    await userEvent.click(within(cal).getByRole('button', { name: '9 horas' }));
    await userEvent.click(within(cal).getByRole('button', { name: '30 minutos' }));
    expect(screen.getByTestId('value')).toHaveTextContent('2099-12-10T09:30');
    expect(screen.getByLabelText('Quando')).toHaveValue('10/12/2099 09:30');
    await userEvent.click(within(cal).getByRole('button', { name: 'Próximo mês' }));
    expect(cal).toHaveTextContent('janeiro 2100');
  });

  it('"Abrir agora" limpa a data, e Esc fecha', async () => {
    render(<Harness initial="2099-12-05T20:00" />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir agora (sem data)' }));
    expect(screen.getByTestId('value')).toHaveTextContent('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
