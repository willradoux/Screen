import {
  ApplicationCommandOptionType,
  Events,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
} from 'discord.js';
import type { Logger } from '../shared/logger.js';
import type { SettingsRepo } from '../modules/settings/settings.types.js';
import { buildCommandDefinitions } from './commands/definitions.js';
import type { CommandRouter } from './commands/router.js';
import type { CommandActor, CommandCall } from './commands/types.js';
import type { LiveVoiceHandler } from './live-handler.js';

export interface BotDeps {
  client: Client;
  token: string;
  guildId: string;
  live: LiveVoiceHandler;
  router: CommandRouter;
  settings: SettingsRepo;
  logger: Logger;
}

/** Liga o discord.js às regras de negócio. Sem lógica própria. */
export class DiscordBot {
  constructor(private readonly deps: BotDeps) {}

  async start(): Promise<void> {
    const { client, token, logger } = this.deps;

    client.once(Events.ClientReady, (ready) => {
      logger.info({ bot: ready.user.tag }, 'bot conectado ao Discord');
      void this.onReady();
    });

    // Reconexão do gateway: o que aconteceu enquanto estávamos fora não chegou como evento.
    client.on(Events.ShardResume, () => void this.reconcile());

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      if (newState.guild.id !== this.deps.guildId) return;
      if (newState.member?.user.bot || oldState.member?.user.bot) return;
      this.deps.live
        .handle({
          userId: newState.id,
          oldChannelId: oldState.channelId,
          newChannelId: newState.channelId,
        })
        .catch((err) => logger.error({ err }, 'falha ao tratar voiceStateUpdate'));
    });

    client.on(Events.InteractionCreate, (interaction) => {
      this.onInteraction(interaction).catch((err) =>
        logger.error({ err }, 'falha ao tratar interação'),
      );
    });

    // Canal ou cargo apagado: limpa a configuração para não apontar para o vazio.
    const onDeleted = (id: string, what: string) => {
      this.deps.settings
        .removeReference(this.deps.guildId, id)
        .then(() => logger.warn({ id }, `${what} apagado: referência removida da configuração`))
        .catch((err) => logger.error({ err }, 'falha ao limpar referência'));
    };
    client.on(Events.ChannelDelete, (channel) => {
      if ('guildId' in channel && channel.guildId === this.deps.guildId) {
        onDeleted(channel.id, 'canal');
      }
    });
    client.on(Events.GuildRoleDelete, (role) => {
      if (role.guild.id === this.deps.guildId) onDeleted(role.id, 'cargo');
    });

    await client.login(token);
  }

  async stop(): Promise<void> {
    await this.deps.client.destroy();
  }

  private async onReady(): Promise<void> {
    const { client, guildId, logger } = this.deps;
    try {
      const guild = await client.guilds.fetch(guildId);
      await guild.members.fetch(); // cache de membros para checar permissões
      await guild.commands.set(buildCommandDefinitions());
      logger.info('slash commands registrados');
    } catch (err) {
      logger.error({ err }, 'falha ao registrar comandos (o bot está no servidor certo?)');
    }
    await this.reconcile();
  }

  private async reconcile(): Promise<void> {
    try {
      await this.deps.live.reconcile();
      this.deps.logger.info('estado de voz reconciliado');
    } catch (err) {
      this.deps.logger.error({ err }, 'falha na reconciliação');
    }
  }

  private actorOf(interaction: Interaction): CommandActor {
    const roles = interaction.member?.roles;
    const memberRoleIds = Array.isArray(roles) ? roles : roles ? [...roles.cache.keys()] : [];
    return { userId: interaction.user.id, memberRoleIds };
  }

  private callOf(interaction: ChatInputCommandInteraction): CommandCall {
    const sub = interaction.options.data.find(
      (o) => o.type === ApplicationCommandOptionType.Subcommand,
    );
    const options: CommandCall['options'] = {};
    for (const o of sub?.options ?? []) {
      if (o.value !== undefined && o.value !== null) options[o.name] = o.value;
    }
    return { command: interaction.commandName, sub: sub?.name ?? '', options };
  }

  private async onInteraction(interaction: Interaction): Promise<void> {
    if (interaction.guildId !== this.deps.guildId) return;

    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      const choices = await this.deps.router.autocomplete(
        this.actorOf(interaction),
        {
          command: interaction.commandName,
          sub: interaction.options.getSubcommand(false) ?? '',
        },
        String(focused.value),
      );
      await interaction.respond(choices);
      return;
    }

    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reply = await this.deps.router.handle(
        this.actorOf(interaction),
        this.callOf(interaction),
      );
      await interaction.editReply({ content: reply.content, allowedMentions: { parse: [] } });
    }
  }
}
