import type { Role } from '@screem/shared';
import { ParticipationModel, RoomBanModel } from '../../db/models.js';
import type { MediaSource } from '../livekit/livekit.gateway.js';

export type LeaveReason =
  'LEFT' | 'LEFT_VOICE' | 'KICKED' | 'BANNED' | 'DISCONNECTED' | 'ROOM_ENDED' | 'SESSION_IDLE';

export interface Participation {
  roomId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  roleAtJoin: Role;
  joinedAt: Date;
  leftAt: Date | null;
  leaveReason: LeaveReason | null;
  /** Verdadeiro se `mutedSources` não estiver vazio. */
  mutedByModeration: boolean;
  mutedSources: MediaSource[];
}

export interface ParticipationRepo {
  /** Abre a participação. Idempotente: se já há uma aberta, devolve ela. */
  open(input: {
    roomId: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    role: Role;
    at: Date;
  }): Promise<{ participation: Participation; created: boolean }>;
  /** Fecha a participação aberta. `null` se não havia (já tinha sido fechada). */
  close(
    roomId: string,
    userId: string,
    reason: LeaveReason,
    at: Date,
  ): Promise<Participation | null>;
  closeAll(roomId: string, reason: LeaveReason, at: Date): Promise<Participation[]>;
  findOpen(roomId: string, userId: string): Promise<Participation | null>;
  listOpen(roomId: string): Promise<Participation[]>;
  countOpen(roomId: string): Promise<number>;
  /** Pessoas conectadas em todas as salas (para as métricas). */
  countAllOpen(): Promise<number>;
  /** Todas as participações (abertas e fechadas), da mais antiga para a mais nova. */
  listAll(roomId: string): Promise<Participation[]>;
  /** Último momento em que alguém entrou ou saiu. `null` se nunca houve ninguém. */
  lastActivityAt(roomId: string): Promise<Date | null>;
  /**
   * Fontes silenciadas pela moderação para essa pessoa nesta sala. Vale a participação mais
   * recente (aberta ou não): sair e voltar não desfaz o silenciamento.
   */
  getMutedSources(roomId: string, userId: string): Promise<MediaSource[]>;
  /** Grava na participação mais recente. `false` se a pessoa nunca esteve na sala. */
  setMutedSources(roomId: string, userId: string, sources: MediaSource[]): Promise<boolean>;
}

export interface RoomBan {
  roomId: string;
  userId: string;
  bannedBy: string;
  reason: string | null;
  /** `null` = até o fim da sala. */
  expiresAt: Date | null;
}

export interface BanRepo {
  /** Banimento ainda válido em `now`, se houver. */
  find(roomId: string, userId: string, now: Date): Promise<RoomBan | null>;
  upsert(ban: RoomBan): Promise<void>;
  remove(roomId: string, userId: string): Promise<void>;
}

type PDoc = {
  roomId: string;
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  roleAtJoin: Role;
  joinedAt: Date;
  leftAt?: Date | null;
  leaveReason?: LeaveReason | null;
  mutedByModeration?: boolean | null;
  mutedSources?: MediaSource[] | null;
};

const toParticipation = (d: PDoc): Participation => ({
  roomId: d.roomId,
  userId: d.userId,
  displayName: d.displayName ?? d.userId,
  avatarUrl: d.avatarUrl ?? null,
  roleAtJoin: d.roleAtJoin,
  joinedAt: d.joinedAt,
  leftAt: d.leftAt ?? null,
  leaveReason: d.leaveReason ?? null,
  mutedByModeration: (d.mutedSources ?? []).length > 0,
  mutedSources: d.mutedSources ?? [],
});

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

async function getMutedSources(roomId: string, userId: string): Promise<MediaSource[]> {
  const doc = await ParticipationModel.findOne({ roomId, userId }).sort({ joinedAt: -1 }).lean();
  return (doc?.mutedSources as MediaSource[] | undefined) ?? [];
}

