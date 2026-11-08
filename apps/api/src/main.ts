import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDb, disconnectDb, pingDb } from './db/connection.js';
import { createDiscordSystem } from './discord/bootstrap.js';
import { VoiceCache } from './discord/voice-cache.js';
import { AuditService, createAuditRepo } from './modules/audit/audit.service.js';
import { createSessionRepo, createUserRepo } from './modules/auth/auth.repositories.js';
import { AuthService } from './modules/auth/auth.service.js';
import { createDiscordApi } from './modules/discord/discord-api.js';
import { createLiveKitGateway } from './modules/livekit/livekit.gateway.js';
import { LiveKitWebhookHandler } from './modules/livekit/livekit.webhook.js';
import { ModerationService } from './modules/moderation/moderation.service.js';
import type { MeetingsApi } from './modules/meetings/meetings.routes.js';
import type { ModerationApi } from './modules/moderation/moderation.routes.js';
import { RoomAccess } from './modules/rooms/access.js';
import { createBanRepo, createParticipationRepo } from './modules/rooms/participations.js';
import { PresenceService } from './modules/rooms/presence.js';
import { createRoomRepo } from './modules/rooms/rooms.repository.js';
import type { RoomsApi } from './modules/rooms/rooms.routes.js';
import { createSettingsRepo } from './modules/settings/settings.repository.js';
import type { AdminApi } from './modules/settings/settings.routes.js';
import { SettingsService } from './modules/settings/settings.service.js';
import { refreshGauges, startMetricsServer } from './observability/metrics.js';
import { LateBoundEmitter } from './realtime/emitter.js';
import { createSocketServer, type SocketServer } from './realtime/socket.js';
import { createLogger } from './shared/logger.js';
import { realScheduler } from './shared/scheduler.js';

const env = loadEnv();
const logger = createLogger(env);

try {
  await connectDb(env.MONGODB_URI, logger);
} catch (err) {
  logger.fatal({ err }, 'Não foi possível conectar ao MongoDB');
  process.exit(1);
}

const settings = createSettingsRepo();
const rooms = createRoomRepo();
const participations = createParticipationRepo();
const bans = createBanRepo();
const livekit = createLiveKitGateway(env);
const voiceCache = new VoiceCache();
const audit = new AuditService({ repo: createAuditRepo(), logger });

// O servidor Socket.IO só existe depois do http.Server; até lá os avisos vão para este intermediário.
const realtime = new LateBoundEmitter();
let sockets: SocketServer | undefined;

const presence = new PresenceService({
  participations,
  livekit,
  realtime,
  settings,
  cache: voiceCache,
  scheduler: realScheduler,
  logger,
  guildId: env.DISCORD_GUILD_ID,
});

// O bot é opcional em desenvolvimento: sem token, a API sobe sem ele (e sem salas).
const discord = env.DISCORD_BOT_TOKEN
  ? createDiscordSystem(env, logger, {
      rooms,
      settings,
      voiceCache,
      presence,
      audit,
      participations,
    })
  : null;
if (!discord) logger.warn('DISCORD_BOT_TOKEN ausente: o bot e as salas não serão iniciados');

const auth = new AuthService({
  env,
  discord: createDiscordApi(env),
  users: createUserRepo(),
  sessions: createSessionRepo(),
  settings,
  onSessionRevoked: (target) => sockets?.revoke(target),
  ...(discord ? { guildPermissions: discord.gateway } : {}),
});

let roomsApi: RoomsApi | undefined;
let moderationApi: ModerationApi | undefined;
let adminApi: AdminApi | undefined;
let meetingsApi: MeetingsApi | undefined;
let access: RoomAccess | undefined;
if (discord) {
  access = new RoomAccess({
    participations,
    bans,
    cache: voiceCache,
    gateway: discord.gateway,
    livekit,
    livekitPublicUrl: env.LIVEKIT_PUBLIC_URL,
    tokenTtlSeconds: env.JOIN_TOKEN_TTL_SECONDS,
  });
  roomsApi = {
    rooms,
    participations,
    access,
    presence,
    roomService: discord.roomService,
    webhook: new LiveKitWebhookHandler({
      livekit,
      rooms,
      participations,
      presence,
      realtime,
      cache: voiceCache,
      logger,
    }),
    audit,
    guildId: env.DISCORD_GUILD_ID,
    webUrl: env.WEB_URL,
  };

  moderationApi = {
    moderation: new ModerationService({
      rooms,
      participations,
      bans,
      livekit,
      presence,
      realtime,
      audit,
      roles: discord.roles,
      onRoomChanged: (room) => discord.announcer.refresh(room),
      logger,
    }),
    access,
    participations,
    webUrl: env.WEB_URL,
  };

  meetingsApi = {
    meetings: discord.meetings,
    participations,
    webUrl: env.WEB_URL,
  };

  adminApi = {
    settings: new SettingsService({
      settings,
      gateway: discord.gateway,
      audit,
      realtime,
      guildId: env.DISCORD_GUILD_ID,
    }),
    audit,
  };
}

const app = createApp(env, logger, {
  readiness: { mongo: pingDb },
  auth,
  ...(roomsApi ? { rooms: roomsApi } : {}),
  ...(moderationApi ? { moderation: moderationApi } : {}),
  ...(adminApi ? { admin: adminApi } : {}),
  ...(meetingsApi ? { meetings: meetingsApi } : {}),
});
const server = createServer(app);

if (access) {
  sockets = createSocketServer({
    httpServer: server,
    env,
    auth,
    rooms,
    participations,
    access,
    logger,
  });
  realtime.attach(sockets);
}

server.listen(env.PORT, () => logger.info(`API ouvindo na porta ${env.PORT}`));

// Métricas numa porta interna (o compose não a publica); só liga se METRICS_PORT > 0.
const metricsServer =
  env.METRICS_PORT > 0
    ? startMetricsServer(
        env.METRICS_PORT,
        () =>
          refreshGauges({
            openLiveCount: async () => (await rooms.listOpenLive(env.DISCORD_GUILD_ID)).length,
            openMeetingCount: async () =>
              (await rooms.listMeetings(env.DISCORD_GUILD_ID, ['OPEN'])).length,
            connectedParticipants: () => participations.countAllOpen(),
          }),
        logger,
      )
    : null;

if (discord) {
  discord.bot.start().catch((err) => {
    logger.fatal({ err }, 'Falha ao iniciar o bot do Discord');
    process.exit(1);
  });
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info(`${sig} recebido, encerrando`);
    void (async () => {
      discord?.meetingScheduler.stop();
      metricsServer?.close();
      await sockets?.close();
      await discord?.bot.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await disconnectDb();
      process.exit(0);
    })();
  });
}
