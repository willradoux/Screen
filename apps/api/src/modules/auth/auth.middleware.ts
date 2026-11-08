import { parse } from 'cookie';
import type { CookieOptions, RequestHandler } from 'express';
import type { Env } from '../../config/env.js';
import { unauthenticated } from '../../shared/errors.js';
import type { AuthService } from './auth.service.js';

export const SESSION_COOKIE = 'screem_sid';
export const STATE_COOKIE = 'screem_oauth';

export function sessionCookieOptions(env: Env, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
    ...(env.SESSION_COOKIE_DOMAIN ? { domain: env.SESSION_COOKIE_DOMAIN } : {}),
  };
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  return header ? parse(header)[name] : undefined;
}

/** Carrega a sessão do cookie (se houver) em `req.auth`. Não exige login. */
export function sessionLoader(service: AuthService, env: Env): RequestHandler {
  return async (req, res, next) => {
    const raw = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!raw) return next();

    const session = await service.loadSession(raw);
    if (!session) {
      res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(env, 0), maxAge: undefined });
      return next();
    }

    req.auth = { session };
    const renewed = await service.touch(session);
    if (renewed) {
      res.cookie(SESSION_COOKIE, raw, sessionCookieOptions(env, renewed.getTime() - Date.now()));
    }
    next();
  };
}

/** Exige login e carrega identidade (usuário + papel) em `req.auth.identity`. */
export function requireAuth(service: AuthService): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) throw unauthenticated();
    req.auth.identity = await service.getIdentity(req.auth.session);
    next();
  };
}
