export interface RoleConfig {
  adminRoleIds: string[];
  modRoleIds: string[];
}

/** Configuração da guilda (coleção `guild_settings`). Ver docs/backend/modelo-de-dados.md. */
export interface GuildSettings extends RoleConfig {
  guildId: string;
  liveCategoryId: string | null;
  liveTextChannelId: string | null;
  announceChannelId: string | null;
  meetingAllowedRoleIds: string[];
  maxParticipantsLive: number;
  graceSeconds: number;
}

export type RoleListField = 'adminRoleIds' | 'modRoleIds' | 'meetingAllowedRoleIds';

export type SettingsPatch = Partial<
  Pick<
    GuildSettings,
    | 'liveCategoryId'
    | 'liveTextChannelId'
    | 'announceChannelId'
    | 'maxParticipantsLive'
    | 'graceSeconds'
    | 'adminRoleIds'
    | 'modRoleIds'
    | 'meetingAllowedRoleIds'
  >
>;

export interface SettingsRepo {
  getRoleConfig(guildId: string): Promise<RoleConfig>;
  /** Sempre devolve a configuração, com padrões quando nada foi salvo. */
  get(guildId: string): Promise<GuildSettings>;
  update(guildId: string, patch: SettingsPatch, updatedBy: string): Promise<GuildSettings>;
  modifyList(
    guildId: string,
    field: RoleListField,
    action: 'add' | 'remove',
    roleId: string,
    updatedBy: string,
  ): Promise<GuildSettings>;
  /** Remove qualquer referência a um canal/cargo apagado no Discord. */
  removeReference(guildId: string, id: string): Promise<void>;
}

export const SETTINGS_DEFAULTS = {
  maxParticipantsLive: 25,
  graceSeconds: 30,
} as const;
