import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  type Client,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';
import type {
  ChannelInfo,
  DiscordGateway,
  MemberPermissions,
  MessagePayload,
  VoiceStateEntry,
} from './gateway.js';

const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;

function toOptions(payload: MessagePayload) {
  return {
    ...(payload.content !== undefined ? { content: payload.content } : {}),
    embeds: payload.embeds,
    components: payload.components,
    ...(payload.allowed_mentions ? { allowedMentions: payload.allowed_mentions } : {}),
  };
}

/** Implementação do `DiscordGateway` sobre o discord.js. Não é testada sem rede. */
export class DiscordJsGateway implements DiscordGateway {
  constructor(
    private readonly client: Client,
    private readonly guildId: string,
  ) {}

  private async textChannel(channelId: string) {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      throw new Error(`Canal ${channelId} não aceita mensagens`);
    }
    return channel;
  }

  async sendMessage(channelId: string, payload: MessagePayload): Promise<string> {
    const channel = await this.textChannel(channelId);
    const message = await channel.send(toOptions(payload) as unknown as MessageCreateOptions);
    return message.id;
  }

  async editMessage(
    channelId: string,
    messageId: string,
    payload: MessagePayload,
  ): Promise<'ok' | 'not_found'> {
    try {
      const channel = await this.textChannel(channelId);
      const message = await channel.messages.fetch(messageId);
      await message.edit(toOptions(payload) as unknown as MessageEditOptions);
      return 'ok';
    } catch (err) {
      if (
        err instanceof DiscordAPIError &&
        (err.code === UNKNOWN_MESSAGE || err.code === UNKNOWN_CHANNEL)
      ) {
        return 'not_found';
      }
      throw err;
    }
  }

  async getChannel(channelId: string): Promise<ChannelInfo | null> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel) return null;

    let kind: ChannelInfo['kind'] = 'other';
    if (channel.type === ChannelType.GuildVoice) kind = 'voice';
    else if (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement
    )
      kind = 'text';
    else if (channel.type === ChannelType.GuildCategory) kind = 'category';

    return {
      id: channel.id,
      name: 'name' in channel && channel.name ? channel.name : channel.id,
      kind,
      parentId: 'parentId' in channel ? (channel.parentId ?? null) : null,
    };
  }

  async roleExists(roleId: string): Promise<boolean> {
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return false;
    return (await guild.roles.fetch(roleId).catch(() => null)) !== null;
  }

  async listVoiceStates(): Promise<VoiceStateEntry[]> {
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return [];
    const out: VoiceStateEntry[] = [];
    for (const state of guild.voiceStates.cache.values()) {
      if (state.channelId && !state.member?.user.bot) {
        out.push({ userId: state.id, channelId: state.channelId });
      }
    }
    return out;
  }

  async getMemberRoleIds(userId: string): Promise<string[]> {
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) throw new Error('Servidor não encontrado');
    const member = await guild.members.fetch(userId);
    return [...member.roles.cache.keys()];
  }

  async getMemberPermissions(userId: string): Promise<MemberPermissions> {
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return { isOwner: false, isAdmin: false, isMod: false };
    const member = await guild.members.fetch(userId);
    const p = member.permissions;
    return {
      isOwner: guild.ownerId === userId,
      isAdmin: p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild),
      isMod: p.has(PermissionFlagsBits.MuteMembers) || p.has(PermissionFlagsBits.ModerateMembers),
    };
  }
}
