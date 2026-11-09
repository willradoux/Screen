import { GuildSettingsModel } from '../../db/models.js';
import { SETTINGS_DEFAULTS, type GuildSettings, type SettingsRepo } from './settings.types.js';

type Doc = {
  _id: string;
  liveCategoryId?: string | null;
  liveTextChannelId?: string | null;
  announceChannelId?: string | null;
  adminRoleIds?: string[];
  modRoleIds?: string[];
  meetingAllowedRoleIds?: string[];
  maxParticipantsLive?: number | null;
  graceSeconds?: number | null;
  liveChannelIds?: string[];
  logChannelId?: string | null;
  mentionRoleId?: string | null;
  emptyLiveEndSeconds?: number | null;
  idleSessionMinutes?: number | null;
  activationGraceMinutes?: number | null;
  panelUsers?: {
    userId: string;
    role: 'ADMIN' | 'MOD';
    note?: string | null;
    addedBy: string;
    addedAt: Date;
  }[];
};

function toSettings(guildId: string, doc: Doc | null): GuildSettings {
  return {
    guildId,
    liveCategoryId: doc?.liveCategoryId ?? null,
    liveTextChannelId: doc?.liveTextChannelId ?? null,
    announceChannelId: doc?.announceChannelId ?? null,
    adminRoleIds: doc?.adminRoleIds ?? [],
    modRoleIds: doc?.modRoleIds ?? [],
    meetingAllowedRoleIds: doc?.meetingAllowedRoleIds ?? [],
    maxParticipantsLive: doc?.maxParticipantsLive ?? SETTINGS_DEFAULTS.maxParticipantsLive,
    graceSeconds: doc?.graceSeconds ?? SETTINGS_DEFAULTS.graceSeconds,
    liveChannelIds: doc?.liveChannelIds ?? [],
    logChannelId: doc?.logChannelId ?? null,
    mentionRoleId: doc?.mentionRoleId ?? null,
    emptyLiveEndSeconds: doc?.emptyLiveEndSeconds ?? null,
    idleSessionMinutes: doc?.idleSessionMinutes ?? SETTINGS_DEFAULTS.idleSessionMinutes,
    activationGraceMinutes: doc?.activationGraceMinutes ?? SETTINGS_DEFAULTS.activationGraceMinutes,
    panelUsers: (doc?.panelUsers ?? []).map((p) => ({
      userId: p.userId,
      role: p.role,
      note: p.note ?? null,
      addedBy: p.addedBy,
      addedAt: p.addedAt,
    })),
  };
}

export function createSettingsRepo(): SettingsRepo {
  const get = async (guildId: string) =>
    toSettings(guildId, await GuildSettingsModel.findById(guildId).lean());

  return {
    async getRoleConfig(guildId) {
      const s = await get(guildId);
      return {
        adminRoleIds: s.adminRoleIds,
        modRoleIds: s.modRoleIds,
        adminUserIds: s.panelUsers.filter((p) => p.role === 'ADMIN').map((p) => p.userId),
        modUserIds: s.panelUsers.filter((p) => p.role === 'MOD').map((p) => p.userId),
      };
    },
    get,
    async update(guildId, patch, updatedBy) {
      const doc = await GuildSettingsModel.findByIdAndUpdate(
        guildId,
        { $set: { ...patch, updatedBy } },
        { upsert: true, new: true, lean: true, setDefaultsOnInsert: true },
      );
      return toSettings(guildId, doc);
    },
    async modifyList(guildId, field, action, roleId, updatedBy) {
      const op =
        action === 'add' ? { $addToSet: { [field]: roleId } } : { $pull: { [field]: roleId } };
      const doc = await GuildSettingsModel.findByIdAndUpdate(
        guildId,
        { ...op, $set: { updatedBy } },
        { upsert: true, new: true, lean: true, setDefaultsOnInsert: true },
      );
      return toSettings(guildId, doc);
    },
    async removeReference(guildId, id) {
      await GuildSettingsModel.updateOne(
        { _id: guildId },
        {
          $pull: {
            adminRoleIds: id,
            modRoleIds: id,
            meetingAllowedRoleIds: id,
            liveChannelIds: id,
          },
        },
      );
      for (const field of [
        'liveCategoryId',
        'liveTextChannelId',
        'announceChannelId',
        'logChannelId',
        'mentionRoleId',
      ]) {
        await GuildSettingsModel.updateOne(
          { _id: guildId, [field]: id },
          { $set: { [field]: null } },
        );
      }
    },
    async setPanelUser(guildId, user) {
      // Troca o nível de quem já está na lista; senão acrescenta.
      await GuildSettingsModel.updateOne(
        { _id: guildId },
        { $pull: { panelUsers: { userId: user.userId } } },
        { upsert: true },
      );
      const doc = await GuildSettingsModel.findByIdAndUpdate(
        guildId,
        { $push: { panelUsers: user }, $set: { updatedBy: user.addedBy } },
        { upsert: true, new: true, lean: true, setDefaultsOnInsert: true },
      );
      return toSettings(guildId, doc);
    },
    async removePanelUser(guildId, userId, updatedBy) {
      const doc = await GuildSettingsModel.findByIdAndUpdate(
        guildId,
        { $pull: { panelUsers: { userId } }, $set: { updatedBy } },
        { upsert: true, new: true, lean: true, setDefaultsOnInsert: true },
      );
      return toSettings(guildId, doc);
    },
  };
}
