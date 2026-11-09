import type { RoomStatus, RoomType } from '@screem/shared';
import { roomUrl } from '../../discord/embeds.js';
import type { Participation } from './participations.js';
import type { RoomRecord } from './rooms.types.js';

/** Sala como a API devolve (docs/backend/api-rest.md, tipo `Room`). */
export interface RoomDto {
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
  /** Só lives: `ACTIVE` (em uso) ou `IDLE` (em espera, ativa quando alguém entra). */
  mediaState: 'ACTIVE' | 'IDLE';
  participantCount: number;
  url: string;
}

export function toRoomDto(room: RoomRecord, participantCount: number, webUrl: string): RoomDto {
  return {
    id: room.id,
    type: room.type,
    status: room.status,
    title: room.title,
    description: room.description,
    voiceChannelId: room.voiceChannelId,
    startsAt: room.startsAt?.toISOString() ?? null,
    openedAt: room.openedAt?.toISOString() ?? null,
    endedAt: room.endedAt?.toISOString() ?? null,
    createdBy: room.createdBy,
    maxParticipants: room.maxParticipants,
    lectureMode: room.lectureMode,
    mediaState: room.mediaState,
    participantCount,
    url: roomUrl(webUrl, room.id),
  };
}

export function toParticipantDto(p: Participation, room: RoomRecord) {
  return {
    userId: p.userId,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    role: p.roleAtJoin,
    joinedAt: p.joinedAt.toISOString(),
    isSpeaker: room.speakerIds.includes(p.userId),
    mutedByModeration: p.mutedByModeration,
    mutedSources: p.mutedSources,
  };
}

/** Cursor opaco de paginação: base64url("<createdAtMs>|<id>"). */
export function isValidCursor(cursor: string): boolean {
  try {
    return /^\d{10,16}\|[\w-]{22}$/.test(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
}
