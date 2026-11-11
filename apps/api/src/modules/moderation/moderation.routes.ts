import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { snowflake } from '@screem/shared';
import { getValidated, validate } from '../../shared/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import { ALL_SOURCES } from '../livekit/livekit.gateway.js';
import type { RoomAccess } from '../rooms/access.js';
import { toParticipantDto, toRoomDto } from '../rooms/dto.js';
import type { ParticipationRepo } from '../rooms/participations.js';
import { AppError, forbidden } from '../../shared/errors.js';
import { ROLE_RANK } from '@screem/shared';
import type { HandQueue } from './hand-queue.js';
import { MAX_BAN_MINUTES, type Actor, type ModerationService } from './moderation.service.js';

const ROOM_ID = /^[\w-]{22}$/;
const sourceSchema = z.enum(['microphone', 'camera', 'screen_share', 'screen_share_audio']);
const reason = z.string().trim().max(200).nullable().optional();

/** Corpo opcional: sem corpo vale `{}`. */
const optionalBody = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .strict()
    .optional()
    .transform((v) => v ?? ({} as z.infer<z.ZodObject<T>>));

const target = z.object({ id: z.string(), userId: snowflake });

const muteSchemas = {
  params: target,
  body: optionalBody({
    sources: z.array(sourceSchema).min(1).max(ALL_SOURCES.length).optional(),
    reason,
  }),
};
const reasonSchemas = { params: target, body: optionalBody({ reason }) };
const banSchemas = {
  params: target,
  body: optionalBody({
    durationMinutes: z.number().int().min(0).max(MAX_BAN_MINUTES).optional(),
    reason,
  }),
};
const plainTarget = { params: target };
const patchSchemas = {
  params: z.object({ id: z.string() }),
  body: z
    .object({
      title: z.string().trim().min(3).max(100).optional(),
      description: z.string().trim().max(1000).nullable().optional(),
      maxParticipants: z.number().int().min(2).max(500).optional(),
      lectureMode: z.boolean().optional(),
      screenLock: z.boolean().optional(),
      spotlightId: z.string().min(1).max(64).nullable().optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Informe pelo menos um campo.'),
};

export interface ModerationApi {
  moderation: ModerationService;
  access: RoomAccess;
  participations: ParticipationRepo;
  /** Fila de pedir a palavra (reuniões). */
  hands?: HandQueue;
  webUrl: string;
}

export function moderationRoutes(api: ModerationApi, auth: AuthService): Router {
  const router = Router();
  const needAuth = requireAuth(auth);

  // Moderação é mais permissiva em volume que o login, mas ainda limitada por usuário.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.session.userId ?? 'anon',
    validate: false,
  });

  const actorOf = (req: Request): Actor => {
    const { user, role } = req.auth!.identity!;
    return { id: user.id, role };
  };
  const roomId = (req: Request) => {
    const id = String(req.params.id ?? '');
    if (!ROOM_ID.test(id)) throw new AppError('ROOM_NOT_FOUND', 404, 'Sala não encontrada.');
    return id;
  };
  const userId = (res: Parameters<typeof getValidated>[0]) =>
    getValidated(res, plainTarget).params.userId;

  const base = '/rooms/:id/participants/:userId';

  router.post(`${base}/mute`, needAuth, limiter, validate(muteSchemas), async (req, res) => {
    const { body, params } = getValidated(res, muteSchemas);
    await api.moderation.mute(actorOf(req), roomId(req), params.userId, body);
    res.status(204).end();
  });

  // Pedir a palavra: qualquer pessoa que está na reunião pode levantar e abaixar a mão.
  if (api.hands) {
    const hands = api.hands;
    const meetingId = async (req: Request) => {
      const id = roomId(req);
      const { room } = await api.moderation.participants(id);
      if (room.type !== 'MEETING') {
        throw new AppError(
          'MODERATION_ONLY_IN_MEETINGS',
          409,
          'Pedir a palavra só existe em reuniões.',
        );
      }
      if (room.status !== 'OPEN')
        throw new AppError('ROOM_NOT_OPEN', 409, 'Esta sala não está aberta.');
      return id;
    };

    router.post('/rooms/:id/hand', needAuth, limiter, async (req, res) => {
      const id = await meetingId(req);
      const ok = await hands.raise(id, req.auth!.identity!.user.id);
      if (!ok) {
        throw new AppError(
          'PARTICIPANT_NOT_IN_ROOM',
          409,
          'Entre na sala antes de pedir a palavra.',
        );
      }
      res.status(204).end();
    });

    router.delete('/rooms/:id/hand', needAuth, limiter, async (req, res) => {
      hands.lower(roomId(req), req.auth!.identity!.user.id);
      res.status(204).end();
    });

    // Quem modera vê a fila inteira; os demais, só se a própria mão está levantada.
    router.get('/rooms/:id/hands', needAuth, async (req, res) => {
      const id = roomId(req);
      const identity = req.auth!.identity!;
      const list = await hands.list(id);
      const staff = ROLE_RANK[identity.role] >= ROLE_RANK.MOD;
      res.json({ data: staff ? list : list.filter((h) => h.userId === identity.user.id) });
    });
  }

  // Silenciar todos / desligar todas as câmeras (só reuniões).
  const bulkParams = { params: z.object({ id: z.string().min(1) }) };
  for (const [path, kind] of [
    ['mute-all', 'MUTE_ALL'],
    ['cameras-off', 'CAMERAS_OFF'],
  ] as const) {
    router.post(`/rooms/:id/${path}`, needAuth, limiter, validate(bulkParams), async (req, res) => {
      const result = await api.moderation.muteEveryone(actorOf(req), roomId(req), kind);
      res.json({ data: result });
    });
  }

  router.post(`${base}/unmute`, needAuth, limiter, validate(reasonSchemas), async (req, res) => {
    const { body, params } = getValidated(res, reasonSchemas);
    await api.moderation.unmute(actorOf(req), roomId(req), params.userId, body);
    res.status(204).end();
  });

  router.post(`${base}/kick`, needAuth, limiter, validate(reasonSchemas), async (req, res) => {
    const { body, params } = getValidated(res, reasonSchemas);
    await api.moderation.kick(actorOf(req), roomId(req), params.userId, body);
    res.status(204).end();
  });

  router.post(`${base}/ban`, needAuth, limiter, validate(banSchemas), async (req, res) => {
    const { body, params } = getValidated(res, banSchemas);
    await api.moderation.ban(actorOf(req), roomId(req), params.userId, body);
    res.status(204).end();
  });

  router.delete(
    '/rooms/:id/bans/:userId',
    needAuth,
    limiter,
    validate(plainTarget),
    async (req, res) => {
      await api.moderation.unban(actorOf(req), roomId(req), userId(res));
      res.status(204).end();
    },
  );

  router.post(`${base}/promote`, needAuth, limiter, validate(plainTarget), async (req, res) => {
    await api.moderation.promote(actorOf(req), roomId(req), userId(res));
    res.status(204).end();
  });

  router.post(`${base}/demote`, needAuth, limiter, validate(plainTarget), async (req, res) => {
    await api.moderation.demote(actorOf(req), roomId(req), userId(res));
    res.status(204).end();
  });

  router.patch('/rooms/:id', needAuth, limiter, validate(patchSchemas), async (req, res) => {
    const { body } = getValidated(res, patchSchemas);
    // Só repassa o que veio: `undefined` não pode virar "apagar".
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    const room = await api.moderation.updateRoom(actorOf(req), roomId(req), patch);
    const count = await api.participations.countOpen(room.id);
    res.json({ data: toRoomDto(room, count, api.webUrl) });
  });

  // Quem pode ver a lista: moderação, ou quem tem acesso à sala (ou já está nela).
  router.get('/rooms/:id/participants', needAuth, async (req, res) => {
    const identity = req.auth!.identity!;
    const { room, people } = await api.moderation.participants(roomId(req));
    const staff = ROLE_RANK[identity.role] >= ROLE_RANK.MOD;
    const inside = people.some((p) => p.userId === identity.user.id);
    if (!staff && !inside && !(await api.access.evaluate(room, identity)).canJoin)
      throw forbidden();
    res.json({ data: people.map((p) => toParticipantDto(p, room)) });
  });

  return router;
}
