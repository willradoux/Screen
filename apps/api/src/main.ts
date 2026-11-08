import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './shared/logger.js';

const env = loadEnv();
const logger = createLogger(env);
const app = createApp(env, logger);
const server = createServer(app);

server.listen(env.PORT, () => logger.info(`API ouvindo na porta ${env.PORT}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info(`${sig} recebido, encerrando`);
    server.close(() => process.exit(0));
  });
}
