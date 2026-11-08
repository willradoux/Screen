import type { Role } from '@screem/shared';
import type { MediaSource } from '../../src/modules/livekit/livekit.gateway.js';
import type {
  LeaveReason,
  Participation,
  ParticipationRepo,
} from '../../src/modules/rooms/participations.js';

export class MemoryParticipations implements ParticipationRepo {
  rows: Participation[] = [];

  async open(input: {
    roomId: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    role: Role;
    at: Date;
  }) {
    const existing = await this.findOpen(input.roomId, input.userId);
    if (existing) return { participation: existing, created: false };
    const row: Participation = {
      roomId: input.roomId,
      userId: input.userId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      roleAtJoin: input.role,
      joinedAt: input.at,
      leftAt: null,
      leaveReason: null,
      mutedByModeration: false,
      mutedSources: [],
    };
    // Quem foi silenciado e reconecta continua silenciado.
    const inherited = await this.getMutedSources(input.roomId, input.userId);
    row.mutedSources = inherited;
    row.mutedByModeration = inherited.length > 0;
    this.rows.push(row);
    return { participation: { ...row }, created: true };
  }

  async close(roomId: string, userId: string, reason: LeaveReason, at: Date) {
    const row = this.rows.find((r) => r.roomId === roomId && r.userId === userId && !r.leftAt);
    if (!row) return null;
    row.leftAt = at;
    row.leaveReason = reason;
    return { ...row };
  }

  async closeAll(roomId: string, reason: LeaveReason, at: Date) {
    const open = this.rows.filter((r) => r.roomId === roomId && !r.leftAt);
    for (const r of open) {
      r.leftAt = at;
      r.leaveReason = reason;
    }
    return open.map((r) => ({ ...r }));
  }

  async findOpen(roomId: string, userId: string) {
    const row = this.rows.find((r) => r.roomId === roomId && r.userId === userId && !r.leftAt);
    return row ? { ...row } : null;
  }

  async listOpen(roomId: string) {
    return this.rows.filter((r) => r.roomId === roomId && !r.leftAt).map((r) => ({ ...r }));
  }

  async countOpen(roomId: string) {
    return this.rows.filter((r) => r.roomId === roomId && !r.leftAt).length;
  }

  async countAllOpen() {
    return this.rows.filter((r) => !r.leftAt).length;
  }

  async listAll(roomId: string) {
    return this.rows
      .filter((r) => r.roomId === roomId)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((r) => ({ ...r }));
  }

  async lastActivityAt(roomId: string) {
    const times = this.rows
      .filter((r) => r.roomId === roomId)
      .flatMap((r) => [r.joinedAt, r.leftAt])
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  }

  private latest(roomId: string, userId: string) {
    return this.rows
      .filter((r) => r.roomId === roomId && r.userId === userId)
      .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())[0];
  }

  async getMutedSources(roomId: string, userId: string) {
    return [...(this.latest(roomId, userId)?.mutedSources ?? [])];
  }

  async setMutedSources(roomId: string, userId: string, sources: MediaSource[]) {
    const row = this.latest(roomId, userId);
    if (!row) return false;
    row.mutedSources = sources;
    row.mutedByModeration = sources.length > 0;
    return true;
  }
}
