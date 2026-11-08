import type { RequestHandler } from 'express';
import { forbidden } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção CSRF complementar ao SameSite=Lax: métodos que alteram estado só são
 * aceitos com `Origin` presente e dentro da lista permitida.
 * `exemptPaths` é para chamadas servidor-a-servidor (ex.: webhook do LiveKit).
 */
export function originCheck(allowed: string[], exemptPaths: string[] = []): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || exemptPaths.includes(req.path)) return next();
    const origin = req.headers.origin;
    if (!origin || !allowed.includes(origin)) {
      throw forbidden('Origem não permitida.');
    }
    next();
  };
}
