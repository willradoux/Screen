import { jsx as _jsx } from "react/jsx-runtime";
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ROOM_ID, apiError, makeParticipant, makeRoom, makeUser, mockMe, renderWithApp, } from '../test/helpers';
import { RoomPage } from './RoomPage';
// ---------- dublês de LiveKit e Socket.IO ----------
class FakeLocal {
    identity = '111111111111111111';
    name = 'Fulano';
    metadata = JSON.stringify({ role: 'MEMBER', avatarUrl: null });
    isLocal = true;
    isSpeaking = false;
    isMicrophoneEnabled = false;
    isCameraEnabled = false;
    isScreenShareEnabled = false;
    getTrackPublication() {
        return undefined;
    }
    on() { }
    off() { }
    setMicrophoneEnabled = vi.fn(async (v) => void (this.isMicrophoneEnabled = v));
    setCameraEnabled = vi.fn(async (v) => void (this.isCameraEnabled = v));
    setScreenShareEnabled = vi.fn(async (v) => void (this.isScreenShareEnabled = v));
}
class FakeLk {
    localParticipant = new FakeLocal();
    remoteParticipants = new Map();
    handlers = new Map();
    connect = vi.fn(async () => undefined);
    startAudio = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    on(event, fn) {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
        return this;
    }
    off() {
        return this;
    }
    fire(event) {
        this.handlers.get(event)?.forEach((fn) => fn());
    }
}
class FakeSocket {
    connected = true;
    handlers = new Map();
    emitted = [];
    subscribeAck = { ok: true };
    on(event, fn) {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
        return this;
    }
    emit(event, payload, ack) {
        this.emitted.push({ event, payload });
        ack?.(this.subscribeAck);
        return this;
    }
    removeAllListeners() {
        this.handlers.clear();
        return this;
    }
    disconnect = vi.fn(() => undefined);
    fire(event, payload) {
        act(() => this.handlers.get(event)?.forEach((fn) => fn(payload)));
    }
}
let lk;
let socket;
let deps;
const ME = makeUser({ id: '111111111111111111' });
const joinResult = (over = {}, lectureMode = false) => ({
    livekit: { url: 'wss://live.exemplo.com', token: 'tok-123' },
    participant: { identity: ME.id, name: 'Fulano', role: 'MEMBER' },
    permissions: {
        canPublish: true,
        canPublishSources: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
        canModerate: false,
        ...over,
    },
    room: { id: ROOM_ID, lectureMode, mediaState: 'ACTIVE' },
    sessionActivated: false,
});
const allowed = { canJoin: true, reason: null, hint: null };
function setup(opts = {}) {
    const user = opts.user ?? ME;
    mockMe(user);
    vi.spyOn(api.rooms, 'get').mockResolvedValue(opts.room ?? makeRoom());
    vi.spyOn(api.rooms, 'access').mockResolvedValue(opts.access ?? allowed);
    vi.spyOn(api.rooms, 'participants').mockResolvedValue([
        makeParticipant({ userId: user.id, displayName: 'Fulano', role: user.role }),
    ]);
    return renderWithApp(_jsx(RoomPage, { deps: deps }), { route: `/r/${ROOM_ID}`, path: '/r/:roomId' });
}
beforeEach(() => {
    lk = new FakeLk();
    socket = new FakeSocket();
    deps = {
        api,
        createLiveKitRoom: () => lk,
        createSocket: () => socket,
    };
});
afterEach(() => vi.useRealTimers());
const enter = async () => {
    await userEvent.click(await screen.findByRole('button', { name: /entrar na sala/i }));
    await screen.findByRole('toolbar', { name: /controles da sala/i });
};
describe('RoomPage: antes de entrar', () => {
    it('quem pode entrar vê a tela de entrada com os dados da sala', async () => {
        setup();
        expect(await screen.findByRole('heading', { name: 'Live - Live 1' })).toBeInTheDocument();
        expect(screen.getByText(/câmera e microfone começam desligados/i)).toBeInTheDocument();
        expect(api.rooms.get).toHaveBeenCalledWith(ROOM_ID);
        expect(api.rooms.access).toHaveBeenCalledWith(ROOM_ID);
    });
    it('fora da call: explica qual canal e não oferece entrar', async () => {
        setup({
            access: { canJoin: false, reason: 'NOT_IN_VOICE', hint: 'x', voiceChannelName: 'Live 1' },
        });
        expect(await screen.findByText(/Entre no canal de voz “Live 1” no Discord/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /entrar na sala/i })).not.toBeInTheDocument();
    });
    it('fora da call: entra sozinho assim que a pessoa entra no canal (consulta de novo)', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup({
            access: { canJoin: false, reason: 'NOT_IN_VOICE', hint: 'x', voiceChannelName: 'Live 1' },
        });
        await screen.findByText(/Entre no canal de voz/i);
        vi.mocked(api.rooms.access).mockResolvedValue(allowed);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(await screen.findByRole('button', { name: /entrar na sala/i })).toBeInTheDocument();
        expect(screen.queryByText(/Entre no canal de voz/i)).not.toBeInTheDocument();
    });
    it('reunião agendada: mostra o horário e abre sozinha', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup({
            access: {
                canJoin: false,
                reason: 'ROOM_NOT_OPEN',
                hint: 'x',
                status: 'SCHEDULED',
                startsAt: '2030-12-05T23:00:00.000Z',
            },
            room: makeRoom({ type: 'MEETING', title: 'Reunião mensal' }),
        });
        expect(await screen.findByRole('heading', { name: 'Reunião mensal' })).toBeInTheDocument();
        expect(screen.getByText(/faltam/i)).toBeInTheDocument();
        vi.mocked(api.rooms.access).mockResolvedValue(allowed);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(await screen.findByRole('button', { name: /entrar na sala/i })).toBeInTheDocument();
    });
    it.each([
        [{ reason: 'ROOM_NOT_OPEN', status: 'ENDED' }, /já foi encerrada/i],
        [{ reason: 'ROOM_NOT_OPEN', status: 'CANCELED' }, /foi cancelada/i],
        [{ reason: 'ROLE_NOT_ALLOWED' }, /cargo não tem acesso/i],
        [{ reason: 'BANNED_FROM_ROOM', expiresAt: null }, /não poderá voltar/i],
        [{ reason: 'BANNED_FROM_ROOM', expiresAt: '2030-01-01T10:00:00Z' }, /poderá voltar depois de/i],
        [{ reason: 'ROOM_FULL', maxParticipants: 25 }, /lotada/i],
    ])('bloqueio %j', async (partial, text) => {
        setup({ access: { canJoin: false, hint: 'x', ...partial } });
        expect(await screen.findByText(text)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /entrar na sala/i })).not.toBeInTheDocument();
    });
    it('bloqueios que não passam sozinhos não ficam consultando', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup({ access: { canJoin: false, reason: 'BANNED_FROM_ROOM', hint: 'x', expiresAt: null } });
        await screen.findByText(/não poderá voltar/i);
        const calls = vi.mocked(api.rooms.access).mock.calls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(vi.mocked(api.rooms.access).mock.calls.length).toBe(calls);
    });
    it('sala inexistente: erro sem botão de tentar de novo', async () => {
        mockMe(ME);
        vi.spyOn(api.rooms, 'get').mockRejectedValue(apiError(404, 'ROOM_NOT_FOUND'));
        vi.spyOn(api.rooms, 'access').mockRejectedValue(apiError(404, 'ROOM_NOT_FOUND'));
        renderWithApp(_jsx(RoomPage, { deps: deps }), { route: `/r/${ROOM_ID}`, path: '/r/:roomId' });
        expect(await screen.findByText('Essa sala não existe.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
    });
    it('falha de rede: dá para tentar de novo', async () => {
        mockMe(ME);
        vi.spyOn(api.rooms, 'get').mockRejectedValueOnce(apiError(0, 'NETWORK_ERROR'));
        vi.spyOn(api.rooms, 'access').mockResolvedValue(allowed);
        renderWithApp(_jsx(RoomPage, { deps: deps }), { route: `/r/${ROOM_ID}`, path: '/r/:roomId' });
        expect(await screen.findByText(/Sem conexão com o servidor/i)).toBeInTheDocument();
        vi.mocked(api.rooms.get).mockResolvedValue(makeRoom());
        await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
        expect(await screen.findByRole('button', { name: /entrar na sala/i })).toBeInTheDocument();
    });
});
describe('RoomPage: entrar e usar a sala', () => {
    it('entra: pede o token, conecta no LiveKit com a URL e o token recebidos, libera o áudio e assina a sala', async () => {
        setup();
        const join = vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        await enter();
        expect(join).toHaveBeenCalledWith(ROOM_ID);
        expect(lk.connect).toHaveBeenCalledWith('wss://live.exemplo.com', 'tok-123');
        expect(lk.startAudio).toHaveBeenCalled();
        expect(socket.emitted).toContainEqual({
            event: 'room:subscribe',
            payload: { roomId: ROOM_ID },
        });
        expect(screen.getByRole('heading', { name: 'Live - Live 1' })).toBeInTheDocument();
    });
    it('barra da direita: recolhida mostra só ícones; expandir mostra a sala e quem está na call', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        await enter();
        const toggle = screen.getByRole('button', { name: 'Mais opções' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        const rail = toggle.closest('.call-rail');
        expect(rail).not.toHaveAttribute('data-open');
        // mesmo recolhida, os botões da sala funcionam
        expect(screen.getByRole('group', { name: 'Opções da sala' })).toBeInTheDocument();
        await userEvent.click(toggle);
        expect(screen.getByRole('button', { name: 'Fechar opções' })).toHaveAttribute('aria-expanded', 'true');
        expect(rail).toHaveAttribute('data-open');
        const people = screen.getByRole('list', { name: 'Na chamada' });
        expect(people).toHaveTextContent('Fulano (você)');
        await userEvent.click(screen.getByRole('button', { name: 'Fechar opções' }));
        expect(screen.getByRole('button', { name: 'Mais opções' })).toBeInTheDocument();
    });
    it('pílula de mídia: Efeitos fica logo depois da câmera e antes da tela', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        await enter();
        const media = within(screen.getByRole('toolbar', { name: /controles da sala/i })).getByRole('group', { name: 'Mídia' });
        const names = within(media)
            .getAllByRole('button')
            .map((b) => b.getAttribute('aria-label') ?? '');
        const cam = names.findIndex((n) => /^câmera:/i.test(n));
        const fx = names.indexOf('Efeitos');
        const tela = names.findIndex((n) => /^tela:/i.test(n));
        expect(cam).toBeGreaterThan(-1);
        expect(fx).toBe(cam + 1);
        expect(tela).toBeGreaterThan(fx);
    });
    it('liga e desliga microfone e câmera pelos botões', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        await enter();
        await userEvent.click(screen.getByRole('button', { name: /microfone: desligado/i }));
        expect(lk.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true, {}, {});
        await userEvent.click(screen.getByRole('button', { name: /câmera: desligada/i }));
        expect(lk.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, {}, {});
        await userEvent.click(await screen.findByRole('button', { name: /microfone: ligado/i }));
        expect(lk.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, {}, {});
    });
    it('permissão negada pelo navegador vira aviso, sem quebrar', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        await enter();
        lk.localParticipant.setCameraEnabled.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
        await userEvent.click(screen.getByRole('button', { name: /câmera: desligada/i }));
        expect(await screen.findByText(/navegador bloqueou a câmera/i)).toBeInTheDocument();
        expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });
    it('sair: derruba LiveKit e Socket, avisa a API e volta para as salas', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        const leave = vi.spyOn(api.rooms, 'leave').mockResolvedValue(undefined);
        await enter();
        await userEvent.click(screen.getByRole('button', { name: /sair da sala/i }));
        await waitFor(() => expect(leave).toHaveBeenCalledWith(ROOM_ID));
        expect(lk.disconnect).toHaveBeenCalled();
        expect(socket.disconnect).toHaveBeenCalled();
        expect(await screen.findByText('página inicial')).toBeInTheDocument();
    });
    it('sair funciona mesmo se a API de saída falhar', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        vi.spyOn(api.rooms, 'leave').mockRejectedValue(apiError(0, 'NETWORK_ERROR'));
        await enter();
        await userEvent.click(screen.getByRole('button', { name: /sair da sala/i }));
        expect(await screen.findByText('página inicial')).toBeInTheDocument();
    });
    it('o clique duplo em "Entrar" só entra uma vez', async () => {
        setup();
        const join = vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        const button = await screen.findByRole('button', { name: /entrar na sala/i });
        await userEvent.dblClick(button);
        await screen.findByRole('toolbar');
        expect(join).toHaveBeenCalledTimes(1);
    });
});
describe('RoomPage: falhas ao entrar', () => {
    it('o servidor recusa na hora do join (saiu da call no último instante)', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockRejectedValue(apiError(403, 'NOT_IN_VOICE'));
        await userEvent.click(await screen.findByRole('button', { name: /entrar na sala/i }));
        expect(await screen.findByText(/Entre no canal de voz da live/i)).toBeInTheDocument();
        expect(lk.connect).not.toHaveBeenCalled();
    });
    it('LiveKit fora do ar no join: erro com tentar de novo, e nada fica conectado', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockRejectedValue(apiError(502, 'LIVEKIT_UNAVAILABLE'));
        await userEvent.click(await screen.findByRole('button', { name: /entrar na sala/i }));
        expect(await screen.findByText(/servidor de vídeo está indisponível/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    });
    it('falha ao conectar no LiveKit: desfaz tudo e mostra erro; tentar de novo volta ao começo', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        lk.connect.mockRejectedValueOnce(new Error('ICE failed'));
        await userEvent.click(await screen.findByRole('button', { name: /entrar na sala/i }));
        expect(await screen.findByText(/Não foi possível conectar à sala de vídeo/i)).toBeInTheDocument();
        expect(lk.disconnect).toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
        expect(await screen.findByRole('button', { name: /entrar na sala/i })).toBeInTheDocument();
    });
    it('o servidor recusa acompanhar a sala (assinatura)', async () => {
        setup();
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult());
        socket.subscribeAck = { ok: false, error: { code: 'FORBIDDEN', message: 'Sem acesso' } };
        await userEvent.click(await screen.findByRole('button', { name: /entrar na sala/i }));
        expect(await screen.findByText('Sem acesso')).toBeInTheDocument();
    });
});
describe('RoomPage: eventos do servidor', () => {
    async function connectedRoom(user = ME, permissions = {}, lecture = false) {
        setup({ user, room: makeRoom({ lectureMode: lecture }) });
        vi.spyOn(api.rooms, 'join').mockResolvedValue(joinResult(permissions, lecture));
        await enter();
    }
    it('sala encerrada: mostra o motivo e desconecta', async () => {
        await connectedRoom();
        socket.fire('room:ended', { roomId: ROOM_ID, reason: 'VOICE_EMPTY' });
        expect(await screen.findByText(/Todo mundo saiu do canal de voz/i)).toBeInTheDocument();
        expect(lk.disconnect).toHaveBeenCalled();
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });
    it.each([
        ['ENDED_BY_MOD', /moderador encerrou/i],
        ['ENDED_BY_ADMIN', /administrador encerrou/i],
        ['MEETING_FINISHED', /reunião terminou/i],
        ['CANCELED', /foi cancelada/i],
    ])('motivo de encerramento %s', async (reason, text) => {
        await connectedRoom();
        socket.fire('room:ended', { roomId: ROOM_ID, reason });
        expect(await screen.findByText(text)).toBeInTheDocument();
    });
    it('expulso: mostra o motivo e permite voltar', async () => {
        await connectedRoom();
        socket.fire('moderation:action', {
            roomId: ROOM_ID,
            action: 'KICKED',
            by: 'x',
            reason: 'spam',
        });
        expect(await screen.findByText('Você foi removido da sala')).toBeInTheDocument();
        expect(screen.getByText(/Motivo: spam/)).toBeInTheDocument();
        expect(screen.getByText(/pode entrar de novo/i)).toBeInTheDocument();
        expect(lk.disconnect).toHaveBeenCalled();
    });
    it('banido: mostra até quando', async () => {
        await connectedRoom();
        socket.fire('moderation:action', {
            roomId: ROOM_ID,
            action: 'BANNED',
            by: 'x',
            reason: null,
            expiresAt: '2030-01-01T10:00:00.000Z',
        });
        expect(await screen.findByText('Você foi banido desta sala')).toBeInTheDocument();
        expect(screen.getByText(/poderá voltar depois de/i)).toBeInTheDocument();
    });
    it('ser silenciado não tira da sala: bloqueia os botões e explica', async () => {
        await connectedRoom();
        socket.fire('participant:updated', {
            roomId: ROOM_ID,
            userId: ME.id,
            isSpeaker: false,
            mutedByModeration: true,
            mutedSources: ['microphone'],
        });
        expect(await screen.findByText('A moderação silenciou você.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /microfone/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /câmera/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /sair da sala/i })).toBeEnabled();
    });
    it('atualização de OUTRA pessoa não afeta meus botões', async () => {
        await connectedRoom();
        socket.fire('participant:updated', {
            roomId: ROOM_ID,
            userId: '999999999999999999',
            isSpeaker: false,
            mutedByModeration: true,
            mutedSources: [],
        });
        expect(screen.getByRole('button', { name: /microfone/i })).toBeEnabled();
    });
    it('palco: membro comum perde os botões; ser colocado no palco devolve', async () => {
        await connectedRoom();
        socket.fire('room:updated', { roomId: ROOM_ID, changes: { lectureMode: true } });
        expect(await screen.findByText(/Palco ligado: só quem está no palco/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /microfone/i })).toBeDisabled();
        expect(screen.getByText('Palco ligado', { selector: 'span' })).toBeInTheDocument();
        socket.fire('participant:updated', {
            roomId: ROOM_ID,
            userId: ME.id,
            isSpeaker: true,
            mutedByModeration: false,
            mutedSources: [],
        });
        await waitFor(() => expect(screen.getByRole('button', { name: /microfone/i })).toBeEnabled());
    });
    it('palco ligado: nem a moderação transmite até ser colocada no palco', async () => {
        const admin = makeUser({ id: ME.id, role: 'ADMIN' });
        await connectedRoom(admin, { canModerate: true });
        expect(screen.getByRole('button', { name: /microfone/i })).toBeEnabled();
        socket.fire('room:updated', { roomId: ROOM_ID, changes: { lectureMode: true } });
        await waitFor(() => expect(screen.getByRole('button', { name: /microfone/i })).toBeDisabled());
        socket.fire('participant:updated', {
            roomId: ROOM_ID,
            userId: ME.id,
            isSpeaker: true,
            mutedByModeration: false,
            mutedSources: [],
        });
        await waitFor(() => expect(screen.getByRole('button', { name: /microfone/i })).toBeEnabled());
    });
    it('aviso de saída da call: mostra a contagem e some quando a pessoa volta', async () => {
        await connectedRoom();
        socket.fire('voice:warning', { roomId: ROOM_ID, secondsLeft: 30 });
        expect(await screen.findByText(/Você saiu do canal de voz/i)).toBeInTheDocument();
        expect(screen.getByText(/Volte para a call em \d+s/i)).toBeInTheDocument();
        socket.fire('voice:restored', { roomId: ROOM_ID });
        await waitFor(() => expect(screen.queryByText(/Você saiu do canal de voz/i)).not.toBeInTheDocument());
    });
    it('queda da conexão de vídeo: oferece reconectar, e reconectar refaz a entrada', async () => {
        await connectedRoom();
        act(() => lk.fire('disconnected'));
        expect(await screen.findByText('Conexão perdida')).toBeInTheDocument();
        const second = new FakeLk();
        deps.createLiveKitRoom = () => second;
        await userEvent.click(screen.getByRole('button', { name: /reconectar/i }));
        await waitFor(() => expect(second.connect).toHaveBeenCalledWith('wss://live.exemplo.com', 'tok-123'));
        await waitFor(() => expect(screen.queryByText('Conexão perdida')).not.toBeInTheDocument());
    });
    it('removido logo depois da queda: mostra a remoção, não "conexão perdida"', async () => {
        await connectedRoom();
        act(() => lk.fire('disconnected'));
        socket.fire('moderation:action', { roomId: ROOM_ID, action: 'KICKED', by: 'x', reason: null });
        expect(await screen.findByText('Você foi removido da sala')).toBeInTheDocument();
        expect(screen.queryByText('Conexão perdida')).not.toBeInTheDocument();
    });
    it('sessão revogada (logout em outro lugar): pede para entrar de novo', async () => {
        await connectedRoom();
        socket.fire('session:revoked');
        expect(await screen.findByText(/sua sessão terminou/i)).toBeInTheDocument();
    });
    it('eventos de entrada e saída recarregam a lista de pessoas', async () => {
        await connectedRoom();
        // A lista de pessoas fica num painel que abre pelo botão "Pessoas" (em "Mais opções").
        await userEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
        await userEvent.click(screen.getByRole('button', { name: 'Pessoas' }));
        await waitFor(() => expect(api.rooms.participants).toHaveBeenCalled());
        const before = vi.mocked(api.rooms.participants).mock.calls.length;
        socket.fire('participant:joined', { roomId: ROOM_ID });
        await waitFor(() => expect(vi.mocked(api.rooms.participants).mock.calls.length).toBeGreaterThan(before), { timeout: 4000 });
    });
});
