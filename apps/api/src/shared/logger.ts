import { pino } from 'pino';
import type { Env } from '../config/env.js';

/** Campos que nunca podem ir para o log: sessão, credenciais e cookies novos. */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: REDACT_PATHS,
  });
}

export type Logger = ReturnType<typeof createLogger>;
