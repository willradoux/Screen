import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PersonMenu } from './PersonMenu';

describe('PersonMenu (menu da pessoa no palco)', () => {
  const base = {
    at: { x: 10, y: 10 },
    name: 'Beto',
    identity: 'beto',
  };

  it('mostra o volume e o mudo só para você', () => {
    render(<PersonMenu {...base} actions={[]} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Opções de Beto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mutar Beto só para mim' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('roda a ação escolhida e fecha', () => {
    const onPin = vi.fn();
    const onClose = vi.fn();
    render(
      <PersonMenu
        {...base}
        actions={[{ icon: 'keep', label: 'Fixar em destaque', onSelect: onPin }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fixar em destaque' }));
    expect(onPin).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('fecha com Esc e com clique fora', () => {
    const onClose = vi.fn();
    render(<PersonMenu {...base} actions={[]} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
