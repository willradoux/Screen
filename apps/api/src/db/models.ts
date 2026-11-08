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

const roomSchema = new Schema(
  {
    _id: { type: String, required: true },
    guildId: { type: String, required: true },
    type: { type: String, enum: ['LIVE', 'MEETING'], required: true },
    status: { type: String, enum: ['SCHEDULED', 'OPEN', 'ENDED', 'CANCELED'], required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    voiceChannelId: { type: String, default: null },
    announceChannelId: { type: String, default: null },
    announceMessageId: { type: String, default: null },
    startsAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
    maxParticipants: { type: Number, required: true },
    allowedRoleIds: { type: [String], default: [] },
    lectureMode: { type: Boolean, default: false },
    speakerIds: { type: [String], default: [] },
    reminders: {
      type: [{ _id: false, minutesBefore: Number, sentAt: { type: Date, default: null } }],
      default: [],
    },
    livekitRoomName: { type: String, required: true },
    endReason: { type: String, default: null },
  },
  { timestamps: true },
);
roomSchema.index({ guildId: 1, status: 1, type: 1 });
// Garante no máximo uma sala aberta por canal de voz, mesmo com eventos concorrentes.
roomSchema.index(
  { voiceChannelId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'OPEN', voiceChannelId: { $type: 'string' } },
  },
);
// Usado pelo agendador de reuniões (Fase 7).
roomSchema.index({ startsAt: 1 }, { partialFilterExpression: { status: 'SCHEDULED' } });

export const RoomModel = model('Room', roomSchema, 'rooms');
export const UserModel = model('User', userSchema, 'users');
export const SessionModel = model('Session', sessionSchema, 'sessions');
export const GuildSettingsModel = model('GuildSettings', guildSettingsSchema, 'guild_settings');
