import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ZoomPan } from './ZoomPan';

describe('ZoomPan (zoom na tela de outra pessoa)', () => {
  it('aproxima, afasta e volta ao tamanho original pelos botões', async () => {
    render(
      <ZoomPan name="tela de Beto">
        <span>vídeo</span>
      </ZoomPan>,
    );
    const group = screen.getByRole('group', { name: 'Zoom na tela de Beto' });
    expect(group).toHaveTextContent('100%');
    expect(screen.getByRole('button', { name: 'Afastar' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Aproximar' }));
    expect(group).toHaveTextContent('150%');
    await userEvent.click(screen.getByRole('button', { name: 'Aproximar' }));
    expect(group).toHaveTextContent('225%');
    await userEvent.click(screen.getByRole('button', { name: 'Afastar' }));
    expect(group).toHaveTextContent('150%');

    await userEvent.click(screen.getByRole('button', { name: 'Tamanho original' }));
    expect(group).toHaveTextContent('100%');
  });
});
