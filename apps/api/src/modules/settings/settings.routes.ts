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
      maxParticipantsLive: z.number().int().min(2).max(100).optional(),
      graceSeconds: z.number().int().min(5).max(300).optional(),
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
});

export interface AdminApi {
  settings: SettingsService;
  audit: AuditService;
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
