import type { Role } from '@screem/shared';
import type { RoleConfig } from '../settings/settings.types.js';

export interface ResolveRoleInput {
  userId: string;
  /** Cargos do membro na guilda. */
  memberRoleIds: string[];
  config: RoleConfig;
  /** IDs de admins fixos (BOOTSTRAP_ADMIN_IDS), úteis antes de configurar os cargos. */
  bootstrapAdminIds: string[];
  /** Cargos que são ADMIN sempre (ADMIN_ROLE_IDS), somados aos configurados com /config cargo-admin. */
  fixedAdminRoleIds?: string[];
  /** Dono da guilda ou permissão Administrator/ManageGuild no Discord (via bot, Fase 4). */
  hasDiscordAdminPermission?: boolean;
  /** Permissão MuteMembers/ModerateMembers no Discord (via bot). */
  hasDiscordModPermission?: boolean;
}

/** Ordem: ADMIN > MOD > MEMBER. O papel mais alto vence. Ver docs/backend/permissoes.md */
export function resolveRole(input: ResolveRoleInput): Role {
  const has = (ids: string[]) => ids.some((id) => input.memberRoleIds.includes(id));

  if (
    input.hasDiscordAdminPermission ||
    input.bootstrapAdminIds.includes(input.userId) ||
    has(input.config.adminRoleIds) ||
    has(input.fixedAdminRoleIds ?? [])
  ) {
    return 'ADMIN';
  }
  if (input.hasDiscordModPermission || has(input.config.modRoleIds)) return 'MOD';
  return 'MEMBER';
}
