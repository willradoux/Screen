import type { Role } from '@screem/shared';
import type { DiscordGateway } from '../../discord/gateway.js';
import type { SettingsRepo } from '../settings/settings.types.js';
import { resolveRole } from './roles.js';

export interface RoleResolverDeps {
  gateway: Pick<DiscordGateway, 'getMemberPermissions' | 'getMemberRoleIds'>;
  settings: SettingsRepo;
  guildId: string;
  bootstrapAdminIds: string[];
  /** ADMIN_ROLE_IDS: cargos que são ADMIN sempre. */
  fixedAdminRoleIds?: string[];
}

/**
 * Papel de qualquer pessoa do servidor, sempre recalculado: cargos configurados,
 * dono e permissões do Discord (via bot) e `BOOTSTRAP_ADMIN_IDS`.
 * Usado nos comandos do bot e na moderação (papel do alvo).
 */
export class RoleResolver {
  constructor(private readonly deps: RoleResolverDeps) {}

  /** Quando já se conhecem os cargos (ex.: quem executou o comando). */
  async resolve(userId: string, memberRoleIds: string[]): Promise<Role> {
    const [config, perms] = await Promise.all([
      this.deps.settings.getRoleConfig(this.deps.guildId),
      this.deps.gateway
        .getMemberPermissions(userId)
        .catch(() => ({ isOwner: false, isAdmin: false, isMod: false })),
    ]);
    return resolveRole({
      userId,
      memberRoleIds,
      config,
      bootstrapAdminIds: this.deps.bootstrapAdminIds,
      fixedAdminRoleIds: this.deps.fixedAdminRoleIds ?? [],
      hasDiscordAdminPermission: perms.isOwner || perms.isAdmin,
      hasDiscordModPermission: perms.isMod,
    });
  }

  /** Busca os cargos no Discord. Lança se o membro não for encontrado. */
  async resolveUser(userId: string): Promise<Role> {
    return this.resolve(userId, await this.deps.gateway.getMemberRoleIds(userId));
  }
}
