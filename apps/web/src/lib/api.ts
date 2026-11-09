import { API_URL } from './config';
import type {
  AccessResult,
  AuditEntry,
  JoinResult,
  MediaSource,
  GuildChannel,
  GuildRole,
  Meeting,
  MeetingReport,
  Page,
  PanelUser,
  Participant,
  Room,
  Settings,
  SettingsPatch,
  User,
} from './types';

/** Erro devolvido pela API (docs/backend/erros.md). Decida sempre pelo `code`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly requestId?: string,
    /** O que fazer a respeito (vem da API). */
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface Options {
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Faz a chamada com o cookie de sessão e devolve o corpo JSON inteiro (`undefined` no 204). */
async function call<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${withQuery(path, opts.query)}`, {
      method,
      credentials: 'include',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível falar com o servidor.');
  }

  if (res.status === 204) return undefined as T;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const e = (
      json as {
        error?: {
          code?: string;
          message?: string;
          hint?: string;
          details?: unknown;
          requestId?: string;
        };
      }
    )?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'UNKNOWN_ERROR',
      e?.message ?? 'Algo deu errado.',
      (e?.details as Record<string, unknown> | undefined) ?? {},
      e?.requestId,
      e?.hint,
    );
  }
  return json as T;
}

/** Atalho: devolve só o `data`. */
async function data<T>(method: string, path: string, opts?: Options): Promise<T> {
  return (await call<{ data: T }>(method, path, opts)).data;
}

const enc = encodeURIComponent;

export interface MeetingInput {
  title: string;
  description?: string | null;
  startsAt?: string | null;
  maxParticipants?: number;
  announce?: boolean;
  reminders?: number[];
}

export const api = {
  /** Endereço que inicia o login com o Discord (navegação, não fetch). */
  loginUrl: (redirect: string) => `${API_URL}/auth/discord?redirect=${enc(redirect)}`,

  auth: {
    me: (signal?: AbortSignal) => data<User>('GET', '/auth/me', { signal }),
    logout: () => call<void>('POST', '/auth/logout'),
  },

  rooms: {
    list: (query: { status?: string; type?: string; limit?: number; cursor?: string } = {}) =>
      call<{ data: Room[]; page: Page }>('GET', '/rooms', { query }),
    get: (id: string) => data<Room>('GET', `/rooms/${enc(id)}`),
    access: (id: string) => data<AccessResult>('GET', `/rooms/${enc(id)}/access`),
    join: (id: string) => data<JoinResult>('POST', `/rooms/${enc(id)}/join`),
    leave: (id: string) => call<void>('POST', `/rooms/${enc(id)}/leave`),
    end: (id: string) => call<void>('POST', `/rooms/${enc(id)}/end`),
    participants: (id: string) => data<Participant[]>('GET', `/rooms/${enc(id)}/participants`),
    update: (
      id: string,
      patch: {
        title?: string;
        description?: string | null;
        maxParticipants?: number;
        lectureMode?: boolean;
      },
    ) => data<Room>('PATCH', `/rooms/${enc(id)}`, { body: patch }),
  },

  moderation: {
    mute: (
      roomId: string,
      userId: string,
      body: { sources?: MediaSource[]; reason?: string } = {},
    ) => call<void>('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/mute`, { body }),
    unmute: (roomId: string, userId: string) =>
      call<void>('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/unmute`),
    kick: (roomId: string, userId: string, body: { reason?: string } = {}) =>
      call<void>('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/kick`, { body }),
    ban: (
      roomId: string,
      userId: string,
      body: { durationMinutes?: number; reason?: string } = {},
    ) => call<void>('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/ban`, { body }),
    unban: (roomId: string, userId: string) =>
      call<void>('DELETE', `/rooms/${enc(roomId)}/bans/${enc(userId)}`),
    promote: (roomId: string, userId: string) =>
      call<void>('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/promote`),
    demote: (roomId: string, userId: string) =>
      call<void>('POST', `/rooms/${enc(roomId)}/participants/${enc(userId)}/demote`),
    /** Desliga o microfone de todos (reunião). Cada pessoa pode ligar de novo. */
    muteAll: (roomId: string) =>
      data<{ affected: number }>('POST', `/rooms/${enc(roomId)}/mute-all`),
    /** Desliga câmera e tela de todos (reunião). */
    camerasOff: (roomId: string) =>
      data<{ affected: number }>('POST', `/rooms/${enc(roomId)}/cameras-off`),
  },

  meetings: {
    list: (query: { status?: string; from?: string; to?: string; limit?: number } = {}) =>
      data<Meeting[]>('GET', '/meetings', { query }),
    get: (id: string) => data<Meeting>('GET', `/meetings/${enc(id)}`),
    create: (input: MeetingInput) => data<Meeting>('POST', '/meetings', { body: input }),
    update: (id: string, patch: Partial<MeetingInput>) =>
      data<Meeting>('PATCH', `/meetings/${enc(id)}`, { body: patch }),
    open: (id: string) => data<Meeting>('POST', `/meetings/${enc(id)}/open`),
    /** Divulga no canal de avisos quando o admin quiser. `resend` manda outra mensagem. */
    announce: (id: string, resend = false) =>
      data<Meeting>('POST', `/meetings/${enc(id)}/announce`, { body: { resend } }),
    cancel: (id: string) => call<void>('POST', `/meetings/${enc(id)}/cancel`),
    report: (id: string) => data<MeetingReport>('GET', `/meetings/${enc(id)}/report`),
  },

  settings: {
    get: () => data<Settings>('GET', '/settings'),
    update: (patch: SettingsPatch) => data<Settings>('PATCH', '/settings', { body: patch }),
  },

  system: {
    /** Avisos de configuração (bot no servidor, calls e canal de avisos). */
    status: () =>
      data<{ botInGuild: boolean; livesConfigured: boolean; announceConfigured: boolean }>(
        'GET',
        '/status',
      ),
  },

  guild: {
    /** Canais e cargos do servidor, para os seletores do painel. */
    catalog: () => data<{ channels: GuildChannel[]; roles: GuildRole[] }>('GET', '/guild'),
  },

  panelUsers: {
    list: () => data<PanelUser[]>('GET', '/panel-users'),
    add: (body: { userId: string; role: 'ADMIN' | 'MOD'; note?: string | null }) =>
      data<{ userId: string; role: string }>('POST', '/panel-users', { body }),
    remove: (userId: string) => call<void>('DELETE', `/panel-users/${enc(userId)}`),
  },

  audit: {
    list: (query: {
      actorId?: string;
      targetId?: string;
      roomId?: string;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    }) => call<{ data: AuditEntry[]; page: Page }>('GET', '/audit', { query }),
  },
};
