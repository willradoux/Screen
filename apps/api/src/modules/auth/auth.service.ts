import type { Env } from '../../config/env.js';
import { decrypt, encrypt, randomToken, sha256, sign, unsign } from '../../shared/crypto.js';
import { AppError, unauthenticated } from '../../shared/errors.js';
import { resolveRole } from '../permissions/roles.js';
import {
  DiscordAuthError,
  DiscordUnavailableError,
  type DiscordApi,
  type DiscordMember,
  type DiscordTokens,
} from '../discord/discord-api.js';
import type {
  Identity,
  SessionRecord,
  SessionRepo,
  SettingsRepo,
  UserRecord,
  UserRepo,
} from './auth.types.js';
import { sanitizeRedirect } from './redirect.js';

const ABSOLUTE_SESSION_DAYS = 30;
const MEMBER_CACHE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface AuthServiceDeps {
  env: Env;
  discord: DiscordApi;
  users: UserRepo;
  sessions: SessionRepo;
  settings: SettingsRepo;
  now?: () => Date;
}

export interface LoginMeta {
  ip: string | null;
  userAgent: string | null;
}

const discordUnavailable = () =>
  new AppError('DISCORD_UNAVAILABLE', 502, 'O Discord está indisponível. Tente novamente.');

export class AuthService {
  private readonly memberCache = new Map<string, { until: number; member: DiscordMember }>();
  private readonly now: () => Date;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Duração deslizante da sessão, em ms. */
  get sessionTtlMs(): number {
    return this.deps.env.SESSION_TTL_DAYS * DAY_MS;
  }

  // ---------- Login ----------

  /** Gera `state` e o valor do cookie assinado que o guarda junto do redirect. */
  startLogin(redirect: string | undefined): { url: string; stateCookie: string } {
    const state = randomToken(24);
    const payload = Buffer.from(
      JSON.stringify({ s: state, r: sanitizeRedirect(redirect) }),
    ).toString('base64url');
    return {
      url: this.deps.discord.buildAuthorizeUrl(state),
      stateCookie: sign(payload, this.deps.env.COOKIE_SECRET),
    };
  }

  async completeLogin(input: {
    code: string;
    state: string;
    stateCookie: string | undefined;
    meta: LoginMeta;
  }): Promise<{ sessionId: string; redirect: string }> {
    const saved = this.readStateCookie(input.stateCookie);
    if (!saved || saved.s !== input.state) {
      throw new AppError('INVALID_STATE', 400, 'Sessão de login inválida. Tente entrar de novo.');
    }

    let tokens: DiscordTokens;
    let member: DiscordMember | null;
    try {
      tokens = await this.deps.discord.exchangeCode(input.code);
      member = await this.deps.discord.fetchGuildMember(tokens.accessToken);
    } catch (err) {
      throw this.mapDiscordError(err, 'DISCORD_OAUTH_FAILED');
    }

    if (!member) {
      throw new AppError('NOT_IN_GUILD', 403, 'Você precisa estar no servidor Acelera DEV.');
    }

    const user = await this.deps.users.upsertOnLogin({
      id: member.user.id,
      username: member.user.username,
      globalName: member.user.global_name,
      avatarHash: member.user.avatar,
    });
    if (user.blocked) {
      throw new AppError('ACCOUNT_BLOCKED', 403, 'Sua conta está bloqueada.');
    }

    // Sempre uma sessão nova: evita session fixation.
    const rawId = randomToken(32);
    const now = this.now();
    await this.deps.sessions.create({
      id: sha256(rawId),
      userId: user.id,
      discordAccessToken: encrypt(tokens.accessToken, this.deps.env.encryptionKey),
      discordRefreshToken: encrypt(tokens.refreshToken, this.deps.env.encryptionKey),
      discordExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
      ip: input.meta.ip,
      userAgent: input.meta.userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(now.getTime() + this.sessionTtlMs),
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_SESSION_DAYS * DAY_MS),
    });
    this.memberCache.set(user.id, { until: now.getTime() + MEMBER_CACHE_MS, member });

