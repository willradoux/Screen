import type {
  ChannelInfo,
  DiscordGateway,
  MemberProfile,
  RoleInfo,
} from '../../discord/gateway.js';
import type { RealtimeEmitter } from '../../realtime/emitter.js';
import { AppError } from '../../shared/errors.js';
import type { AuditLog } from '../audit/audit.service.js';
import type { GuildSettings, PanelUser, SettingsPatch, SettingsRepo } from './settings.types.js';

export interface SettingsServiceDeps {
  settings: SettingsRepo;
  gateway: Pick<
    DiscordGateway,
    'getChannel' | 'roleExists' | 'listChannels' | 'listRoles' | 'getMemberProfile'
  >;
  audit: AuditLog;
  realtime: RealtimeEmitter;
  guildId: string;
}

const invalidRef = (field: string, id: string, what: string) =>
  new AppError('INVALID_DISCORD_REFERENCE', 400, `${what} não existe neste servidor.`, {
    field,
    id,
  });

const CHANNEL_FIELDS = {
  liveCategoryId: { kind: 'category', label: 'A categoria' },
  liveTextChannelId: { kind: 'text', label: 'O canal de texto' },
  announceChannelId: { kind: 'text', label: 'O canal de avisos' },
  logChannelId: { kind: 'text', label: 'O canal de logs' },
} as const;

const ROLE_FIELDS = ['adminRoleIds', 'modRoleIds', 'meetingAllowedRoleIds'] as const;

/** Configuração da guilda pela API (a mesma que os comandos `/config` alteram). */
export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  get(): Promise<GuildSettings> {
    return this.deps.settings.get(this.deps.guildId);
  }

  /**
   * Valida que canais e cargos existem de verdade no Discord, grava, audita e avisa
   * os admins conectados. Listas de cargos são substituídas por inteiro.
   */
  async update(actorId: string, patch: SettingsPatch): Promise<GuildSettings> {
    const { gateway } = this.deps;

    for (const [field, rule] of Object.entries(CHANNEL_FIELDS)) {
      const id = patch[field as keyof typeof CHANNEL_FIELDS];
      if (id === undefined || id === null) continue; // ausente = não mexe; null = limpa
      const channel = await gateway.getChannel(id);
      if (channel?.kind !== rule.kind) throw invalidRef(field, id, rule.label);
    }
    for (const id of patch.liveChannelIds ?? []) {
      const channel = await gateway.getChannel(id);
      if (channel?.kind !== 'voice') throw invalidRef('liveChannelIds', id, 'A call de voz');
    }
    if (patch.mentionRoleId && !(await gateway.roleExists(patch.mentionRoleId))) {
      throw invalidRef('mentionRoleId', patch.mentionRoleId, 'O cargo');
    }
    for (const field of ROLE_FIELDS) {
      for (const id of patch[field] ?? []) {
        if (!(await gateway.roleExists(id))) throw invalidRef(field, id, 'O cargo');
      }
    }

    const before = await this.get();
    const after = await this.deps.settings.update(this.deps.guildId, patch, actorId);

    const keys = Object.keys(patch) as (keyof SettingsPatch)[];
    const changes = Object.fromEntries(
      keys.map((k) => [k, { from: before[k] ?? null, to: after[k] ?? null }]),
    );
    await this.deps.audit.record({
      actorId,
      action: 'SETTINGS_UPDATED',
      meta: { changes },
    });
    this.deps.realtime.toAdmins('settings:updated', { keys });
    return after;
  }

  // ---------- Catálogo do servidor (para o painel mostrar listas de escolha) ----------

  /** Canais e cargos do servidor, para o painel montar as listas de escolha. */
  async catalog(): Promise<{ channels: ChannelInfo[]; roles: RoleInfo[] }> {
    const [channels, roles] = await Promise.all([
      this.deps.gateway.listChannels(),
      this.deps.gateway.listRoles(),
    ]);
    return { channels, roles };
  }

  // ---------- Pessoas com acesso ao painel ----------

  /** Lista com nome e foto quando a pessoa ainda está no servidor. */
  async listPanelUsers(): Promise<(PanelUser & { profile: MemberProfile | null })[]> {
    const { panelUsers } = await this.get();
    return Promise.all(
      panelUsers.map(async (p) => ({
        ...p,
        profile: await this.deps.gateway.getMemberProfile(p.userId).catch(() => null),
      })),
    );
  }

  /**
   * Dá acesso ao painel a alguém, com ou sem cargo no Discord. Já na lista = troca o nível.
   * A pessoa não precisa estar no servidor (colaboradores externos).
   */
  async addPanelUser(
    actorId: string,
    input: { userId: string; role: 'ADMIN' | 'MOD'; note?: string | null },
  ): Promise<GuildSettings> {
    const after = await this.deps.settings.setPanelUser(this.deps.guildId, {
      userId: input.userId,
      role: input.role,
      note: input.note?.trim() || null,
      addedBy: actorId,
      addedAt: new Date(),
    });
    await this.deps.audit.record({
      actorId,
      action: 'PANEL_USER_ADDED',
      targetId: input.userId,
      meta: { role: input.role },
    });
    this.deps.realtime.toAdmins('settings:updated', { keys: ['panelUsers'] });
    return after;
  }

  async removePanelUser(actorId: string, userId: string): Promise<GuildSettings> {
    const after = await this.deps.settings.removePanelUser(this.deps.guildId, userId, actorId);
    await this.deps.audit.record({ actorId, action: 'PANEL_USER_REMOVED', targetId: userId });
    this.deps.realtime.toAdmins('settings:updated', { keys: ['panelUsers'] });
    return after;
  }
}
