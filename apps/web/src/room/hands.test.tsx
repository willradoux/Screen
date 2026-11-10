import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QrCode } from '../components/QrCode';
import { api } from '../lib/api';
import { makeParticipant, makeRoom } from '../test/helpers';
import { ParticipantsPanel } from './ParticipantsPanel';

const hand = (id: string, name: string) => ({
  userId: id,
  displayName: name,
  avatarUrl: null,
  at: '2026-11-08T15:00:00.000Z',
});

describe('fila de pedir a palavra', () => {
  function setup(
    role: 'MEMBER' | 'MOD' | 'ADMIN',
    hands = [hand('222222222222222222', 'Beltrano')],
  ) {
    vi.spyOn(api.rooms, 'participants').mockResolvedValue([makeParticipant()]);
    return render(
      <ParticipantsPanel
        room={makeRoom({ type: 'MEETING' })}
        me={{ id: '111111111111111111', role }}
        version={0}
        lectureMode={true}
        hands={hands}
        onInfo={() => undefined}
        onError={() => undefined}
      />,
    );
  }

  it('moderador vê a fila, mas só o admin sobe ao palco', async () => {
    setup('MOD');
    expect(await screen.findByText('Querem falar (1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir ao palco' })).not.toBeInTheDocument();
  });

  it('admin vê a fila e sobe a pessoa ao palco', async () => {
    const promote = vi.spyOn(api.moderation, 'promote').mockResolvedValue();
    setup('ADMIN');
    expect(await screen.findByText('Querem falar (1)')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByTestId('hand')).getByRole('button', { name: 'Subir ao palco' }),
    );
    await waitFor(() =>
      expect(promote).toHaveBeenCalledWith(expect.any(String), '222222222222222222'),
    );
  });

  it('membro não vê a fila', async () => {
    setup('MEMBER');
    await screen.findByTestId('person');
    expect(screen.queryByText(/Querem falar/)).not.toBeInTheDocument();
  });

  it('fila vazia não mostra a seção', async () => {
    setup('MOD', []);
    await screen.findByTestId('person');
    expect(screen.queryByText(/Querem falar/)).not.toBeInTheDocument();
  });
});

describe('QrCode', () => {
  it('gera o QR code da sala no navegador', async () => {
    render(<QrCode value="https://screen.exemplo.com/r/abc" />);
    const img = await screen.findByRole('img', { name: /QR code/i });
    expect(img.querySelector('svg')).not.toBeNull();
  });
});
