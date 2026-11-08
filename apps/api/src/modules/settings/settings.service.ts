import type { DiscordGateway } from '../../discord/gateway.js';
import type { RealtimeEmitter } from '../../realtime/emitter.js';
import { AppError } from '../../shared/errors.js';
import type { AuditLog } from '../audit/audit.service.js';
import type { GuildSettings, SettingsPatch, SettingsRepo } from './settings.types.js';

export interface SettingsServiceDeps {
  settings: SettingsRepo;
  gateway: Pick<DiscordGateway, 'getChannel' | 'roleExists'>;
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
}
