import { model, Schema } from 'mongoose';

/**
 * Modelos do MongoDB. Ver docs/backend/modelo-de-dados.md.
 * IDs do Discord são sempre string, por isso `_id: String`.
 */

const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    username: { type: String, required: true },
    globalName: { type: String, default: null },
    avatarHash: { type: String, default: null },
    blocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const sessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    discordAccessToken: { type: String, required: true },
    discordRefreshToken: { type: String, required: true },
    discordExpiresAt: { type: Date, required: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
// Remove sessões expiradas automaticamente.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const guildSettingsSchema = new Schema(
  {
    _id: { type: String, required: true },
    liveCategoryId: { type: String, default: null },
    liveTextChannelId: { type: String, default: null },
    announceChannelId: { type: String, default: null },
    adminRoleIds: { type: [String], default: [] },
    modRoleIds: { type: [String], default: [] },
    meetingAllowedRoleIds: { type: [String], default: [] },
    maxParticipantsLive: { type: Number, default: 25 },
    graceSeconds: { type: Number, default: 30 },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const UserModel = model('User', userSchema, 'users');
export const SessionModel = model('Session', sessionSchema, 'sessions');
export const GuildSettingsModel = model('GuildSettings', guildSettingsSchema, 'guild_settings');
