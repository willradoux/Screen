import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDb, disconnectDb, pingDb } from './db/connection.js';
import { createDiscordSystem } from './discord/bootstrap.js';
import { createSessionRepo, createUserRepo } from './modules/auth/auth.repositories.js';
import { AuthService } from './modules/auth/auth.service.js';
import { createDiscordApi } from './modules/discord/discord-api.js';
import { createRoomRepo } from './modules/rooms/rooms.repository.js';
import { createSettingsRepo } from './modules/settings/settings.repository.js';
import { createLogger } from './shared/logger.js';

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

// O bot é opcional em desenvolvimento: sem token, a API sobe sem ele.
const discord = env.DISCORD_BOT_TOKEN
  ? createDiscordSystem(env, logger, { rooms, settings })
  : null;
if (!discord) logger.warn('DISCORD_BOT_TOKEN ausente: o bot não será iniciado');

const auth = new AuthService({
  env,
  discord: createDiscordApi(env),
  users: createUserRepo(),
  sessions: createSessionRepo(),
  settings,
  ...(discord ? { guildPermissions: discord.gateway } : {}),
});

const app = createApp(env, logger, { readiness: { mongo: pingDb }, auth });
const server = createServer(app);

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
    server.close(async () => {
      await discord?.bot.stop();
      await disconnectDb();
      process.exit(0);
    });
  });
}
