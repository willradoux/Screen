import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TrackPublication } from 'livekit-client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastViewport, useToasts } from '../components/Toasts';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Stage } from '../room/Stage';
import type { Tile } from '../room/useParticipants';
import { apiError, makeMeeting, makeRoom } from '../test/helpers';
import { HomePage } from './HomePage';
import { MeetingsPage } from './MeetingsPage';

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
afterEach(() => vi.useRealTimers());

describe('HomePage', () => {
  it('lista as salas com status, ocupação e link para entrar', async () => {
    vi.spyOn(api.rooms, 'list').mockResolvedValue({
      data: [
        makeRoom({ id: 'AAAAAAAAAAAAAAAAAAAAAA', title: 'Live - Live 1', participantCount: 1 }),
        makeRoom({ id: 'BBBBBBBBBBBBBBBBBBBBBB', title: 'Live - Live 2', participantCount: 4 }),
      ],
      page: { next: null, limit: 50 },
    });
    inRouter(<HomePage />);

    expect(await screen.findByText('Live - Live 1')).toBeInTheDocument();
    expect(screen.getAllByText('Ao vivo')).toHaveLength(2);
    expect(screen.getByText(/1\/25 pessoa\b/)).toBeInTheDocument();
    expect(screen.getByText(/4\/25 pessoas/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Entrar' });
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/r/AAAAAAAAAAAAAAAAAAAAAA',
      '/r/BBBBBBBBBBBBBBBBBBBBBB',
    ]);
  });

  it('sem salas: explica como abrir uma', async () => {
    vi.spyOn(api.rooms, 'list').mockResolvedValue({ data: [], page: { next: null, limit: 50 } });
    inRouter(<HomePage />);
    expect(await screen.findByText(/Nenhuma sala aberta agora/)).toBeInTheDocument();
    expect(screen.getByText(/canal de voz da categoria de lives/i)).toBeInTheDocument();
  });

  it('erro: mostra o motivo; "Atualizar" tenta de novo', async () => {
    const list = vi.spyOn(api.rooms, 'list').mockRejectedValueOnce(apiError(0, 'NETWORK_ERROR'));
    inRouter(<HomePage />);
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();

    list.mockResolvedValue({
      data: [makeRoom({ title: 'Live - Live 3' })],
      page: { next: null, limit: 50 },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('Live - Live 3')).toBeInTheDocument();
  });
});

describe('MeetingsPage', () => {
  it('destaca a próxima reunião com contagem regressiva e lembretes', async () => {
    const soon = new Date(Date.now() + 3 * 3_600_000 + 5 * 60_000).toISOString();
    vi.spyOn(api.meetings, 'list').mockResolvedValue([
      makeMeeting({ id: 'AAAAAAAAAAAAAAAAAAAAAA', title: 'Reunião de hoje', startsAt: soon }),
      makeMeeting({ id: 'BBBBBBBBBBBBBBBBBBBBBB', title: 'Reunião aberta', status: 'OPEN' }),
    ]);
    inRouter(<MeetingsPage />);

    expect(await screen.findByText('Próxima reunião')).toBeInTheDocument();
    expect(screen.getByText(/começa em 3 h/)).toBeInTheDocument();
    expect(screen.getByText(/Lembretes no Discord: 1 d, 1 h, 5 min antes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/r/BBBBBBBBBBBBBBBBBBBBBB',
    );
  });

  it('sem reuniões e com erro', async () => {
    vi.spyOn(api.meetings, 'list').mockResolvedValueOnce([]);
    const { unmount } = inRouter(<MeetingsPage />);
    expect(await screen.findByText('Nenhuma reunião agendada.')).toBeInTheDocument();
    unmount();

    vi.spyOn(api.meetings, 'list').mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
    inRouter(<MeetingsPage />);
    expect(await screen.findByText(/Erro interno/)).toBeInTheDocument();
  });
});

describe('useAsync', () => {
  it('ignora a resposta de uma chamada antiga quando há uma mais nova', async () => {
    let resolveFirst!: (v: string) => void;
    const loader = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce('segunda');
    const { result } = renderHook(() => useAsync(loader));

    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.state).toEqual({ status: 'ready', data: 'segunda' });

    await act(async () => resolveFirst('primeira (velha)'));
    expect(result.current.state).toEqual({ status: 'ready', data: 'segunda' });
  });
});

describe('Toasts', () => {
  function Demo() {
    const t = useToasts(1000);
    return (
      <>
        <button onClick={() => t.info('tudo certo')}>info</button>
        <button onClick={() => t.error('deu ruim')}>erro</button>
        <ToastViewport toasts={t.toasts} onDismiss={t.dismiss} />
      </>
    );
  }

  it('aparece, tem papel de alerta quando é erro, fecha no X e some sozinho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Demo />);

    await user.click(screen.getByText('info'));
    expect(screen.getByRole('status')).toHaveTextContent('tudo certo');
    await user.click(screen.getByText('erro'));
    expect(screen.getByRole('alert')).toHaveTextContent('deu ruim');

    await user.click(within(screen.getByRole('status')).getByRole('button', { name: /fechar/i }));
    expect(screen.queryByText('tudo certo')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.queryByText('deu ruim')).not.toBeInTheDocument();
  });

  it('guarda no máximo 4 avisos de uma vez', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    for (let i = 0; i < 6; i++) await user.click(screen.getByText('info'));
    expect(screen.getAllByRole('status')).toHaveLength(4);
  });
});