    return { sessionId: rawId, redirect: saved.r };
  }

  private readStateCookie(value: string | undefined): { s: string; r: string } | null {
    if (!value) return null;
    const payload = unsign(value, this.deps.env.COOKIE_SECRET);
    if (!payload) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        s?: unknown;
        r?: unknown;
      };
      if (typeof parsed.s !== 'string' || typeof parsed.r !== 'string') return null;
      return { s: parsed.s, r: sanitizeRedirect(parsed.r) };
    } catch {
      return null;
    }
  }

  // ---------- Sessão ----------

  /** Carrega a sessão a partir do id do cookie. `null` se inexistente ou expirada. */
  async loadSession(rawId: string): Promise<SessionRecord | null> {
    const session = await this.deps.sessions.findById(sha256(rawId));
    if (!session) return null;
    const now = this.now().getTime();
    if (session.expiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
      await this.deps.sessions.delete(session.id);
      return null;
    }
    return session;
  }

  /**
   * Renova a janela deslizante (no máximo 1x por hora). Devolve a nova expiração
   * quando renovou, para o middleware reenviar o cookie.
   */
  async touch(session: SessionRecord): Promise<Date | null> {
    const now = this.now().getTime();
    const wanted = Math.min(now + this.sessionTtlMs, session.absoluteExpiresAt.getTime());
    if (wanted - session.expiresAt.getTime() < 3_600_000) return null;
    const expiresAt = new Date(wanted);
    await this.deps.sessions.updateExpiry(session.id, expiresAt);
    session.expiresAt = expiresAt;
    return expiresAt;
  }

  async logout(session: SessionRecord): Promise<void> {
    await this.deps.sessions.delete(session.id);
    this.memberCache.delete(session.userId);
  }

  /** Revoga todas as sessões de um usuário (ex.: bloqueio). */
  async revokeUser(userId: string): Promise<void> {
    await this.deps.sessions.deleteByUser(userId);
    this.memberCache.delete(userId);
  }

  // ---------- Identidade e papel ----------

  /**
   * Usuário + papel atual. O membro é consultado no Discord com o token do próprio
   * usuário e fica em cache por 60 s; assim remover um cargo tem efeito em até 1 min.
   */
  async getIdentity(session: SessionRecord): Promise<Identity> {
    const user = await this.deps.users.findById(session.userId);
    if (!user) {
      await this.deps.sessions.delete(session.id);
      throw unauthenticated();
    }
    if (user.blocked) {
      await this.revokeUser(user.id);
      throw new AppError('ACCOUNT_BLOCKED', 403, 'Sua conta está bloqueada.');
    }

    const member = await this.getMember(session);
    const config = await this.deps.settings.getRoleConfig(this.deps.env.DISCORD_GUILD_ID);
    const role = resolveRole({
      userId: user.id,
      memberRoleIds: member.roles,
      config,
      bootstrapAdminIds: this.deps.env.bootstrapAdminIds,
    });

    return {
      user,
      role,
      displayName: member.nick ?? user.globalName ?? user.username,
      avatarUrl: avatarUrl(user),
    };
  }

  private async getMember(session: SessionRecord): Promise<DiscordMember> {
    const now = this.now().getTime();
    const cached = this.memberCache.get(session.userId);
    if (cached && cached.until > now) return cached.member;

    try {
      const accessToken = await this.accessToken(session);
      const member = await this.deps.discord.fetchGuildMember(accessToken);
      if (!member) {
        // Saiu do servidor: perde o acesso.
        await this.revokeUser(session.userId);
        throw new AppError('NOT_IN_GUILD', 403, 'Você precisa estar no servidor Acelera DEV.');
      }
      this.memberCache.set(session.userId, { until: now + MEMBER_CACHE_MS, member });
      return member;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof DiscordAuthError) {
        await this.logout(session);
        throw unauthenticated();
      }
      throw this.mapDiscordError(err, 'DISCORD_UNAVAILABLE');
    }
  }

  /** Access token válido, renovando com o refresh token se estiver perto de expirar. */
  private async accessToken(session: SessionRecord): Promise<string> {
    const key = this.deps.env.encryptionKey;
    if (session.discordExpiresAt.getTime() - 60_000 > this.now().getTime()) {
      return decrypt(session.discordAccessToken, key);
    }
    const tokens = await this.deps.discord.refresh(decrypt(session.discordRefreshToken, key));
    const update = {
      discordAccessToken: encrypt(tokens.accessToken, key),
      discordRefreshToken: encrypt(tokens.refreshToken, key),
      discordExpiresAt: new Date(this.now().getTime() + tokens.expiresIn * 1000),
    };
    await this.deps.sessions.updateTokens(session.id, update);
    Object.assign(session, update);
    return tokens.accessToken;
  }

  private mapDiscordError(err: unknown, authFailedCode: string): AppError {
    if (err instanceof DiscordAuthError) {
      return new AppError(authFailedCode, 502, 'Não foi possível entrar com o Discord.');
    }
    if (err instanceof DiscordUnavailableError) return discordUnavailable();
    throw err;
  }
}

export function avatarUrl(user: Pick<UserRecord, 'id' | 'avatarHash'>): string | null {
  return user.avatarHash
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatarHash}.png`
    : null;
}
