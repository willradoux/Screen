import { Router } from 'express';
import { z } from 'zod';
import { snowflake } from '@screem/shared';
import { getValidated, validate } from '../../shared/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { AuthService } from '../auth/auth.service.js';
import { isValidAuditCursor, AUDIT_ACTIONS, type AuditService } from '../audit/audit.service.js';
import { requireCapability } from '../permissions/capabilities.js';
import type { GuildSettings } from './settings.types.js';
import type { SettingsService } from './settings.service.js';
import type { CallsService } from '../rooms/calls.service.js';
import type { StatsService } from '../stats/stats.js';

const roleList = z.array(snowflake).max(25);

const patchSchemas = {
  body: z
    .object({
      liveCategoryId: snowflake.nullable().optional(),
      liveTextChannelId: snowflake.nullable().optional(),
      announceChannelId: snowflake.nullable().optional(),
      adminRoleIds: roleList.optional(),
      modRoleIds: roleList.optional(),
      meetingAllowedRoleIds: roleList.optional(),
      maxParticipantsLive: z.number().int().min(2).max(500).optional(),
      graceSeconds: z.number().int().min(5).max(300).optional(),
      liveChannelIds: z.array(snowflake).max(50).optional(),
      logChannelId: snowflake.nullable().optional(),
      mentionRoleId: snowflake.nullable().optional(),
      emptyLiveEndSeconds: z.number().int().min(10).max(3600).nullable().optional(),
      idleSessionMinutes: z.number().int().min(1).max(240).optional(),
      activationGraceMinutes: z.number().int().min(1).max(60).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Informe pelo menos um campo.'),
};

const auditSchemas = {
  query: z.object({
    actorId: snowflake.optional(),
    targetId: snowflake.optional(),
    roomId: z
      .string()
      .regex(/^[\w-]{22}$/)
      .optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(100).refine(isValidAuditCursor, 'cursor inválido').optional(),
  }),
};

const panelUserSchemas = {
  body: z
    .object({
      userId: snowflake,
      role: z.enum(['ADMIN', 'MOD']),
      note: z.string().trim().max(100).nullable().optional(),
    })
    .strict(),
};
const panelUserParams = { params: z.object({ userId: snowflake }) };

const toDto = (s: GuildSettings) => ({
  guildId: s.guildId,
  liveCategoryId: s.liveCategoryId,
  liveTextChannelId: s.liveTextChannelId,
  announceChannelId: s.announceChannelId,
  adminRoleIds: s.adminRoleIds,
  modRoleIds: s.modRoleIds,
  meetingAllowedRoleIds: s.meetingAllowedRoleIds,
  maxParticipantsLive: s.maxParticipantsLive,
  graceSeconds: s.graceSeconds,
  liveChannelIds: s.liveChannelIds,
  logChannelId: s.logChannelId,
  mentionRoleId: s.mentionRoleId,
  emptyLiveEndSeconds: s.emptyLiveEndSeconds,
  idleSessionMinutes: s.idleSessionMinutes,
  activationGraceMinutes: s.activationGraceMinutes,
});

export interface AdminApi {
  settings: SettingsService;
  audit: AuditService;
  /** Estatísticas do servidor (ADMIN). */
  stats?: StatsService;
  /** Status das calls (qualquer membro). */
  calls?: CallsService;
}

/** Configurações da guilda e auditoria. Só ADMIN. */
export function adminRoutes(api: AdminApi, auth: AuthService): Router {
  const router = Router();
  const needAuth = requireAuth(auth);

  router.get('/settings', needAuth, requireCapability('settings.manage'), async (_req, res) => {
    res.json({ data: toDto(await api.settings.get()) });
  });

  router.patch(
    '/settings',
    needAuth,
    requireCapability('settings.manage'),
    validate(patchSchemas),
    async (req, res) => {
      const { body } = getValidated(res, patchSchemas);
      // Remove `undefined` para não apagar o que não foi enviado.
      const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      const updated = await api.settings.update(req.auth!.identity!.user.id, patch);
      res.json({ data: toDto(updated) });
    },
  );

  // Quem está em cada call com live agora (qualquer membro logado).
  if (api.calls) {
    const calls = api.calls;
    router.get('/calls', needAuth, async (_req, res) => {
      res.json({ data: await calls.list() });
    });
  }

  // Estatísticas do servidor (só ADMIN).
  if (api.stats) {
    const stats = api.stats;
    const statsSchemas = {
      query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
    };
    router.get(
      '/stats',
      needAuth,
      requireCapability('audit.read'),
      validate(statsSchemas),
      async (_req, res) => {
        res.json({ data: await stats.get(getValidated(res, statsSchemas).query.days) });
      },
    );
  }

  // Qualquer membro logado: o site mostra "fale com um admin" quando algo não está configurado.
  router.get('/status', needAuth, async (_req, res) => {
    res.json({ data: await api.settings.status() });
  });

  // Canais e cargos do servidor, para o painel montar as listas de escolha.
  router.get('/guild', needAuth, requireCapability('panel.users'), async (_req, res) => {
    res.json({ data: await api.settings.catalog() });
  });

  router.get('/panel-users', needAuth, requireCapability('panel.users'), async (_req, res) => {
    const users = await api.settings.listPanelUsers();
    res.json({
      data: users.map((u) => ({
        userId: u.userId,
        role: u.role,
        note: u.note,
        addedBy: u.addedBy,
        addedAt: u.addedAt.toISOString(),
        displayName: u.profile?.displayName ?? null,
        username: u.profile?.username ?? null,
        avatarUrl: u.profile?.avatarUrl ?? null,
        inServer: u.profile !== null,
      })),
    });
  });

  router.post(
    '/panel-users',
    needAuth,
    requireCapability('panel.users'),
    validate(panelUserSchemas),
    async (req, res) => {
      const { body } = getValidated(res, panelUserSchemas);
      await api.settings.addPanelUser(req.auth!.identity!.user.id, body);
      res.status(201).json({ data: { userId: body.userId, role: body.role } });
    },
  );

  router.delete(
    '/panel-users/:userId',
    needAuth,
    requireCapability('panel.users'),
    validate(panelUserParams),
    async (req, res) => {
      const { params } = getValidated(res, panelUserParams);
      await api.settings.removePanelUser(req.auth!.identity!.user.id, params.userId);
      res.status(204).end();
    },
  );

  router.get(
    '/audit',
    needAuth,
    requireCapability('audit.read'),
    validate(auditSchemas),
    async (_req, res) => {
      const { cursor, limit, ...filter } = getValidated(res, auditSchemas).query;
      const clean = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined));
      const { items, next } = await api.audit.list(clean, { limit, ...(cursor ? { cursor } : {}) });
      res.json({
        data: items.map((a) => ({ ...a, at: a.at.toISOString() })),
        page: { next, limit },
      });
    },
  );

  return router;
}
