import { Router } from 'express';

/** Funções de verificação por dependência. Rejeitar = indisponível. */
export type ReadinessChecks = Record<string, () => Promise<void>>;

const CHECK_TIMEOUT_MS = 3000;

function withTimeout(fn: () => Promise<void>): Promise<void> {
  return Promise.race([
    fn(),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS).unref(),
    ),
  ]);
}

export function healthRoutes(checks: ReadinessChecks): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', uptime: Math.round(process.uptime()) } });
  });

  router.get('/ready', async (req, res) => {
    const entries = await Promise.all(
      Object.entries(checks).map(async ([name, check]) => {
        try {
          await withTimeout(check);
          return [name, 'ok'] as const;
        } catch (err) {
          req.log.warn({ err, dependency: name }, 'dependência indisponível');
          return [name, 'fail'] as const;
        }
      }),
    );
    const results = Object.fromEntries(entries);
    const ok = entries.every(([, s]) => s === 'ok');
    res
      .status(ok ? 200 : 503)
      .json({ data: { status: ok ? 'ok' : 'unavailable', checks: results } });
  });

  return router;
}
