import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { Recording } from '../../lib/types';
import { apiError } from '../../test/helpers';
import { RecordingControl } from '../../room/RecordingControl';
import { RecordingsPage, formatSize } from './RecordingsPage';

const rec = (over: Partial<Recording> = {}): Recording => ({
  id: 'R'.repeat(22),
  roomId: 'S'.repeat(22),
  title: 'Reunião mensal',
  mode: 'GRID',
  targetUserId: null,
  status: 'READY',
  error: null,
  sizeBytes: 50 * 1024 * 1024,
  durationSec: 3600,
  startedBy: '1',
  startedAt: '2026-11-08T15:00:00.000Z',
  endedAt: '2026-11-08T16:00:00.000Z',
  expiresAt: '2026-11-18T16:00:00.000Z',
  daysLeft: 10,
  downloaded: false,
  ...over,
});

describe('formatSize', () => {
  it('KB, MB e GB', () => {
    expect(formatSize(10 * 1024)).toBe('10 KB');
    expect(formatSize(50 * 1024 * 1024)).toBe('50.0 MB');
    expect(formatSize(2 * 1024 ** 3)).toBe('2.00 GB');
  });
});

describe('RecordingsPage', () => {
  it('lista com tamanho, prazo e link de download', async () => {
    vi.spyOn(api.recordings, 'list').mockResolvedValue([rec()]);
    render(<RecordingsPage />);
    expect(await screen.findByText('Reunião mensal')).toBeInTheDocument();
    expect(screen.getByText(/50.0 MB/)).toBeInTheDocument();
    expect(screen.getByText('Será apagada em 10 dias.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Baixar/ });
    expect(link.getAttribute('href')).toContain(`/recordings/${'R'.repeat(22)}/download`);
  });

  it('avisa quando falta pouco e quando já foi apagada', async () => {
    vi.spyOn(api.recordings, 'list').mockResolvedValue([
      rec({ daysLeft: 0 }),
      rec({ id: 'T'.repeat(22), status: 'EXPIRED', daysLeft: null, sizeBytes: 0 }),
    ]);
    render(<RecordingsPage />);
    expect(await screen.findByText('Será apagada hoje. Baixe agora.')).toBeInTheDocument();
    expect(screen.getByText('O prazo passou e o arquivo foi apagado.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Baixar/ })).toHaveLength(1);
  });

  it('apagar pede confirmação e só então chama a API', async () => {
    vi.spyOn(api.recordings, 'list').mockResolvedValue([rec()]);
    const remove = vi.spyOn(api.recordings, 'remove').mockResolvedValue();
    render(<RecordingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar' }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('R'.repeat(22)));
  });

  it('lista vazia e erro', async () => {
    vi.spyOn(api.recordings, 'list').mockResolvedValueOnce([]);
    const { unmount } = render(<RecordingsPage />);
    expect(await screen.findByText(/Nenhuma gravação ainda/)).toBeInTheDocument();
    unmount();
    vi.spyOn(api.recordings, 'list').mockRejectedValue(apiError(403, 'FORBIDDEN'));
    render(<RecordingsPage />);
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument();
  });
});

describe('RecordingControl', () => {
  const people = [{ userId: '222222222222222222', displayName: 'Beltrano' }] as never;

  function setup(recording = false) {
    const onInfo = vi.fn();
    const onError = vi.fn();
    render(
      <RecordingControl
        roomId={'S'.repeat(22)}
        recording={recording}
        people={people}
        onInfo={onInfo}
        onError={onError}
      />,
    );
    return { onInfo, onError };
  }

  it('começa a gravar a sala toda', async () => {
    const start = vi.spyOn(api.recordings, 'start').mockResolvedValue(rec({ status: 'RECORDING' }));
    const { onInfo } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Começar a gravar' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('S'.repeat(22), { mode: 'GRID' }));
    expect(onInfo).toHaveBeenCalled();
  });

  it('gravar uma pessoa exige escolher quem', async () => {
    const start = vi.spyOn(api.recordings, 'start').mockResolvedValue(rec());
    const { onError } = setup();
    await userEvent.selectOptions(
      screen.getByLabelText('O que gravar'),
      'Uma pessoa (rosto e voz)',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Começar a gravar' }));
    expect(onError).toHaveBeenCalledWith('Escolha de quem é a gravação.');
    expect(start).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText('Pessoa a gravar'), 'Beltrano');
    await userEvent.click(screen.getByRole('button', { name: 'Começar a gravar' }));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith('S'.repeat(22), {
        mode: 'PARTICIPANT',
        userId: '222222222222222222',
      }),
    );
  });

  it('gravando: mostra Parar e para a gravação em andamento', async () => {
    vi.spyOn(api.recordings, 'list').mockResolvedValue([
      rec({ status: 'RECORDING', roomId: 'S'.repeat(22) }),
    ]);
    const stop = vi.spyOn(api.recordings, 'stop').mockResolvedValue(rec({ status: 'PROCESSING' }));
    setup(true);
    expect(screen.queryByRole('button', { name: 'Começar a gravar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Parar gravação' }));
    await waitFor(() => expect(stop).toHaveBeenCalledWith('R'.repeat(22)));
  });

  it('erro do servidor aparece com a explicação', async () => {
    vi.spyOn(api.recordings, 'start').mockRejectedValue(apiError(502, 'RECORDING_FAILED'));
    const { onError } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Começar a gravar' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(within(document.body).queryByText('Começar a gravar')).toBeInTheDocument();
  });
});
