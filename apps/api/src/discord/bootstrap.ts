import { Client, GatewayIntentBits } from 'discord.js';
import type { Env } from '../config/env.js';
import { RoomAnnouncer } from '../modules/rooms/announcer.js';
import { RoomService } from '../modules/rooms/rooms.service.js';
import type { AuditLog } from '../modules/audit/audit.service.js';
import { RoleResolver } from '../modules/permissions/role-resolver.js';
import type { PresenceService } from '../modules/rooms/presence.js';
import type { RoomRepo } from '../modules/rooms/rooms.types.js';
import type { SettingsRepo } from '../modules/settings/settings.types.js';
import type { Logger } from '../shared/logger.js';
import { realScheduler } from '../shared/scheduler.js';
import { DiscordBot } from './bot.js';
import { ConfigHandler } from './commands/config-handler.js';
import { MeetingHandler } from './commands/meeting-handler.js';
import { CommandRouter } from './commands/router.js';
import { DiscordJsGateway } from './discord-js-gateway.js';
import type { DiscordGateway } from './gateway.js';
import { LiveVoiceHandler } from './live-handler.js';
import { VoiceCache } from './voice-cache.js';

export interface DiscordSystem {
  bot: DiscordBot;
  gateway: DiscordGateway;
  roomService: RoomService;
  announcer: RoomAnnouncer;
  roles: RoleResolver;
  voiceCache: VoiceCache;
}

/** Monta o bot e tudo que ele usa. Só é chamado quando há `DISCORD_BOT_TOKEN`. */
export function createDiscordSystem(
  env: Env,
  logger: Logger,
  deps: {
    rooms: RoomRepo;
    settings: SettingsRepo;
    /** Compartilhado com a API: é a fonte da verdade de "quem está na call". */
    voiceCache: VoiceCache;
    presence: PresenceService;
    audit: AuditLog;
  },
): DiscordSystem {
  const repos = deps;
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN ausente');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
  });
  const guildId = env.DISCORD_GUILD_ID;
  const gateway = new DiscordJsGateway(client, guildId);
  const voiceCache = deps.voiceCache;

  const announcer = new RoomAnnouncer({
    gateway,
    rooms: repos.rooms,
    settings: repos.settings,
    scheduler: realScheduler,
    logger,
    guildId,
    webUrl: env.WEB_URL,
    mentionRoleId: env.MEETING_MENTION_ROLE_ID,
    countParticipants: (room) => (room.voiceChannelId ? voiceCache.count(room.voiceChannelId) : 0),
  });
  const roomService = new RoomService({ rooms: repos.rooms, announcer, logger });

  const live = new LiveVoiceHandler({
    gateway,
    settings: repos.settings,
    rooms: repos.rooms,
    roomService,
    announcer,
    cache: voiceCache,
    scheduler: realScheduler,
    logger,
    guildId,
    emptyEndSeconds: env.EMPTY_LIVE_END_SECONDS,
    presence: deps.presence,
  });

  // Sala encerrada (por qualquer motivo): derruba o LiveKit e avisa os clientes.
  roomService.onEnded((room, reason) => deps.presence.onRoomEnded(room, reason));

  // Papel de qualquer pessoa, sempre recalculado (comandos do bot e moderação).
  const roles = new RoleResolver({
    gateway,
    settings: repos.settings,
    guildId,
    bootstrapAdminIds: env.bootstrapAdminIds,
  });

  const router = new CommandRouter({
    roles,
    config: new ConfigHandler({ settings: repos.settings, gateway, audit: deps.audit, guildId }),
    meetings: new MeetingHandler({
      rooms: repos.rooms,
      roomService,
      settings: repos.settings,
      audit: deps.audit,
      guildId,
      webUrl: env.WEB_URL,
      timezone: env.TIMEZONE,
    }),
    logger,
  });

  const bot = new DiscordBot({
    client,
    token,
    guildId,
    live,
    router,
    settings: repos.settings,
    logger,
  });

  return { bot, gateway, roomService, announcer, roles, voiceCache };
}
