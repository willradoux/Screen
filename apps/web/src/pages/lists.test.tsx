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

  it('o mesmo aviso não aparece repetido', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    for (let i = 0; i < 6; i++) await user.click(screen.getByText('info'));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('guarda no máximo 4 avisos diferentes de uma vez', async () => {
    function Many() {
      const t = useToasts(1000);
      let n = 0;
      return (
        <>
          <button onClick={() => t.info(`aviso ${++n}-${Math.random()}`)}>novo</button>
          <ToastViewport toasts={t.toasts} onDismiss={t.dismiss} />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Many />);
    for (let i = 0; i < 6; i++) await user.click(screen.getByText('novo'));
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
    canPublish: false,
    micOn: true,
    cameraPub: undefined,
    screenPub: undefined,
    screenPublished: false,
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

  it('palco ligado e vazio: avisa, mostra a plateia e o admin pode subir a si mesmo', async () => {
    const onStageSelf = vi.fn();
    render(
      <Stage
        lectureMode
        onStageSelf={onStageSelf}
        tiles={[tile({ identity: 'a' }), tile({ identity: 'b' }), tile({ identity: 'c' })]}
      />,
    );
    expect(screen.getByTestId('empty-stage')).toHaveTextContent('O palco está vazio.');
    expect(screen.getByTestId('audience-count')).toHaveTextContent('Na plateia: 3 pessoas');
    await userEvent.click(screen.getByRole('button', { name: 'Subir ao palco' }));
    expect(onStageSelf).toHaveBeenCalled();
  });

  it('palco ligado: só aparece quem está no palco; a plateia vira número', () => {
    render(
      <Stage
        lectureMode
        tiles={[
          tile({ identity: 'a', name: 'Palestrante', canPublish: true }),
          ...Array.from({ length: 200 }, (_, i) => tile({ identity: `p${i}`, name: `P${i}` })),
        ]}
      />,
    );
    expect(screen.getAllByTestId('tile')).toHaveLength(1);
    expect(screen.getByTestId('audience-count')).toHaveTextContent('Na plateia: 200 pessoas');
  });

  it('sala comum (8 pessoas, quase todas só ouvindo): todo mundo aparece no palco', () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'cam', cameraPub: pub() }),
          ...Array.from({ length: 7 }, (_, i) => tile({ identity: `q${i}`, micOn: false })),
        ]}
      />,
    );
    expect(screen.getAllByTestId('tile')).toHaveLength(8);
    expect(screen.queryByTestId('audience-count')).not.toBeInTheDocument();
  });

  it('sala grande sem palco: só quem transmite ou fala ganha quadrado', () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'cam', cameraPub: pub(), micOn: false }),
          ...Array.from({ length: 40 }, (_, i) => tile({ identity: `q${i}`, micOn: false })),
        ]}
      />,
    );
    expect(screen.getAllByTestId('tile')).toHaveLength(1);
    expect(screen.getByTestId('audience-count')).toHaveTextContent('Só ouvindo: 40 pessoas');
  });

  it('fixar põe a pessoa em destaque; fixar de novo solta', async () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', cameraPub: pub() }),
          tile({ identity: 'b', name: 'Beto', cameraPub: pub() }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fixar Beto' }));
    expect(screen.getByRole('button', { name: 'Desafixar Beto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByTestId('tile')).toHaveLength(2); // Beto grande + Ana na faixa
    await userEvent.click(screen.getByRole('button', { name: 'Desafixar Beto' }));
    expect(screen.getByRole('button', { name: 'Fixar Beto' })).toBeInTheDocument();
  });

  it('fixar quem compartilha tela mostra a tela dele como destaque', async () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', screenPub: pub() }),
          tile({ identity: 'b', name: 'Beto', screenPub: pub() }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fixar tela de Beto' }));
    // A tela fixada fica grande; a da Ana vai para a faixa (dá para fixar dali também).
    const big = document.querySelector('.stage-focus > .stage-cell')!;
    expect(big).toHaveTextContent('Tela de Beto');
  });

  it('dá para fixar a câmera de quem compartilha a tela (e não a tela)', async () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', cameraPub: pub() }),
          tile({ identity: 'b', name: 'Beto', cameraPub: pub(), screenPub: pub() }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fixar Beto' }));
    const big = document.querySelector('.stage-focus > .stage-cell')!;
    expect(big.querySelector('[data-testid=tile]')).toHaveTextContent('Beto');
    expect(screen.getByRole('button', { name: 'Desafixar Beto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fixar tela de Beto' })).toBeInTheDocument();
  });

  it('automático: a tela tem prioridade; sem tela, quem está falando fica grande', () => {
    const { rerender } = render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', cameraPub: pub() }),
          tile({ identity: 'b', name: 'Beto', cameraPub: pub(), isSpeaking: true }),
        ]}
      />,
    );
    const big = () => document.querySelector('.stage-focus > .stage-cell')!;
    expect(big()).toHaveTextContent('Beto');
    rerender(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', cameraPub: pub(), screenPub: pub() }),
          tile({ identity: 'b', name: 'Beto', cameraPub: pub(), isSpeaking: true }),
        ]}
      />,
    );
    expect(big()).toHaveTextContent('Tela de Ana');
  });

  it('zoom só na tela dos outros: quem compartilha não tem zoom na própria tela', () => {
    render(
      <Stage
        layout="mosaic"
        tiles={[
          tile({ identity: 'me', name: 'Eu', isLocal: true, screenPub: pub() }),
          tile({ identity: 'b', name: 'Beto', screenPub: pub() }),
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Zoom na tela de Beto' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Zoom na tela de Eu' })).not.toBeInTheDocument();
  });

  it('tela cheia: abre um vídeo, troca pela miniatura e sai', async () => {
    render(
      <Stage
        tiles={[
          tile({ identity: 'a', name: 'Ana', cameraPub: pub(), screenPub: pub() }),
          tile({ identity: 'b', name: 'Beto', cameraPub: pub() }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tela cheia: tela de Ana' }));
    const main = () => document.querySelector('.stage-max-main')!;
    expect(main()).toHaveTextContent('Tela de Ana');
    const strip = screen.getByRole('group', { name: 'Trocar o vídeo da tela cheia' });
    await userEvent.click(within(strip).getByRole('button', { name: 'Ver em tela cheia: Beto' }));
    expect(main()).toHaveTextContent('Beto');
    await userEvent.click(screen.getByRole('button', { name: /Sair da tela cheia$/ }));
    expect(document.querySelector('.stage-max')).not.toBeInTheDocument();
  });

  it('a sua própria tela: aviso no lugar do vídeo (sem espelho infinito) e sem tela cheia', async () => {
    render(
      <Stage
        layout="mosaic"
        tiles={[
          tile({ identity: 'me', name: 'Eu', isLocal: true, screenPub: pub() }),
          tile({ identity: 'b', name: 'Beto', screenPub: pub() }),
        ]}
      />,
    );
    expect(screen.getByText('Você está compartilhando a sua tela')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tela de Eu')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tela cheia: tela de Eu' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tela cheia: tela de Beto' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(screen.getByLabelText('Tela de Eu')).toBeInTheDocument();
  });

  it('solta o vídeo do elemento quando o componente sai da tela', () => {
    const camera = pub();
    const { unmount } = render(<Stage tiles={[tile({ cameraPub: camera })]} />);
    unmount();
    expect(vi.mocked(camera.track!.detach)).toHaveBeenCalled();
  });
});
