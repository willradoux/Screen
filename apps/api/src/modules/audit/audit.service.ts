import { AuditLogModel } from '../../db/models.js';
import type { Logger } from '../../shared/logger.js';

/** Ações auditadas. Catálogo em docs/backend/modelo-de-dados.md. */
export const AUDIT_ACTIONS = [
  'PARTICIPANT_MUTED',
  'PARTICIPANT_UNMUTED',
  'PARTICIPANT_KICKED',
  'PARTICIPANT_BANNED',
  'BAN_REMOVED',
  'SPEAKER_PROMOTED',
  'SPEAKER_DEMOTED',
  'ROOM_ENDED',
  'ROOM_UPDATED',
  'MEETING_CREATED',
  'MEETING_UPDATED',
  'MEETING_CANCELED',
  'MEETING_OPENED',
  'SETTINGS_UPDATED',
  'SESSION_REVOKED',
  'USER_BLOCKED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetId?: string | null;
  roomId?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  at: Date;
  actorId: string;
  targetId: string | null;
  roomId: string | null;
  action: AuditAction;
  reason: string | null;
  meta: Record<string, unknown>;
}

export interface AuditFilter {
  actorId?: string;
  targetId?: string;
  roomId?: string;
  action?: AuditAction;
  from?: Date;
  to?: Date;
}

/** Repositório somente de inserção: não existe atualização nem remoção. */
export interface AuditRepo {
  insert(entry: AuditEntry & { at: Date }): Promise<void>;
  list(
    filter: AuditFilter,
    page: { limit: number; cursor?: string },
  ): Promise<{ items: AuditRecord[]; next: string | null }>;
}

/** O que as regras de negócio usam para registrar. */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

export interface AuditServiceDeps {
  repo: AuditRepo;
  logger: Logger;
  now?: () => Date;
}

export class AuditService implements AuditLog {
  private readonly now: () => Date;

  constructor(private readonly deps: AuditServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Registra uma ação já executada. Uma falha ao gravar a auditoria não desfaz a
   * ação (já aconteceu), mas é registrada em log como erro para ser investigada.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.deps.repo.insert({ ...entry, at: this.now() });
    } catch (err) {
      this.deps.logger.error({ err, audit: entry }, 'FALHA ao gravar auditoria');
    }
  }

  list(filter: AuditFilter, page: { limit: number; cursor?: string }) {
    return this.deps.repo.list(filter, page);
  }
}

const OBJECT_ID = /^[0-9a-f]{24}$/;

/** Cursor opaco: base64url("<atMs>|<objectId>"). */
export function isValidAuditCursor(cursor: string): boolean {
  try {
    const [ms, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    return /^\d{10,16}$/.test(ms ?? '') && OBJECT_ID.test(id ?? '');
  } catch {
    return false;
  }
}

type Doc = {
  _id: { toString(): string };
  at: Date;
  actorId: string;
  targetId?: string | null;
  roomId?: string | null;
  action: AuditAction;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
};

const toRecord = (d: Doc): AuditRecord => ({
  id: d._id.toString(),
  at: d.at,
  actorId: d.actorId,
  targetId: d.targetId ?? null,
  roomId: d.roomId ?? null,
  action: d.action,
  reason: d.reason ?? null,
  meta: d.meta ?? {},
});

export function createAuditRepo(): AuditRepo {
  return {
    async insert(entry) {
      await AuditLogModel.create({
        at: entry.at,
        actorId: entry.actorId,
        targetId: entry.targetId ?? null,
        roomId: entry.roomId ?? null,
        action: entry.action,
        reason: entry.reason ?? null,
        meta: entry.meta ?? {},
      });
    },

    async list(filter, page) {
      const query: Record<string, unknown> = {};
      if (filter.actorId) query.actorId = filter.actorId;
      if (filter.targetId) query.targetId = filter.targetId;
      if (filter.roomId) query.roomId = filter.roomId;
      if (filter.action) query.action = filter.action;
      if (filter.from || filter.to) {
        query.at = {
          ...(filter.from ? { $gte: filter.from } : {}),
          ...(filter.to ? { $lte: filter.to } : {}),
        };
      }

      if (page.cursor) {
        const [ms, id] = Buffer.from(page.cursor, 'base64url').toString('utf8').split('|');
        const at = new Date(Number(ms));
        const cursorFilter = [{ at: { $lt: at } }, { at, _id: { $lt: id } }];
        // Combina com o filtro de data, se houver.
        query.$and = [{ $or: cursorFilter }];
      }

      const docs = await AuditLogModel.find(query)
        .sort({ at: -1, _id: -1 })
        .limit(page.limit + 1)
        .lean();
      const items = docs.slice(0, page.limit).map((d) => toRecord(d as unknown as Doc));
      const last = items.at(-1);
      const next =
        docs.length > page.limit && last
          ? Buffer.from(`${last.at.getTime()}|${last.id}`).toString('base64url')
          : null;
      return { items, next };
    },
  };
}