describe('Stage (layout dos vídeos)', () => {
  const pub = () =>
    ({
      track: { attach: vi.fn(), detach: vi.fn() },
      isMuted: false,
    }) as unknown as TrackPublication;
  const tile = (over: Partial<Tile> = {}): Tile => ({
    identity: 'a',
    name: 'Ana',
    role: 'MEMBER',
    avatarUrl: null,
    isLocal: false,
    isSpeaking: false,
    micOn: true,
    cameraPub: undefined,
    screenPub: undefined,
    ...over,
  });

  it('sem tela compartilhada: grade com todo mundo, e avatar quando não há câmera', () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana' }),
          tile({ identity: 'b', name: 'Beto', isLocal: true }),
        ]}
      />,
    );
    expect(screen.getAllByTestId('tile')).toHaveLength(2);
    expect(screen.queryByTestId('screen-tile')).not.toBeInTheDocument();
    expect(screen.getByText('Beto (você)')).toBeInTheDocument();
  });

  it('quem fala ganha destaque', () => {
    render(<Stage tiles={[tile({ isSpeaking: true })]} />);
    expect(screen.getByTestId('tile')).toHaveAttribute('data-speaking', 'true');
  });

  it('mostra papel de moderação e estado do microfone', () => {
    render(<Stage tiles={[tile({ role: 'MOD', micOn: false })]} />);
    expect(screen.getByText('Moderador')).toBeInTheDocument();
    expect(screen.getByText('Microfone desligado')).toBeInTheDocument();
  });

  it('com tela compartilhada: a tela vira o destaque e as pessoas ficam numa faixa', () => {
    const camera = pub();
    const screenShare = pub();
    render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', screenPub: screenShare }),
          tile({ identity: 'b', name: 'Beto', cameraPub: camera }),
        ]}
      />,
    );
    expect(screen.getByTestId('screen-tile')).toHaveTextContent('Tela de Ana');
    expect(screen.getAllByTestId('tile')).toHaveLength(2); // todos continuam visíveis
    // o vídeo é ligado ao elemento <video> (e fica mudo: o áudio vai à parte)
    expect(vi.mocked(screenShare.track!.attach)).toHaveBeenCalled();
    expect(vi.mocked(camera.track!.attach)).toHaveBeenCalled();
    expect(screen.getByLabelText('Tela de Ana')).toHaveProperty('muted', true);
  });

  it('duas telas: as duas aparecem', () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', screenPub: pub() }),
          tile({ identity: 'b', name: 'Beto', screenPub: pub() }),
        ]}
      />,
    );
    expect(screen.getAllByTestId('screen-tile')).toHaveLength(2);
  });

  it('solta o vídeo do elemento quando o componente sai da tela', () => {
    const camera = pub();
    const { unmount } = render(<Stage tiles={[tile({ cameraPub: camera })]} />);
    unmount();
    expect(vi.mocked(camera.track!.detach)).toHaveBeenCalled();
  });
});
