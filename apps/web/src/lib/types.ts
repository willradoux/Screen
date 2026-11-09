import type { Role, RoomStatus, RoomType } from '@screem/shared';

export type { Role, RoomStatus, RoomType };

/** Contrato da API: docs/backend/api-rest.md. */

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
}

export interface Room {
  id: string;
  type: RoomType;
  status: RoomStatus;
  title: string;
  description: string | null;
  voiceChannelId: string | null;
  startsAt: string | null;
  openedAt: string | null;
  endedAt: string | null;
  createdBy: string;
  maxParticipants: number;
  lectureMode: boolean;
  /** Só lives: em uso (ACTIVE) ou em espera (IDLE; ativa quando alguém entra pelo link). */
  mediaState: 'ACTIVE' | 'IDLE';
  participantCount: number;
  url: string;
}

export interface Reminder {
  minutesBefore: number;
  sent: boolean;
}

export interface Meeting extends Room {
  /** Já foi divulgada no canal de avisos? */
  announced: boolean;
  allowedRoleIds: string[];
  reminders: Reminder[];
}

export type AccessReason =
  'ROOM_NOT_OPEN' | 'BANNED_FROM_ROOM' | 'ROLE_NOT_ALLOWED' | 'NOT_IN_VOICE' | 'ROOM_FULL';

export interface AccessResult {
  canJoin: boolean;
  reason: AccessReason | null;
  hint: string | null;
  voiceChannelName?: string;
  status?: RoomStatus;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxParticipants?: number;
}

export type MediaSource = 'microphone' | 'camera' | 'screen_share' | 'screen_share_audio';

export interface JoinResult {
  livekit: { url: string; token: string };
  participant: { identity: string; name: string; role: Role };
  permissions: { canPublish: boolean; canPublishSources: MediaSource[]; canModerate: boolean };
  room: { id: string; lectureMode: boolean; mediaState: 'ACTIVE' | 'IDLE' };
  /** Este join tirou a live do modo de espera (mostrar "ativando sessão"). */
  sessionActivated: boolean;
}

export interface Participant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  joinedAt: string;
  isSpeaker: boolean;
  mutedByModeration: boolean;
  mutedSources: MediaSource[];
}

export interface MeetingReport {
  durationMinutes: number;
  peakParticipants: number;
  attendees: {
    userId: string;
    displayName: string;
    joinedAt: string;
    leftAt: string;
    minutes: number;
  }[];
}

export interface Settings {
  guildId: string;
  liveCategoryId: string | null;
  liveTextChannelId: string | null;
  announceChannelId: string | null;
  adminRoleIds: string[];
  modRoleIds: string[];
  meetingAllowedRoleIds: string[];
  maxParticipantsLive: number;
  graceSeconds: number;
  liveChannelIds: string[];
  logChannelId: string | null;
  mentionRoleId: string | null;
  emptyLiveEndSeconds: number | null;
  idleSessionMinutes: number;
  activationGraceMinutes: number;
}

export interface GuildChannel {
  id: string;
  name: string;
  kind: 'voice' | 'text' | 'category';
  parentId: string | null;
}

export interface GuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

export interface PanelUser {
  userId: string;
  role: 'ADMIN' | 'MOD';
  note: string | null;
  addedBy: string;
  addedAt: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  inServer: boolean;
}

export type SettingsPatch = Partial<Omit<Settings, 'guildId'>>;

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  targetId: string | null;
  roomId: string | null;
  action: string;
  reason: string | null;
  meta: Record<string, unknown>;
}

export interface Page {
  next: string | null;
  limit: number;
}

/** Eventos do Socket.IO (docs/backend/eventos-socketio.md). */
export type EndReason =
  'ENDED_BY_MOD' | 'ENDED_BY_ADMIN' | 'VOICE_EMPTY' | 'MEETING_FINISHED' | 'CANCELED';

export type LeaveReason =
  'LEFT' | 'LEFT_VOICE' | 'KICKED' | 'BANNED' | 'DISCONNECTED' | 'ROOM_ENDED' | 'SESSION_IDLE';

export interface ModerationAction {
  roomId: string;
  action: 'MUTED' | 'UNMUTED' | 'KICKED' | 'BANNED';
  by: string;
  reason: string | null;
  sources?: MediaSource[];
  expiresAt?: string | null;
}
