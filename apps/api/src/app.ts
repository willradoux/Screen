import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { sessionLoader } from './modules/auth/auth.middleware.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { docsRoutes } from './modules/docs/docs.routes.js';
import { healthRoutes, type ReadinessChecks } from './modules/health/health.routes.js';
import { errorHandler } from './shared/error-handler.js';
import { AppError } from './shared/errors.js';
import { originCheck } from './shared/origin-check.js';
import type { Logger } from './shared/logger.js';

export interface AppDeps {
  /** Verificações usadas por GET /ready (ex.: { mongo: pingDb }). */
  readiness?: ReadinessChecks;
  /** Serviço de autenticação. Sem ele, as rotas /auth/* não são montadas. */
  auth?: AuthService;
}

export function createApp(env: Env, logger: Logger, deps: AppDeps = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID().slice(0, 8);
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }),
  );

  const api = express.Router();
  api.use(originCheck(env.corsOrigins));
  if (deps.auth) api.use(sessionLoader(deps.auth, env));
  api.use(healthRoutes(deps.readiness ?? {}));
  api.use(docsRoutes(env.PUBLIC_API_URL));
  if (deps.auth) api.use(authRoutes(deps.auth, env));
  app.use('/api/v1', api);

  app.use((_req, _res, next) => next(new AppError('NOT_FOUND', 404, 'Rota não encontrada.')));
  app.use(errorHandler);

  return app;
}
