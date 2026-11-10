export interface RoleConfig {
  adminRoleIds: string[];
  modRoleIds: string[];
  /** Pessoas adicionadas no painel como ADMIN, mesmo sem cargo no Discord. */
  adminUserIds?: string[];
  /** Pessoas adicionadas no painel como MOD, mesmo sem cargo no Discord. */
  modUserIds?: string[];
}

/** Pessoa com acesso ao painel concedido manualmente (não depende de cargo). */
export interface PanelUser {
  userId: string;
  role: 'ADMIN' | 'MOD';
  note: string | null;
  addedBy: string;
  addedAt: Date;
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
  /** Calls de voz habilitadas para lives, escolhidas pelo painel (além da categoria, se houver). */
  liveChannelIds: string[];
  /** Canal onde o bot registra eventos e erros importantes. */
  logChannelId: string | null;
  /** Cargo marcado nos avisos de reunião. `null` = não marca ninguém. */
  mentionRoleId: string | null;
  /** Segundos com a call vazia antes de encerrar a live. `null` = padrão do servidor. */
  emptyLiveEndSeconds: number | null;
  /** Minutos sem ninguém transmitindo câmera/tela até a sessão de mídia entrar em espera. */
  idleSessionMinutes: number;
  /** Minutos para alguém começar a transmitir depois de ativar a sessão. */
  activationGraceMinutes: number;
  panelUsers: PanelUser[];
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
    | 'liveChannelIds'
    | 'logChannelId'
    | 'mentionRoleId'
    | 'emptyLiveEndSeconds'
    | 'idleSessionMinutes'
    | 'activationGraceMinutes'
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
  /** Concede (ou troca o nível de) acesso ao painel a uma pessoa. */
  setPanelUser(guildId: string, user: PanelUser): Promise<GuildSettings>;
  removePanelUser(guildId: string, userId: string, updatedBy: string): Promise<GuildSettings>;
}

export const SETTINGS_DEFAULTS = {
  maxParticipantsLive: 500,
  graceSeconds: 30,
  idleSessionMinutes: 10,
  activationGraceMinutes: 3,
} as const;
