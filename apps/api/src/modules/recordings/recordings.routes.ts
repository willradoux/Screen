import { Router, type Request } from 'express';
import { z } from 'zod';
import { snowflake } from '@screem/shared';
import { getValidated, validate } from '../../shared/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import { requireCapability } from '../permissions/capabilities.js';
import type { RecordingRecord, RecordingService } from './recordings.js';

const ID = z.string().regex(/^[\w-]{22}$/);

const startSchemas = {
  params: z.object({ id: ID }),
  body: z
    .object({
      mode: z.enum(['GRID', 'SPEAKER', 'AUDIO', 'PARTICIPANT', 'SCREEN']),
      userId: snowflake.optional(),
    })
    .strict(),
};
const idParams = { params: z.object({ id: ID }) };

const toDto = (r: RecordingRecord, now: Date) => ({
  id: r.id,
  roomId: r.roomId,
  title: r.title,
  mode: r.mode,
  targetUserId: r.targetUserId,
  status: r.status,
  error: r.error,
  sizeBytes: r.sizeBytes,
  durationSec: r.durationSec,
  startedBy: r.startedBy,
  startedAt: r.startedAt.toISOString(),
  endedAt: r.endedAt?.toISOString() ?? null,
  expiresAt: r.expiresAt?.toISOString() ?? null,
  /** Dias que faltam para o arquivo ser apagado (só quando pronta). */
  daysLeft:
    r.status === 'READY' && r.expiresAt
      ? Math.max(0, Math.ceil((r.expiresAt.getTime() - now.getTime()) / 86_400_000))
      : null,
  downloaded: r.downloadedAt !== null,
});

/** Gravação de reuniões: começar, parar, listar, baixar e apagar. Só ADMIN. */
export function recordingsRoutes(
  api: { recordings: RecordingService; now?: () => Date },
  auth: AuthService,
): Router {
  const router = Router();
  const admin = [requireAuth(auth), requireCapability('recording.manage')];
  const now = () => api.now?.() ?? new Date();
  const actor = (req: Request) => req.auth!.identity!.user.id;

  router.post('/rooms/:id/recordings', ...admin, validate(startSchemas), async (req, res) => {
    const { params, body } = getValidated(res, startSchemas);
    const rec = await api.recordings.start(actor(req), {
      roomId: params.id,
      mode: body.mode,
      userId: body.userId,
    });
    res.status(201).json({ data: toDto(rec, now()) });
  });

  router.post('/recordings/:id/stop', ...admin, validate(idParams), async (req, res) => {
    const rec = await api.recordings.stop(actor(req), getValidated(res, idParams).params.id);
    res.json({ data: toDto(rec, now()) });
  });

  router.get('/recordings', ...admin, async (_req, res) => {
    const list = await api.recordings.list();
    res.json({ data: list.map((r) => toDto(r, now())) });
  });

  // O download passa pela API (com o cookie de sessão), nunca por um link público.
  router.get('/recordings/:id/download', ...admin, validate(idParams), async (req, res, next) => {
    try {
      const { path, downloadName } = await api.recordings.prepareDownload(
        actor(req),
        getValidated(res, idParams).params.id,
      );
      res.download(path, downloadName, (err) => {
        if (err && !res.headersSent) next(err);
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/recordings/:id', ...admin, validate(idParams), async (req, res) => {
    await api.recordings.remove(actor(req), getValidated(res, idParams).params.id);
    res.status(204).end();
  });

  return router;
}
