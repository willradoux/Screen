import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { ApiErrorBody } from '@screem/shared';
import type { Env } from './config/env.js';
import { AppError } from './shared/errors.js';
import type { Logger } from './shared/logger.js';

export function createApp(env: Env, logger: Logger) {
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
  api.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', uptime: Math.round(process.uptime()) } });
  });
  app.use('/api/v1', api);

  app.use((_req, _res, next) => next(new AppError('NOT_FOUND', 404, 'Rota não encontrada.')));

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    const known = err instanceof AppError;
    if (!known) req.log.error({ err }, 'erro inesperado');
    const body: ApiErrorBody = {
      error: {
        code: known ? err.code : 'INTERNAL_ERROR',
        message: known ? err.message : 'Erro interno. Tente novamente.',
        ...(known && err.details !== undefined ? { details: err.details } : {}),
        requestId: String(req.id),
      },
    };
    res.status(known ? err.status : 500).json(body);
  };
  app.use(onError);

  return app;
}