export function createParticipationRepo(): ParticipationRepo {
  const findOpen = async (roomId: string, userId: string) => {
    const doc = await ParticipationModel.findOne({ roomId, userId, leftAt: null }).lean();
    return doc ? toParticipation(doc as PDoc) : null;
  };

  return {
    findOpen,

    getMutedSources,

    async setMutedSources(roomId, userId, sources) {
      const doc = await ParticipationModel.findOne({ roomId, userId })
        .sort({ joinedAt: -1 })
        .lean();
      if (!doc) return false;
      await ParticipationModel.updateOne(
        { _id: doc._id },
        { $set: { mutedSources: sources, mutedByModeration: sources.length > 0 } },
      );
      return true;
    },

    async open(input) {
      const existing = await findOpen(input.roomId, input.userId);
      if (existing) return { participation: existing, created: false };
      // Quem foi silenciado e reconecta continua silenciado.
      const inherited = await getMutedSources(input.roomId, input.userId);
      try {
        const doc = await ParticipationModel.create({
          roomId: input.roomId,
          userId: input.userId,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          roleAtJoin: input.role,
          joinedAt: input.at,
          mutedSources: inherited,
          mutedByModeration: inherited.length > 0,
        });
        return { participation: toParticipation(doc.toObject() as PDoc), created: true };
      } catch (err) {
        // Webhook duplicado ou concorrente (índice único parcial).
        if (!isDuplicateKey(err)) throw err;
        const winner = await findOpen(input.roomId, input.userId);
        if (!winner) throw err;
        return { participation: winner, created: false };
      }
    },

    async close(roomId, userId, reason, at) {
      const doc = await ParticipationModel.findOneAndUpdate(
        { roomId, userId, leftAt: null },
        { $set: { leftAt: at, leaveReason: reason } },
        { new: true, lean: true },
      );
      return doc ? toParticipation(doc as PDoc) : null;
    },

    async closeAll(roomId, reason, at) {
      const open = await ParticipationModel.find({ roomId, leftAt: null }).lean();
      if (open.length === 0) return [];
      await ParticipationModel.updateMany(
        { roomId, leftAt: null },
        { $set: { leftAt: at, leaveReason: reason } },
      );
      return open.map((d) => ({
        ...toParticipation(d as PDoc),
        leftAt: at,
        leaveReason: reason,
      }));
    },

    async listOpen(roomId) {
      const docs = await ParticipationModel.find({ roomId, leftAt: null })
        .sort({ joinedAt: 1 })
        .lean();
      return docs.map((d) => toParticipation(d as PDoc));
    },

    countOpen: (roomId) => ParticipationModel.countDocuments({ roomId, leftAt: null }),

    countAllOpen: () => ParticipationModel.countDocuments({ leftAt: null }),

    async listAll(roomId) {
      const docs = await ParticipationModel.find({ roomId }).sort({ joinedAt: 1 }).lean();
      return docs.map((d) => toParticipation(d as PDoc));
    },

    async lastActivityAt(roomId) {
      const [joined, left] = await Promise.all([
        ParticipationModel.findOne({ roomId }).sort({ joinedAt: -1 }).lean(),
        ParticipationModel.findOne({ roomId, leftAt: { $ne: null } })
          .sort({ leftAt: -1 })
          .lean(),
      ]);
      const times = [joined?.joinedAt, left?.leftAt].filter((d): d is Date => d instanceof Date);
      return times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
    },
  };
}

export function createBanRepo(): BanRepo {
  return {
    async find(roomId, userId, now) {
      const doc = await RoomBanModel.findOne({ roomId, userId }).lean();
      if (!doc) return null;
      if (doc.expiresAt && doc.expiresAt.getTime() <= now.getTime()) return null;
      return {
        roomId: doc.roomId,
        userId: doc.userId,
        bannedBy: doc.bannedBy,
        reason: doc.reason ?? null,
        expiresAt: doc.expiresAt ?? null,
      };
    },
    async upsert(ban) {
      await RoomBanModel.updateOne(
        { roomId: ban.roomId, userId: ban.userId },
        { $set: ban },
        { upsert: true },
      );
    },
    async remove(roomId, userId) {
      await RoomBanModel.deleteOne({ roomId, userId });
    },
  };
}
