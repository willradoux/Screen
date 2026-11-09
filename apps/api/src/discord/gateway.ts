/**
 * Fronteira com o Discord usada pelas regras de negócio. A implementação real
 * (discord.js) está em `discord-js-gateway.ts`; nos testes usamos um fake.
 */

export type ChannelKind = 'voice' | 'text' | 'category' | 'other';

export interface ChannelInfo {
  id: string;
  name: string;
  kind: ChannelKind;
  /** ID da categoria pai, quando houver. */
  parentId: string | null;
}

export interface VoiceStateEntry {
  userId: string;
  channelId: string;
}

export interface MemberPermissions {
  /** Dono do servidor. */
  isOwner: boolean;
  /** Administrator ou ManageGuild. */
  isAdmin: boolean;
  /** MuteMembers ou ModerateMembers. */
  isMod: boolean;
}

/** Mensagem no formato cru da API do Discord (embeds + componentes). */
export interface MessagePayload {
  content?: string;
  embeds: Record<string, unknown>[];
  components: Record<string, unknown>[];
  allowed_mentions?: { parse?: string[]; roles?: string[]; users?: string[] };
}

export interface DiscordGateway {
  /** Envia uma mensagem e devolve o ID. Lança se não conseguir. */
  sendMessage(channelId: string, payload: MessagePayload): Promise<string>;
  /** Edita uma mensagem. `not_found` se ela foi apagada. */
  editMessage(
    channelId: string,
    messageId: string,
    payload: MessagePayload,
  ): Promise<'ok' | 'not_found'>;
  getChannel(channelId: string): Promise<ChannelInfo | null>;
  roleExists(roleId: string): Promise<boolean>;
  /** Todos os membros (não bots) em canais de voz agora. Usado ao iniciar. */
  listVoiceStates(): Promise<VoiceStateEntry[]>;
  getMemberPermissions(userId: string): Promise<MemberPermissions>;
  /** Cargos do membro no servidor. Lança se ele não for encontrado. */
  getMemberRoleIds(userId: string): Promise<string[]>;
  /** Todos os canais do servidor (voz, texto e categorias), para o painel escolher. */
  listChannels(): Promise<ChannelInfo[]>;
  /** Cargos do servidor (sem @everyone), para o painel escolher. */
  listRoles(): Promise<RoleInfo[]>;
  /** Dados públicos de uma pessoa do servidor (para o painel mostrar nome ao adicionar). `null` se não for membro. */
  getMemberProfile(userId: string): Promise<MemberProfile | null>;
}

export interface RoleInfo {
  id: string;
  name: string;
  color: number;
  /** Posição na hierarquia (maior = mais alto). */
  position: number;
}

export interface MemberProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}
