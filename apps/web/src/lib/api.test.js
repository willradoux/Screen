import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function mockFetch(response) {
    const fn = vi.fn(async () => (typeof response === 'function' ? response() : response));
    vi.stubGlobal('fetch', fn);
    return fn;
}
afterEach(() => vi.unstubAllGlobals());
describe('api: chamadas', () => {
    it('envia o cookie de sessão e devolve só o `data`', async () => {
        const fetchFn = mockFetch(json(200, { data: { id: '1', role: 'MEMBER' } }));
        const me = await api.auth.me();
        expect(me).toEqual({ id: '1', role: 'MEMBER' });
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe('http://localhost:3000/api/v1/auth/me');
        expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    });
    it('manda corpo JSON com o cabeçalho certo', async () => {
        const fetchFn = mockFetch(json(201, { data: { id: 'm1' } }));
        await api.meetings.create({ title: 'Reunião mensal', announce: true });
        const [, init] = fetchFn.mock.calls[0];
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(JSON.parse(init.body)).toEqual({ title: 'Reunião mensal', announce: true });
    });
    it('não manda Content-Type quando não há corpo', async () => {
        const fetchFn = mockFetch(json(200, { data: {} }));
        await api.rooms.join('abc');
        const [, init] = fetchFn.mock.calls[0];
        expect(init.headers).toBeUndefined();
        expect(init.body).toBeUndefined();
    });
    it('monta a query ignorando valores vazios', async () => {
        const fetchFn = mockFetch(json(200, { data: [], page: { next: null, limit: 20 } }));
        await api.rooms.list({ status: 'OPEN', type: '', limit: 20, cursor: undefined });
        const [url] = fetchFn.mock.calls[0];
        expect(url).toBe('http://localhost:3000/api/v1/rooms?status=OPEN&limit=20');
    });
    it('listas devolvem também a página', async () => {
        mockFetch(json(200, { data: [{ id: 'r1' }], page: { next: 'abc', limit: 20 } }));
        const res = await api.rooms.list();
        expect(res.data).toHaveLength(1);
        expect(res.page.next).toBe('abc');
    });
    it('204 devolve undefined', async () => {
        mockFetch(new Response(null, { status: 204 }));
        await expect(api.rooms.leave('abc')).resolves.toBeUndefined();
    });
    it('escapa ids na URL', async () => {
        const fetchFn = mockFetch(new Response(null, { status: 204 }));
        await api.moderation.kick('a/b', 'c d');
        const [url] = fetchFn.mock.calls[0];
        expect(url).toBe('http://localhost:3000/api/v1/rooms/a%2Fb/participants/c%20d/kick');
    });
    it.each([
        ['mute', 'POST', '/mute'],
        ['unmute', 'POST', '/unmute'],
        ['ban', 'POST', '/ban'],
        ['promote', 'POST', '/promote'],
        ['demote', 'POST', '/demote'],
    ])('moderação: %s usa %s %s', async (name, method, suffix) => {
        const fetchFn = mockFetch(new Response(null, { status: 204 }));
        await api.moderation[name]('r1', 'u1');
        const [url, init] = fetchFn.mock.calls[0];
        expect(url.endsWith(`/rooms/r1/participants/u1${suffix}`)).toBe(true);
        expect(init.method).toBe(method);
    });
    it('desbanir usa DELETE', async () => {
        const fetchFn = mockFetch(new Response(null, { status: 204 }));
        await api.moderation.unban('r1', 'u1');
        const [url, init] = fetchFn.mock.calls[0];
        expect(url.endsWith('/rooms/r1/bans/u1')).toBe(true);
        expect(init.method).toBe('DELETE');
    });
    it('o endereço de login leva o redirect codificado', () => {
        expect(api.loginUrl('/r/abc?x=1')).toBe('http://localhost:3000/api/v1/auth/discord?redirect=%2Fr%2Fabc%3Fx%3D1');
    });
});
describe('api: erros', () => {
    it('vira ApiError com status, código, detalhes e id da requisição', async () => {
        mockFetch(json(403, {
            error: {
                code: 'NOT_IN_VOICE',
                message: 'Entre no canal',
                details: { voiceChannelName: 'Live 1' },
                requestId: 'abc123',
            },
        }));
        const err = await api.rooms.join('r1').catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({
            status: 403,
            code: 'NOT_IN_VOICE',
            message: 'Entre no canal',
            details: { voiceChannelName: 'Live 1' },
            requestId: 'abc123',
        });
    });
    it('401 chega como UNAUTHENTICATED', async () => {
        mockFetch(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
        await expect(api.auth.me()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    });
    it('resposta de erro que não é JSON ainda vira ApiError', async () => {
        mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
        await expect(api.rooms.get('r1')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
    });
    it('falha de rede vira NETWORK_ERROR (status 0)', async () => {
        mockFetch(async () => {
            throw new TypeError('Failed to fetch');
        });
        await expect(api.rooms.get('r1')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    });
    it('cancelamento (AbortError) não é tratado como erro de rede', async () => {
        mockFetch(async () => {
            throw new DOMException('abortado', 'AbortError');
        });
        await expect(api.auth.me()).rejects.toMatchObject({ name: 'AbortError' });
    });
});
