import { ROLE_RANK, type Role } from '@screem/shared';
import type { Logger } from '../../shared/logger.js';
import { resolveRole } from '../../modules/permissions/roles.js';
import type { SettingsRepo } from '../../modules/settings/settings.types.js';
import type { DiscordGateway } from '../gateway.js';
import type { ConfigHandler } from './config-handler.js';
import type { MeetingHandler } from './meeting-handler.js';
import {
  UserError,
  type AutocompleteChoice,
  type CommandActor,
  type CommandCall,
  type CommandContext,
  type CommandReply,
} from './types.js';

export interface RouterDeps {
  gateway: DiscordGateway;
  settings: SettingsRepo;
  config: ConfigHandler;
  meetings: MeetingHandler;
  logger: Logger;
  guildId: string;
  bootstrapAdminIds: string[];
}

/** Papel mínimo para cada comando. Ver docs/backend/permissoes.md. */
function requiredRole(call: CommandCall): Role {
  if (call.command === 'config') return 'ADMIN';
  if (call.command === 'reuniao') {
    // Encerrar é de moderação; o resto (criar, agendar, cancelar, listar) é de admin.
    return call.sub === 'encerrar' ? 'MOD' : 'ADMIN';
  }
  return 'ADMIN';
}

export class CommandRouter {
  constructor(private readonly deps: RouterDeps) {}

  /** Papel de quem executa, sempre recalculado (nunca confiamos em cache de interação). */
  async roleOf(actor: CommandActor): Promise<Role> {
    const [config, perms] = await Promise.all([
      this.deps.settings.getRoleConfig(this.deps.guildId),
      this.deps.gateway
        .getMemberPermissions(actor.userId)
        .catch(() => ({ isOwner: false, isAdmin: false, isMod: false })),
    ]);
    return resolveRole({
      userId: actor.userId,
      memberRoleIds: actor.memberRoleIds,
      config,
      bootstrapAdminIds: this.deps.bootstrapAdminIds,
      hasDiscordAdminPermission: perms.isOwner || perms.isAdmin,
      hasDiscordModPermission: perms.isMod,
    });
  }

  async handle(actor: CommandActor, call: CommandCall): Promise<CommandReply> {
    try {
      const role = await this.roleOf(actor);
      if (ROLE_RANK[role] < ROLE_RANK[requiredRole(call)]) {
        return { content: '🚫 Você não tem permissão para usar este comando.' };
      }
      const ctx: CommandContext = { ...actor, role };

      if (call.command === 'config') return await this.deps.config.handle(ctx, call);
      if (call.command === 'reuniao') return await this.deps.meetings.handle(ctx, call);
      return { content: 'Comando desconhecido.' };
    } catch (err) {
      if (err instanceof UserError) return { content: `❌ ${err.message}` };
      this.deps.logger.error({ err, command: call.command, sub: call.sub }, 'falha em comando');
      return { content: '❌ Algo deu errado. Tente novamente em instantes.' };
    }
  }

  /** Autocomplete só para admins/mods, para não vazar títulos de reuniões. */
  async autocomplete(
    actor: CommandActor,
    call: Pick<CommandCall, 'command' | 'sub'>,
    query: string,
  ): Promise<AutocompleteChoice[]> {
    try {
      if (call.command !== 'reuniao') return [];
      const role = await this.roleOf(actor);
      if (ROLE_RANK[role] < ROLE_RANK.MOD) return [];
      return await this.deps.meetings.autocomplete(query);
    } catch (err) {
      this.deps.logger.warn({ err }, 'falha no autocomplete');
      return [];
    }
  }
}
