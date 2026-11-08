import { Router, type Request } from 'express';
import { z } from 'zod';
import { roomStatusSchema, snowflake } from '@screem/shared';
import { getValidated, validate } from '../../shared/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import { requireCapability } from '../permissions/capabilities.js';
import { toRoomDto } from '../rooms/dto.js';
import type { ParticipationRepo } from '../rooms/participations.js';
import type { RoomRecord } from '../rooms/rooms.types.js';
import type { MeetingActor, MeetingService } from './meetings.service.js';

const MAX_REMINDERS = 5;
const MAX_REMINDER_MINUTES = 43_200; // 30 dias

const reminders = z
  .array(z.number().int().min(1).max(MAX_REMINDER_MINUTES))
  .max(MAX_REMINDERS)
  .transform((list) => [...new Set(list)].sort((a, b) => b - a));
const roleList = z.array(snowflake).max(25);
const title = z.string().trim().min(3).max(100);
const description = z.string().trim().max(1000).nullable();
const maxParticipants = z.number().int().min(2).max(300);

const id = z.object({ id: z.string() });

const listSchemas = {
  query: z.object({
    status: roomStatusSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
};

const createSchemas = {
  body: z
    .object({
      title,
      description: description.optional(),
      /** Ausente ou `null` = abre agora. */
      startsAt: z.coerce.date().nullable().optional(),
      maxParticipants: maxParticipants.optional(),
      allowedRoleIds: roleList.optional(),
      announce: z.boolean().default(true),
      reminders: reminders.optional(),
    })
    .strict(),
};

const updateSchemas = {
  params: id,
  body: z
    .object({
      title: title.optional(),
      description: description.optional(),
      startsAt: z.coerce.date().optional(),
      maxParticipants: maxParticipants.optional(),
      allowedRoleIds: roleList.optional(),
      reminders: reminders.optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Informe pelo menos um campo.'),
};

export interface MeetingsApi {
  meetings: MeetingService;
  participations: ParticipationRepo;
  webUrl: string;
}

/** Reunião como a API devolve: a `Room` mais quem pode entrar e os lembretes. */
function toMeetingDto(room: RoomRecord, count: number, webUrl: string) {
  return {
    ...toRoomDto(room, count, webUrl),
    allowedRoleIds: room.allowedRoleIds,
    reminders: room.reminders.map((r) => ({
      minutesBefore: r.minutesBefore,
      sent: r.sentAt !== null,
    })),
  };
}

export function meetingsRoutes(api: MeetingsApi, auth: AuthService): Router {
  const router = Router();
  const needAuth = requireAuth(auth);
  const admin = [needAuth, requireCapability('meeting.manage')];

  const actorOf = (req: Request): MeetingActor => {
    const { user, role } = req.auth!.identity!;
    return { id: user.id, via: 'api', role };
  };
  const dto = async (room: RoomRecord) =>
    toMeetingDto(room, await api.participations.countOpen(room.id), api.webUrl);

  // Qualquer membro vê as reuniões (título e horário são públicos no servidor).
  router.get('/meetings', needAuth, validate(listSchemas), async (_req, res) => {
    const { status, from, to, limit } = getValidated(res, listSchemas).query;
    const meetings = await api.meetings.list({
      statuses: status ? [status] : ['OPEN', 'SCHEDULED'],
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      limit,
    });
    res.json({ data: await Promise.all(meetings.map(dto)) });
  });

  router.get('/meetings/:id', needAuth, async (req, res) => {
    res.json({ data: await dto(await api.meetings.get(String(req.params.id))) });
  });

  router.post('/meetings', ...admin, validate(createSchemas), async (req, res) => {
    const body = getValidated(res, createSchemas).body;
    const { room } = await api.meetings.create(actorOf(req), {
      title: body.title,
      description: body.description ?? null,
      startsAt: body.startsAt ?? null,
      announce: body.announce,
      ...(body.reminders ? { reminders: body.reminders } : {}),
      ...(body.maxParticipants ? { maxParticipants: body.maxParticipants } : {}),
      ...(body.allowedRoleIds ? { allowedRoleIds: body.allowedRoleIds } : {}),
    });
    res.status(201).json({ data: await dto(room) });
  });

  router.patch('/meetings/:id', ...admin, validate(updateSchemas), async (req, res) => {
    const { body, params } = getValidated(res, updateSchemas);
    // Só repassa o que veio: `undefined` não pode virar "apagar".
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    res.json({ data: await dto(await api.meetings.update(actorOf(req), params.id, patch)) });
  });

  router.post('/meetings/:id/open', ...admin, async (req, res) => {
    res.json({ data: await dto(await api.meetings.open(actorOf(req), String(req.params.id))) });
  });

  router.post('/meetings/:id/cancel', ...admin, async (req, res) => {
    await api.meetings.cancel(actorOf(req), String(req.params.id));
    res.status(204).end();
  });

  router.get('/meetings/:id/report', ...admin, async (req, res) => {
    const { report } = await api.meetings.report(String(req.params.id));
    res.json({ data: report });
  });

  return router;
}
