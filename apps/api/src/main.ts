import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDb, disconnectDb, pingDb } from './db/connection.js';
import { createDiscordSystem } from './discord/bootstrap.js';
import { VoiceCache } from './discord/voice-cache.js';
import { createSessionRepo, createUserRepo } from './modules/auth/auth.repositories.js';
import { AuthService } from './modules/auth/auth.service.js';
import { createDiscordApi } from './modules/discord/discord-api.js';
import { createLiveKitGateway } from './modules/livekit/livekit.gateway.js';
import { LiveKitWebhookHandler } from './modules/livekit/livekit.webhook.js';
import { RoomAccess } from './modules/rooms/access.js';
import { createBanRepo, createParticipationRepo } from './modules/rooms/participations.js';
import { PresenceService } from './modules/rooms/presence.js';
import { createRoomRepo } from './modules/rooms/rooms.repository.js';
import type { RoomsApi } from './modules/rooms/rooms.routes.js';
import { createSettingsRepo } from './modules/settings/settings.repository.js';
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
  ? createDiscordSystem(env, logger, { rooms, settings, voiceCache, presence })
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
    guildId: env.DISCORD_GUILD_ID,
    webUrl: env.WEB_URL,
  };
}

const app = createApp(env, logger, {
  readiness: { mongo: pingDb },
  auth,
  ...(roomsApi ? { rooms: roomsApi } : {}),
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
      await sockets?.close();
      await discord?.bot.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await disconnectDb();
      process.exit(0);
    })();
  });
}
