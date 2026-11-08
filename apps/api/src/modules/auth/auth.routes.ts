import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { getValidated, validate } from '../../shared/validate.js';
import {
  readCookie,
  requireAuth,
  SESSION_COOKIE,
  sessionCookieOptions,
  STATE_COOKIE,
} from './auth.middleware.js';
import type { AuthService } from './auth.service.js';

const startSchemas = { query: z.object({ redirect: z.string().max(500).optional() }) };

const callbackQuery = z.object({
  code: z.string().min(1).max(512).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(100).optional(),
});

const STATE_COOKIE_PATH = '/api/v1/auth';
const STATE_TTL_MS = 10 * 60_000;

export function authRoutes(service: AuthService, env: Env): Router {
  const router = Router();
  const stateCookieOptions = (maxAge: number) => ({
    ...sessionCookieOptions(env, maxAge),
    path: STATE_COOKIE_PATH,
  });
  const loginError = (code: string) => `${env.WEB_URL}/login?error=${encodeURIComponent(code)}`;

  router.use(
    '/auth',
    rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }),
  );

  // 1) Inicia o login: guarda state+redirect em cookie assinado e vai para o Discord.
  router.get('/auth/discord', validate(startSchemas), (_req, res) => {
    const { redirect } = getValidated(res, startSchemas).query;
    const { url, stateCookie } = service.startLogin(redirect);
    res.cookie(STATE_COOKIE, stateCookie, stateCookieOptions(STATE_TTL_MS));
    res.redirect(302, url);
  });

  // 2) Retorno do Discord. Erros viram redirect para {WEB_URL}/login?error=CODE.
  router.get('/auth/discord/callback', async (req, res) => {
    const stateCookie = readCookie(req.headers.cookie, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(0), maxAge: undefined });

    const query = callbackQuery.safeParse(req.query);
    if (!query.success) return res.redirect(302, loginError('INVALID_STATE'));
    if (query.data.error) return res.redirect(302, loginError('ACCESS_DENIED'));
    if (!query.data.code || !query.data.state)
      return res.redirect(302, loginError('INVALID_STATE'));

    try {
      const { sessionId, redirect } = await service.completeLogin({
        code: query.data.code,
        state: query.data.state,
        stateCookie,
        meta: { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null },
      });
      res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions(env, service.sessionTtlMs));
      return res.redirect(302, new URL(redirect, env.WEB_URL).toString());
    } catch (err) {
      if (err instanceof AppError) {
        req.log.warn({ code: err.code }, 'falha no login');
        return res.redirect(302, loginError(err.code));
      }
      throw err;
    }
  });

  // 3) Quem sou eu.
  router.get('/auth/me', requireAuth(service), (req, res) => {
    // requireAuth garante a identidade.
    const { user, role, displayName, avatarUrl } = req.auth!.identity!;
    res.json({
      data: { id: user.id, username: user.username, displayName, avatarUrl, role },
    });
  });

  // 4) Logout.
  router.post('/auth/logout', requireAuth(service), async (req, res) => {
    await service.logout(req.auth!.session);
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(env, 0), maxAge: undefined });
    res.status(204).end();
  });

  return router;
}
