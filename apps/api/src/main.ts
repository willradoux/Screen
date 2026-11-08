import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDb, disconnectDb, pingDb } from './db/connection.js';
import {
  createSessionRepo,
  createSettingsRepo,
  createUserRepo,
} from './modules/auth/auth.repositories.js';
import { AuthService } from './modules/auth/auth.service.js';
import { createDiscordApi } from './modules/discord/discord-api.js';
import { createLogger } from './shared/logger.js';

const env = loadEnv();
const logger = createLogger(env);

try {
  await connectDb(env.MONGODB_URI, logger);
} catch (err) {
  logger.fatal({ err }, 'Não foi possível conectar ao MongoDB');
  process.exit(1);
}

const auth = new AuthService({
  env,
  discord: createDiscordApi(env),
  users: createUserRepo(),
  sessions: createSessionRepo(),
  settings: createSettingsRepo(),
});

const app = createApp(env, logger, { readiness: { mongo: pingDb }, auth });
const server = createServer(app);

server.listen(env.PORT, () => logger.info(`API ouvindo na porta ${env.PORT}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info(`${sig} recebido, encerrando`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  });
}
