import { createApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { AuthService, type AuthServiceDeps } from '../../src/modules/auth/auth.service.js';
import type {
  SessionRecord,
  SessionRepo,
  UserRecord,
  UserRepo,
} from '../../src/modules/auth/auth.types.js';
import type {
  GuildSettings,
  PanelUser,
  RoleConfig,
  RoleListField,
  SettingsPatch,
  SettingsRepo,
} from '../../src/modules/settings/settings.types.js';
import {
  DiscordAuthError,
  DiscordUnavailableError,
  type DiscordApi,
  type DiscordMember,
  type DiscordTokens,
} from '../../src/modules/discord/discord-api.js';
import { createLogger } from '../../src/shared/logger.js';

export const GUILD_ID = '222222222222222222';
export const ADMIN_ROLE = '900000000000000001';
export const MOD_ROLE = '900000000000000002';

export class FakeClock {
  constructor(private ms = Date.parse('2026-11-08T12:00:00Z')) {}
  now = () => new Date(this.ms);
  advance(ms: number) {
    this.ms += ms;
  }
}

/** Discord falso: cada `code` corresponde a um usuário já cadastrado em `members`. */
export class FakeDiscord implements DiscordApi {
  /** userId -> membro (ou null = fora da guilda) */
  members = new Map<string, DiscordMember | null>();
  /** Tokens revogados: qualquer chamada com eles lança DiscordAuthError. */
  revoked = new Set<string>();
  unavailable = false;
  tokenLifetimeSec = 3600;
  refreshCalls = 0;
  private counter = 0;
  private tokenOwner = new Map<string, string>();
  private refreshOwner = new Map<string, string>();

  addMember(id: string, opts: { roles?: string[]; nick?: string | null; username?: string } = {}) {
    this.members.set(id, {
      roles: opts.roles ?? [],
      nick: opts.nick ?? null,
      user: {
        id,
        username: opts.username ?? `user${id.slice(-4)}`,
        global_name: null,
        avatar: null,
      },
    });
  }

  buildAuthorizeUrl(state: string) {
    return `https://discord.test/authorize?state=${state}`;
  }

  private issue(userId: string): DiscordTokens {
    const n = ++this.counter;
    const accessToken = `at-${n}`;
    const refreshToken = `rt-${n}`;
    this.tokenOwner.set(accessToken, userId);
    this.refreshOwner.set(refreshToken, userId);
    return { accessToken, refreshToken, expiresIn: this.tokenLifetimeSec };
  }

  async exchangeCode(code: string) {
    if (this.unavailable) throw new DiscordUnavailableError('fora do ar');
    if (!code.startsWith('code-')) throw new DiscordAuthError('code inválido');
    return this.issue(code.slice('code-'.length));
  }

  async refresh(refreshToken: string) {
    this.refreshCalls++;
    const owner = this.refreshOwner.get(refreshToken);
    if (!owner || this.revoked.has(refreshToken)) throw new DiscordAuthError('refresh inválido');
    return this.issue(owner);
  }

  private ownerOf(accessToken: string): string {
    if (this.unavailable) throw new DiscordUnavailableError('fora do ar');
    const owner = this.tokenOwner.get(accessToken);
    if (!owner || this.revoked.has(accessToken)) throw new DiscordAuthError('token inválido');
    return owner;
  }

  async fetchMe(accessToken: string) {
    const member = this.members.get(this.ownerOf(accessToken));
    if (!member) throw new DiscordAuthError('sem usuário');
    return member.user;
  }

  async fetchGuildMember(accessToken: string) {
    return this.members.get(this.ownerOf(accessToken)) ?? null;
  }
}

export class MemoryUsers implements UserRepo {
  users = new Map<string, UserRecord>();
  async upsertOnLogin(u: {
    id: string;
    username: string;
    globalName: string | null;
    avatarHash: string | null;
  }) {
    const existing = this.users.get(u.id);
    const record: UserRecord = {
      ...u,
      blocked: existing?.blocked ?? false,
      lastLoginAt: new Date(),
    };
    this.users.set(u.id, record);
    return record;
  }
  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
}

export class MemorySessions implements SessionRepo {
  sessions = new Map<string, SessionRecord>();
  async create(s: SessionRecord) {
    this.sessions.set(s.id, { ...s });
  }
  async findById(id: string) {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }
  async updateExpiry(id: string, expiresAt: Date) {
    const s = this.sessions.get(id);
    if (s) s.expiresAt = expiresAt;
  }
  async updateTokens(
    id: string,
    tokens: { discordAccessToken: string; discordRefreshToken: string; discordExpiresAt: Date },
  ) {
    const s = this.sessions.get(id);
    if (s) Object.assign(s, tokens);
  }
  async delete(id: string) {
    this.sessions.delete(id);
  }
  async deleteByUser(userId: string) {
    for (const [id, s] of this.sessions) if (s.userId === userId) this.sessions.delete(id);
  }
}

export class MemorySettings implements SettingsRepo {
  settings: GuildSettings = {
    guildId: GUILD_ID,
    liveCategoryId: null,
    liveTextChannelId: null,
    announceChannelId: null,
    adminRoleIds: [ADMIN_ROLE],
    modRoleIds: [MOD_ROLE],
    meetingAllowedRoleIds: [],
    maxParticipantsLive: 25,
    graceSeconds: 30,
    liveChannelIds: [],
    logChannelId: null,
    mentionRoleId: null,
    emptyLiveEndSeconds: null,
    idleSessionMinutes: 10,
    activationGraceMinutes: 3,
    panelUsers: [],
  };
  /** Compatibilidade com testes antigos que mexiam em `config`. */
  get config(): RoleConfig {
    return this.settings;
  }
  async getRoleConfig() {
    const users = this.settings.panelUsers;
    return {
      adminRoleIds: this.settings.adminRoleIds,
      modRoleIds: this.settings.modRoleIds,
      adminUserIds: users.filter((p) => p.role === 'ADMIN').map((p) => p.userId),
      modUserIds: users.filter((p) => p.role === 'MOD').map((p) => p.userId),
    };
  }
  async get() {
    return structuredClone(this.settings);
  }
  async update(_guildId: string, patch: SettingsPatch) {
    Object.assign(this.settings, patch);
    return structuredClone(this.settings);
  }
  async modifyList(
    _guildId: string,
    field: RoleListField,
    action: 'add' | 'remove',
    roleId: string,
  ) {
    const list = this.settings[field];
    if (action === 'add' && !list.includes(roleId)) list.push(roleId);
    if (action === 'remove') this.settings[field] = list.filter((r) => r !== roleId);
    return structuredClone(this.settings);
  }
  async removeReference(_guildId: string, id: string) {
    const s = this.settings;
    for (const f of [
      'adminRoleIds',
      'modRoleIds',
      'meetingAllowedRoleIds',
      'liveChannelIds',
    ] as const) {
      s[f] = s[f].filter((r) => r !== id);
    }
    for (const f of [
      'liveCategoryId',
      'liveTextChannelId',
      'announceChannelId',
      'logChannelId',
      'mentionRoleId',
    ] as const) {
      if (s[f] === id) s[f] = null;
    }
  }
  async setPanelUser(_guildId: string, user: PanelUser) {
    this.settings.panelUsers = [
      ...this.settings.panelUsers.filter((p) => p.userId !== user.userId),
      user,
    ];
    return structuredClone(this.settings);
  }
  async removePanelUser(_guildId: string, userId: string) {
    this.settings.panelUsers = this.settings.panelUsers.filter((p) => p.userId !== userId);
    return structuredClone(this.settings);
  }
}

export function buildTestApp(
  envOverrides: Record<string, string> = {},
  extra: { guildPermissions?: AuthServiceDeps['guildPermissions'] } = {},
) {
  // Os padrões de teste só valem com NODE_ENV=test; para simular outros ambientes,
  // carregamos como test e trocamos NODE_ENV depois.
  const { NODE_ENV, ...rest } = envOverrides;
  const loaded: Env = loadEnv({ ...rest, NODE_ENV: 'test' });
  const env: Env = NODE_ENV ? { ...loaded, NODE_ENV: NODE_ENV as Env['NODE_ENV'] } : loaded;
  const clock = new FakeClock();
  const discord = new FakeDiscord();
  const users = new MemoryUsers();
  const sessions = new MemorySessions();
  const settings = new MemorySettings();
  const auth = new AuthService({
    env,
    discord,
    users,
    sessions,
    settings,
    now: clock.now,
    ...(extra.guildPermissions ? { guildPermissions: extra.guildPermissions } : {}),
  });
  const app = createApp(env, createLogger(env), { auth });
  return { app, env, clock, discord, users, sessions, settings, auth };
}

export const ORIGIN = 'http://localhost:5173';
