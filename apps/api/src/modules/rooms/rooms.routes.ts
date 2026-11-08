import express, { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ROLE_RANK, roomStatusSchema, roomTypeSchema } from '@screem/shared';
import { AppError, forbidden } from '../../shared/errors.js';
import { getValidated, validate } from '../../shared/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import type { Identity } from '../auth/auth.types.js';
import { InvalidWebhookError } from '../livekit/livekit.gateway.js';
import type { LiveKitWebhookHandler } from '../livekit/livekit.webhook.js';
import type { RoomAccess } from './access.js';
import { isValidCursor, toRoomDto } from './dto.js';
import type { ParticipationRepo } from './participations.js';
import type { PresenceService } from './presence.js';
import type { RoomService } from './rooms.service.js';
import type { RoomRecord, RoomRepo } from './rooms.types.js';

/** Tudo que as rotas de salas precisam. Montado em `main.ts` (e nos testes). */
export interface RoomsApi {
  rooms: RoomRepo;
  participations: ParticipationRepo;
  access: RoomAccess;
  presence: PresenceService;
  roomService: RoomService;
  webhook: LiveKitWebhookHandler;
  guildId: string;
  webUrl: string;
}

const ID = /^[\w-]{22}$/;

const listSchemas = {
  query: z.object({
    status: roomStatusSchema.optional(),
    type: roomTypeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(100).refine(isValidCursor, 'cursor inválido').optional(),
  }),
};

export const WEBHOOK_PATH = '/livekit/webhook';

export function roomsRoutes(api: RoomsApi, auth: AuthService): Router {
  const router = Router();
  const needAuth = requireAuth(auth);

  const identityOf = (req: Request): Identity => req.auth!.identity!;

  /** Sala pelo id da URL. Id malformado ou inexistente dão o mesmo 404. */
  async function loadRoom(req: Request): Promise<RoomRecord> {
    const id = String(req.params.id ?? '');
    const room = ID.test(id) ? await api.rooms.findById(id) : null;
    if (!room || room.guildId !== api.guildId) {
      throw new AppError('ROOM_NOT_FOUND', 404, 'Sala não encontrada.');
    }
    return room;
  }

  const dto = async (room: RoomRecord) =>
    toRoomDto(room, await api.participations.countOpen(room.id), api.webUrl);

  // Entrar na sala é a operação mais sensível: limite por usuário.
  const joinLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.session.userId ?? 'anon',
    validate: false,
  });

  // --- Webhook do LiveKit (autenticado por assinatura, não por sessão) ---
  router.post(WEBHOOK_PATH, express.text({ type: () => true, limit: '1mb' }), async (req, res) => {
    try {
      const body = typeof req.body === 'string' ? req.body : '';
      await api.webhook.handle(body, req.headers.authorization);
    } catch (err) {
      if (err instanceof InvalidWebhookError) {
        throw new AppError('UNAUTHENTICATED', 401, 'Assinatura do webhook inválida.');
      }
      throw err;
    }
    res.json({ data: { received: true } });
  });

  // --- Salas ---
  router.get('/rooms', needAuth, validate(listSchemas), async (_req, res) => {
    const { status, type, limit, cursor } = getValidated(res, listSchemas).query;
    const { items, next } = await api.rooms.list(
      api.guildId,
      {
        statuses: status ? [status] : ['OPEN', 'SCHEDULED'],
        ...(type ? { type } : {}),
      },
      { limit, ...(cursor ? { cursor } : {}) },
    );
    res.json({ data: await Promise.all(items.map(dto)), page: { next, limit } });
  });

  router.get('/rooms/:id', needAuth, async (req, res) => {
    res.json({ data: await dto(await loadRoom(req)) });
  });

  router.get('/rooms/:id/access', needAuth, async (req, res) => {
    const room = await loadRoom(req);
    const result = await api.access.evaluate(room, identityOf(req));
    res.json({
      data: result.canJoin
        ? { canJoin: true, reason: null, hint: null }
        : { canJoin: false, reason: result.reason, hint: result.hint, ...result.details },
    });
  });

  router.post('/rooms/:id/join', needAuth, joinLimiter, async (req, res) => {
    const room = await loadRoom(req);
    res.json({ data: await api.access.join(room, identityOf(req)) });
  });

  router.post('/rooms/:id/leave', needAuth, async (req, res) => {
    const room = await loadRoom(req);
    await api.presence.removeFromRoom(room.id, identityOf(req).user.id, 'LEFT');
    res.status(204).end();
  });

  router.post('/rooms/:id/end', needAuth, async (req, res) => {
    const identity = identityOf(req);
    if (ROLE_RANK[identity.role] < ROLE_RANK.MOD) throw forbidden();

    const room = await loadRoom(req);
    const ended = await api.roomService.endRoom(
      room.id,
      identity.role === 'ADMIN' ? 'ENDED_BY_ADMIN' : 'ENDED_BY_MOD',
    );
    if (!ended) {
      // Não estava aberta: diz o porquê.
      throw room.status === 'ENDED'
        ? new AppError('ROOM_ALREADY_ENDED', 409, 'A sala já foi encerrada.')
        : new AppError('ROOM_NOT_OPEN', 409, 'Esta sala não está aberta.');
    }
    res.status(204).end();
  });

  return router;
}
