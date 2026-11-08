import type { Env } from '../../config/env.js';

export interface DiscordTokens {
  accessToken: string;
  refreshToken: string;
  /** Segundos até expirar. */
  expiresIn: number;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export interface DiscordMember {
  roles: string[];
  nick: string | null;
  user: DiscordUser;
}

/** Token recusado/expirado/revogado (ou code inválido na troca). */
export class DiscordAuthError extends Error {}
/** Discord fora do ar, rate limit ou erro de rede. */
export class DiscordUnavailableError extends Error {}

/** Fronteira com o Discord. Em testes é substituída por um fake. */
export interface DiscordApi {
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<DiscordTokens>;
  refresh(refreshToken: string): Promise<DiscordTokens>;
  fetchMe(accessToken: string): Promise<DiscordUser>;
  /** `null` quando o usuário não está na guilda. */
  fetchGuildMember(accessToken: string): Promise<DiscordMember | null>;
}

const BASE = 'https://discord.com/api/v10';
const SCOPES = ['identify', 'guilds.members.read'];

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

export function createDiscordApi(
  env: Pick<
    Env,
    'DISCORD_CLIENT_ID' | 'DISCORD_CLIENT_SECRET' | 'DISCORD_REDIRECT_URI' | 'DISCORD_GUILD_ID'
  >,
): DiscordApi {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    } catch (err) {
      throw new DiscordUnavailableError(`Falha de rede com o Discord: ${String(err)}`);
    }
  }

  async function tokenRequest(params: Record<string, string>): Promise<DiscordTokens> {
    const res = await call(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        ...params,
      }),
    });
    if (res.status === 400 || res.status === 401) throw new DiscordAuthError('Token recusado');
    if (!res.ok) throw new DiscordUnavailableError(`Discord respondeu ${res.status}`);
    const json = (await res.json()) as TokenResponse;
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
    };
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  return {
    buildAuthorizeUrl(state) {
      const url = new URL('https://discord.com/oauth2/authorize');
      url.search = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        redirect_uri: env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES.join(' '),
        state,
        prompt: 'none',
      }).toString();
      return url.toString();
    },

    exchangeCode: (code) =>
      tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.DISCORD_REDIRECT_URI,
      }),

    refresh: (refreshToken) =>
      tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }),

    async fetchMe(accessToken) {
      const res = await call(`${BASE}/users/@me`, { headers: bearer(accessToken) });
      if (res.status === 401) throw new DiscordAuthError('Token inválido');
      if (!res.ok) throw new DiscordUnavailableError(`Discord respondeu ${res.status}`);
      return (await res.json()) as DiscordUser;
    },

    async fetchGuildMember(accessToken) {
      const res = await call(`${BASE}/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, {
        headers: bearer(accessToken),
      });
      if (res.status === 401) throw new DiscordAuthError('Token inválido');
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new DiscordUnavailableError(`Discord respondeu ${res.status}`);
      return (await res.json()) as DiscordMember;
    },
  };
}
