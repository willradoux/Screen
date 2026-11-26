import type { Env } from '../config/env.js';
import type {
  ChannelInfo,
  DiscordGateway,
  MemberPermissions,
  MemberProfile,
  MessagePayload,
  RoleInfo,
  VoiceStateEntry,
} from '../discord/gateway.js';
import {
  DiscordAuthError,
  type DiscordApi,
  type DiscordMember,
  type DiscordUser,
} from '../modules/discord/discord-api.js';
import type { Logger } from '../shared/logger.js';
import {
  DEV_ADMIN_ROLE,
  DEV_CHANNELS,
  DEV_MOD_ROLE,
  DEV_PERSONAS,
  devPersona,
  type DevPersona,
} from './personas.js';

/*
 * O "Discord" do modo de desenvolvimento (ver personas.ts). O login não sai do computador:
 * "Entrar com Discord" abre a página /api/v1/dev/login, onde se escolhe a pessoa; o código
 * de volta é `dev:<id>`, e o token é o próprio id. Nada aqui roda em produção.
 */

const userOf = (p: DevPersona): DiscordUser => ({
  id: p.id,
  username: p.username,
  global_name: p.name,
  avatar: null,
});

const personaFromToken = (token: string) => {
  const p = token.startsWith('dev:') ? devPersona(token.slice(4)) : null;
  if (!p) throw new DiscordAuthError('Token de dev inválido');
  return p;
};

/** Login de mentira: troca o código `dev:<id>` pela pessoa correspondente. */
export function createDevDiscordApi(env: Pick<Env, 'PUBLIC_API_URL'>): DiscordApi {
  const tokens = (code: string) => {
    personaFromToken(code);
    return { accessToken: code, refreshToken: code, expiresIn: 7 * 86_400 };
  };
  return {
    buildAuthorizeUrl(state) {
      const url = new URL('/api/v1/dev/login', env.PUBLIC_API_URL);
      url.searchParams.set('state', state);
      return url.toString();
    },
    async exchangeCode(code) {
      return tokens(code);
    },
    async refresh(refreshToken) {
      return tokens(refreshToken);
    },
    async fetchMe(accessToken) {
      return userOf(personaFromToken(accessToken));
    },
    async fetchGuildMember(accessToken): Promise<DiscordMember> {
      const p = personaFromToken(accessToken);
      return { roles: p.roles, nick: null, user: userOf(p) };
    },
  };
}

/** Uma mensagem que o bot "mandou" (fica na página /api/v1/dev para conferir). */
export interface DevMessage {
  channelId: string;
  messageId: string;
  at: string;
  payload: MessagePayload;
  edited: boolean;
}

/**
 * Bot de mentira: canais e cargos fixos, quem está nas calls é simulado pela página de dev, e
 * as mensagens ficam guardadas (as últimas 50) e vão para o log, em vez de irem ao Discord.
 */
export class DevGateway implements DiscordGateway {
  readonly voiceStates = new Map<string, string>();
  readonly messages: DevMessage[] = [];
  private counter = 0;

  constructor(private readonly logger: Logger) {}

  async sendMessage(channelId: string, payload: MessagePayload) {
    const messageId = `dev-msg-${++this.counter}`;
    this.messages.unshift({
      channelId,
      messageId,
      at: new Date().toISOString(),
      payload,
      edited: false,
    });
    this.messages.length = Math.min(this.messages.length, 50);
    this.logger.info({ channelId, messageId, payload }, '[dev] o bot mandaria esta mensagem');
    return messageId;
  }

  async editMessage(channelId: string, messageId: string, payload: MessagePayload) {
    const m = this.messages.find((x) => x.messageId === messageId && x.channelId === channelId);
    if (!m) return 'not_found' as const;
    m.payload = payload;
    m.edited = true;
    return 'ok' as const;
  }

  async getChannel(id: string): Promise<ChannelInfo | null> {
    return DEV_CHANNELS.find((c) => c.id === id) ?? null;
  }

  async roleExists(id: string) {
    return id === DEV_ADMIN_ROLE || id === DEV_MOD_ROLE;
  }

  async listVoiceStates(): Promise<VoiceStateEntry[]> {
    return [...this.voiceStates].map(([userId, channelId]) => ({ userId, channelId }));
  }

  async getMemberPermissions(userId: string): Promise<MemberPermissions> {
    const p = devPersona(userId);
    return { isOwner: Boolean(p?.owner), isAdmin: false, isMod: false };
  }

  async getMemberRoleIds(userId: string) {
    const p = devPersona(userId);
    if (!p) throw new Error('Membro não encontrado');
    return p.roles;
  }

  async guildAvailable() {
    return true;
  }

  async listChannels(): Promise<ChannelInfo[]> {
    return DEV_CHANNELS;
  }

  async listRoles(): Promise<RoleInfo[]> {
    return [
      { id: DEV_ADMIN_ROLE, name: 'Admin (dev)', color: 0xff7a45, position: 2 },
      { id: DEV_MOD_ROLE, name: 'Mod (dev)', color: 0x2ee6c1, position: 1 },
    ];
  }

  async getMemberProfile(userId: string): Promise<MemberProfile | null> {
    const p = devPersona(userId);
    return p ? { id: p.id, username: p.username, displayName: p.name, avatarUrl: null } : null;
  }
}

export { DEV_PERSONAS };
