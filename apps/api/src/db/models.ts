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

const participationSchema = new Schema({
  roomId: { type: String, required: true },
  userId: { type: String, required: true },
  displayName: { type: String, default: null },
  avatarUrl: { type: String, default: null },
  roleAtJoin: { type: String, enum: ['MEMBER', 'MOD', 'ADMIN'], required: true },
  joinedAt: { type: Date, required: true },
  leftAt: { type: Date, default: null },
  leaveReason: { type: String, default: null },
  mutedByModeration: { type: Boolean, default: false },
  // Fontes silenciadas pela moderação (a pessoa não pode publicá-las).
  mutedSources: { type: [String], default: [] },
});
// No máximo uma participação aberta por pessoa em cada sala.
participationSchema.index(
  { roomId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { leftAt: null } },
);
participationSchema.index({ roomId: 1, leftAt: 1 });

const roomBanSchema = new Schema({
  roomId: { type: String, required: true },
  userId: { type: String, required: true },
  bannedBy: { type: String, required: true },
  reason: { type: String, default: null },
  expiresAt: { type: Date, default: null },
});
roomBanSchema.index({ roomId: 1, userId: 1 }, { unique: true });
// Remove banimentos temporários vencidos (os sem prazo têm expiresAt nulo e ficam).
roomBanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const auditLogSchema = new Schema({
  at: { type: Date, required: true },
  actorId: { type: String, required: true },
  targetId: { type: String, default: null },
  roomId: { type: String, default: null },
  action: { type: String, required: true },
  reason: { type: String, default: null },
  meta: { type: Schema.Types.Mixed, default: {} },
});
auditLogSchema.index({ at: -1 });
auditLogSchema.index({ actorId: 1, at: -1 });
auditLogSchema.index({ roomId: 1, at: -1 });

export const AuditLogModel = model('AuditLog', auditLogSchema, 'audit_logs');
export const RoomModel = model('Room', roomSchema, 'rooms');
export const ParticipationModel = model('Participation', participationSchema, 'participations');
export const RoomBanModel = model('RoomBan', roomBanSchema, 'room_bans');
export const UserModel = model('User', userSchema, 'users');
export const SessionModel = model('Session', sessionSchema, 'sessions');
export const GuildSettingsModel = model('GuildSettings', guildSettingsSchema, 'guild_settings');
