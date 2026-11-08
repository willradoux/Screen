import type {
  AuditEntry,
  AuditFilter,
  AuditRecord,
  AuditRepo,
} from '../../src/modules/audit/audit.service.js';

/** Repositório de auditoria em memória (mesma ordem e cursor do de MongoDB). */
export class MemoryAuditRepo implements AuditRepo {
  records: AuditRecord[] = [];
  private seq = 0;
  failNext = false;

  async insert(entry: AuditEntry & { at: Date }) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('banco indisponível');
    }
    const id = (++this.seq).toString(16).padStart(24, '0');
    this.records.push({
      id,
      at: entry.at,
      actorId: entry.actorId,
      targetId: entry.targetId ?? null,
      roomId: entry.roomId ?? null,
      action: entry.action,
      reason: entry.reason ?? null,
      meta: entry.meta ?? {},
    });
  }

  of(action: AuditRecord['action']) {
    return this.records.filter((r) => r.action === action);
  }

  async list(filter: AuditFilter, page: { limit: number; cursor?: string }) {
    let all = this.records
      .filter(
        (r) =>
          (!filter.actorId || r.actorId === filter.actorId) &&
          (!filter.targetId || r.targetId === filter.targetId) &&
          (!filter.roomId || r.roomId === filter.roomId) &&
          (!filter.action || r.action === filter.action) &&
          (!filter.from || r.at >= filter.from) &&
          (!filter.to || r.at <= filter.to),
      )
      .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
    if (page.cursor) {
      const [ms, id] = Buffer.from(page.cursor, 'base64url').toString().split('|');
      all = all.filter(
        (r) => r.at.getTime() < Number(ms) || (r.at.getTime() === Number(ms) && r.id < id!),
      );
    }
    const items = all.slice(0, page.limit);
    const last = items.at(-1);
    const next =
      all.length > page.limit && last
        ? Buffer.from(`${last.at.getTime()}|${last.id}`).toString('base64url')
        : null;
    return { items, next };
  }
}
