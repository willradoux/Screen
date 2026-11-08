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
  };
}

export function createSettingsRepo(): SettingsRepo {
  const get = async (guildId: string) =>
    toSettings(guildId, await GuildSettingsModel.findById(guildId).lean());

  return {
    async getRoleConfig(guildId) {
      const s = await get(guildId);
      return { adminRoleIds: s.adminRoleIds, modRoleIds: s.modRoleIds };
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
          $pull: { adminRoleIds: id, modRoleIds: id, meetingAllowedRoleIds: id },
        },
      );
      for (const field of ['liveCategoryId', 'liveTextChannelId', 'announceChannelId']) {
        await GuildSettingsModel.updateOne(
          { _id: guildId, [field]: id },
          { $set: { [field]: null } },
        );
      }
    },
  };
}
