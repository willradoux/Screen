import { API_URL } from './config';
/** Erro devolvido pela API (docs/backend/erros.md). Decida sempre pelo `code`. */
export class ApiError extends Error {
    status;
    code;
    details;
    requestId;
    hint;
    constructor(status, code, message, details = {}, requestId, 
    /** O que fazer a respeito (vem da API). */
    hint) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.requestId = requestId;
        this.hint = hint;
        this.name = 'ApiError';
    }
}
function withQuery(path, query) {
    if (!query)
        return path;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '')
            params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}
/** Faz a chamada com o cookie de sessão e devolve o corpo JSON inteiro (`undefined` no 204). */
async function call(method, path, opts = {}) {
    let res;
    try {
        res = await fetch(`${API_URL}${withQuery(path, opts.query)}`, {
            method,
            credentials: 'include',
            headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal: opts.signal,
        });
    }
    catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError')
            throw err;
        throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível falar com o servidor.');
    }
    if (res.status === 204)
        return undefined;
    let json;
    try {
        json = await res.json();
    }
    catch {
        json = undefined;
    }
    if (!res.ok) {
        const e = json?.error;
        throw new ApiError(res.status, e?.code ?? 'UNKNOWN_ERROR', e?.message ?? 'Algo deu errado.', e?.details ?? {}, e?.requestId, e?.hint);
    }
    return json;
}
/** Atalho: devolve só o `data`. */
async function data(method, path, opts) {
    return (await call(method, path, opts)).data;
}
const enc = encodeURIComponent;
export const api = {
    /** Endereço que inicia o login com o Discord (navegação, não fetch). */
    loginUrl: (redirect) => `${API_URL}/auth/discord?redirect=${enc(redirect)}`,
    auth: {
        me: (signal) => data('GET', '/auth/me', { signal }),
        logout: () => call('POST', '/auth/logout'),
    },
    rooms: {
        list: (query = {}) => call('GET', '/rooms', { query }),
        get: (id) => data('GET', `/rooms/${enc(id)}`),
        access: (id) => data('GET', `/rooms/${enc(id)}/access`),
        join: (id) => data('POST', `/rooms/${enc(id)}/join`),
        leave: (id) => call('POST', `/rooms/${enc(id)}/leave`),
        /** Levanta a mão (pede a palavra) numa reunião. */
        raiseHand: (id) => call('POST', `/rooms/${enc(id)}/hand`),
        lowerHand: (id) => call('DELETE', `/rooms/${enc(id)}/hand`),
        hands: (id) => data('GET', `/rooms/${enc(id)}/hands`),
        end: (id) => call('POST', `/rooms/${enc(id)}/end`),
        participants: (id) => data('GET', `/rooms/${enc(id)}/participants`),
        update: (id, patch) => data('PATCH', `/rooms/${enc(id)}`, { body: patch }),
    },
    moderation: {
        mute: (roomId, userId, body = {}) => call('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/mute`, { body }),
        unmute: (roomId, userId) => call('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/unmute`),
        kick: (roomId, userId, body = {}) => call('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/kick`, { body }),
        ban: (roomId, userId, body = {}) => call('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/ban`, { body }),
        unban: (roomId, userId) => call('DELETE', `/rooms/${enc(roomId)}/bans/${enc(userId)}`),
        promote: (roomId, userId) => call('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/promote`),
        demote: (roomId, userId) => call('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/demote`),
        /** Desliga o microfone de todos (reunião). Cada pessoa pode ligar de novo. */
        muteAll: (roomId) => data('POST', `/rooms/${enc(roomId)}/mute-all`),
        /** Desliga câmera e tela de todos (reunião). */
        camerasOff: (roomId) => data('POST', `/rooms/${enc(roomId)}/cameras-off`),
    },
    meetings: {
        list: (query = {}) => data('GET', '/meetings', { query }),
        get: (id) => data('GET', `/meetings/${enc(id)}`),
        create: (input) => data('POST', '/meetings', { body: input }),
        update: (id, patch) => data('PATCH', `/meetings/${enc(id)}`, { body: patch }),
        open: (id) => data('POST', `/meetings/${enc(id)}/open`),
        /** Divulga no canal de avisos quando o admin quiser. `resend` manda outra mensagem. */
        announce: (id, resend = false) => data('POST', `/meetings/${enc(id)}/announce`, { body: { resend } }),
        cancel: (id) => call('POST', `/meetings/${enc(id)}/cancel`),
        report: (id) => data('GET', `/meetings/${enc(id)}/report`),
    },
    settings: {
        get: () => data('GET', '/settings'),
        update: (patch) => data('PATCH', '/settings', { body: patch }),
    },
    recordings: {
        start: (roomId, body) => data('POST', `/rooms/${enc(roomId)}/recordings`, { body }),
        stop: (id) => data('POST', `/recordings/${enc(id)}/stop`),
        list: () => data('GET', '/recordings'),
        remove: (id) => call('DELETE', `/recordings/${enc(id)}`),
        /** Endereço do download (navegação com o cookie de sessão, não fetch). */
        downloadUrl: (id) => `${API_URL}/recordings/${enc(id)}/download`,
    },
    calls: {
        /** Quem está em cada call com live agora. */
        list: () => data('GET', '/calls'),
    },
    stats: {
        get: (days) => data('GET', '/stats', { query: { days } }),
    },
    system: {
        /** Avisos de configuração (bot no servidor, calls e canal de avisos). */
        status: () => data('GET', '/status'),
    },
    guild: {
        /** Canais e cargos do servidor, para os seletores do painel. */
        catalog: () => data('GET', '/guild'),
    },
    panelUsers: {
        list: () => data('GET', '/panel-users'),
        add: (body) => data('POST', '/panel-users', { body }),
        remove: (userId) => call('DELETE', `/panel-users/${enc(userId)}`),
    },
    audit: {
        list: (query) => call('GET', '/audit', { query }),
    },
};
