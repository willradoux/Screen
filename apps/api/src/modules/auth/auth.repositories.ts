import { SessionModel, UserModel } from '../../db/models.js';
import type { SessionRecord, SessionRepo, UserRecord, UserRepo } from './auth.types.js';

/** Implementações em MongoDB dos repositórios de autenticação. */

export function createUserRepo(): UserRepo {
  const toRecord = (doc: {
    _id: string;
    username: string;
    globalName?: string | null;
    avatarHash?: string | null;
    blocked?: boolean | null;
    lastLoginAt: Date;
  }): UserRecord => ({
    id: doc._id,
    username: doc.username,
    globalName: doc.globalName ?? null,
    avatarHash: doc.avatarHash ?? null,
    blocked: doc.blocked ?? false,
    lastLoginAt: doc.lastLoginAt,
  });

  return {
    async upsertOnLogin(user) {
      const doc = await UserModel.findByIdAndUpdate(
        user.id,
        {
          $set: {
            username: user.username,
            globalName: user.globalName,
            avatarHash: user.avatarHash,
            lastLoginAt: new Date(),
            // Só grava se veio (sem o escopo, não apaga o que já havia).
            ...(user.email ? { email: user.email } : {}),
          },
          $setOnInsert: { blocked: false },
        },
        { upsert: true, new: true, lean: true },
      );
      if (!doc) throw new Error('Falha ao gravar o usuário');
      return toRecord(doc);
    },
    async findById(id) {
      const doc = await UserModel.findById(id).lean();
      return doc ? toRecord(doc) : null;
    },
  };
}

export function createSessionRepo(): SessionRepo {
  return {
    async create(s) {
      const { id, ...rest } = s;
      await SessionModel.create({ _id: id, ...rest });
    },
    async findById(id) {
      const doc = await SessionModel.findById(id).lean();
      if (!doc) return null;
      const record: SessionRecord = {
        id: doc._id,
        userId: doc.userId,
        discordAccessToken: doc.discordAccessToken,
        discordRefreshToken: doc.discordRefreshToken,
        discordExpiresAt: doc.discordExpiresAt,
        ip: doc.ip ?? null,
        userAgent: doc.userAgent ?? null,
        expiresAt: doc.expiresAt,
        absoluteExpiresAt: doc.absoluteExpiresAt,
      };
      return record;
    },
    async updateExpiry(id, expiresAt) {
      await SessionModel.updateOne({ _id: id }, { $set: { expiresAt } });
    },
    async updateTokens(id, tokens) {
      await SessionModel.updateOne({ _id: id }, { $set: tokens });
    },
    async delete(id) {
      await SessionModel.deleteOne({ _id: id });
    },
    async deleteByUser(userId) {
      await SessionModel.deleteMany({ userId });
    },
  };
}
