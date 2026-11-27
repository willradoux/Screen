import { Client, GatewayIntentBits } from 'discord.js';
import type { Env } from '../config/env.js';
import { RoomAnnouncer } from '../modules/rooms/announcer.js';
import { RoomService } from '../modules/rooms/rooms.service.js';
import type { AuditLog } from '../modules/audit/audit.service.js';
import { buildReport, summarize } from '../modules/meetings/report.js';
import { MeetingService } from '../modules/meetings/meetings.service.js';
import { MeetingScheduler } from '../modules/meetings/scheduler.js';
import { RoleResolver } from '../modules/permissions/role-resolver.js';
import type { ParticipationRepo } from '../modules/rooms/participations.js';
import type { MediaSessionService } from '../modules/rooms/media-session.js';
import type { PresenceService } from '../modules/rooms/presence.js';
import type { RoomRepo } from '../modules/rooms/rooms.types.js';
import type { SettingsRepo } from '../modules/settings/settings.types.js';
import type { Logger } from '../shared/logger.js';
import { realScheduler } from '../shared/scheduler.js';
import { DiscordBot } from './bot.js';
import { DiscordOpsLogger } from './ops-logger.js';
import { ConfigHandler } from './commands/config-handler.js';
import { MeetingHandler } from './commands/meeting-handler.js';
import { ScreenHandler } from './commands/screen-handler.js';
import { CommandRouter } from './commands/router.js';
import { DiscordJsGateway } from './discord-js-gateway.js';
import type { DiscordGateway } from './gateway.js';
import { LiveVoiceHandler } from './live-handler.js';
import { VoiceCache } from './voice-cache.js';

/** O bot visto de fora: só liga e desliga. */
export interface BotHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Peças que o bot recebe para ligar o Discord às regras (ver `assembleDiscordSystem`). */
export interface BotParts {
  live: LiveVoiceHandler;
  router: CommandRouter;
  onReady: () => void;
}

export interface DiscordSystem {
  bot: BotHandle;
  /** Quem entra e sai das calls (o modo dev usa para simular a call do Discord). */
  live: LiveVoiceHandler;
  gateway: DiscordGateway;
  roomService: RoomService;
  announcer: RoomAnnouncer;
  roles: RoleResolver;
  meetings: MeetingService;
  /** Abre reuniões no horário, manda lembretes e encerra reuniões abandonadas. */
  meetingScheduler: MeetingScheduler;
  voiceCache: VoiceCache;
  /** Escreve no canal de logs escolhido no painel. */
  opsLogger: DiscordOpsLogger;
}

/** Monta o bot e tudo que ele usa. Só é chamado quando há `DISCORD_BOT_TOKEN`. */
export interface DiscordSystemDeps {
  rooms: RoomRepo;
  settings: SettingsRepo;
  /** Compartilhado com a API: é a fonte da verdade de "quem está na call". */
  voiceCache: VoiceCache;
  presence: PresenceService;
  /** Sessão de mídia das lives (ativa/em espera). */
  mediaSessions: MediaSessionService;
  audit: AuditLog;
  participations: ParticipationRepo;
}

export function createDiscordSystem(
  env: Env,
  logger: Logger,
  deps: DiscordSystemDeps,
): DiscordSystem {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN ausente');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
  });
  const gateway = new DiscordJsGateway(client, env.DISCORD_GUILD_ID);
  return assembleDiscordSystem(env, logger, deps, gateway, (parts) => {
    return new DiscordBot({
      client,
      token,
      guildId: env.DISCORD_GUILD_ID,
      live: parts.live,
      router: parts.router,
      settings: deps.settings,
      logger,
      onReady: parts.onReady,
    });
  });
}

/**
 * Monta as regras do Screen em volta de um gateway do Discord: anúncios, salas, reuniões,
 * lives pela call de voz e comandos. O gateway e o bot vêm de fora: o real (discord.js) em
 * produção, ou um de mentira no modo de desenvolvimento (`DEV_FAKE_DISCORD`).
 */
export function assembleDiscordSystem(
  env: Env,
  logger: Logger,
  deps: DiscordSystemDeps,
  gateway: DiscordGateway,
  makeBot: (parts: BotParts) => BotHandle,
): DiscordSystem {
  const repos = deps;
  const guildId = env.DISCORD_GUILD_ID;
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
    // Embed final da reunião: duração, participantes e pico.
    summary: async (room) =>
      summarize(buildReport(room, await deps.participations.listAll(room.id), new Date())),
  });
  const roomService = new RoomService({ rooms: repos.rooms, announcer, logger });

  const meetings = new MeetingService({
    rooms: repos.rooms,
    roomService,
    announcer,
    settings: repos.settings,
    gateway,
    participations: deps.participations,
    audit: deps.audit,
    logger,
    guildId,
  });

  const meetingScheduler = new MeetingScheduler({
    rooms: repos.rooms,
    roomService,
    announcer,
    participations: deps.participations,
    audit: deps.audit,
    scheduler: realScheduler,
    logger,
    guildId,
    intervalMs: env.SCHEDULER_INTERVAL_SECONDS * 1000,
    emptyEndMinutes: env.EMPTY_MEETING_END_MINUTES,
  });

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
  roomService.onEnded((room, reason) => {
    deps.mediaSessions.forget(room.id);
    return deps.presence.onRoomEnded(room, reason);
  });
  // Quando a sessão entra em espera ou é ativada, o embed da live acompanha.
  deps.mediaSessions.setOnChange((room) => announcer.scheduleRefresh(room.id));

  // Papel de qualquer pessoa, sempre recalculado (comandos do bot e moderação).
  const roles = new RoleResolver({
    gateway,
    settings: repos.settings,
    guildId,
    bootstrapAdminIds: env.bootstrapAdminIds,
    fixedAdminRoleIds: env.adminRoleIds,
  });

  const router = new CommandRouter({
    roles,
    config: new ConfigHandler({ settings: repos.settings, gateway, audit: deps.audit, guildId }),
    meetings: new MeetingHandler({
      rooms: repos.rooms,
      meetings,
      guildId,
      webUrl: env.WEB_URL,
      timezone: env.TIMEZONE,
    }),
    screen: new ScreenHandler({
      rooms: repos.rooms,
      voice: voiceCache,
      guildId,
      webUrl: env.WEB_URL,
    }),
    logger,
  });

  const opsLogger = new DiscordOpsLogger({ gateway, settings: repos.settings, guildId, logger });

  const bot = makeBot({
    live,
    router,
    // Só liga o relógio das reuniões com o bot conectado (avisos e lembretes precisam dele).
    onReady: () => {
      meetingScheduler.start();
      deps.mediaSessions.start();
    },
  });

  return {
    bot,
    live,
    gateway,
    roomService,
    announcer,
    roles,
    meetings,
    meetingScheduler,
    voiceCache,
    opsLogger,
  };
}
