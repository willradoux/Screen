import { ROLE_RANK, type Role } from '@screem/shared';
import type { DiscordGateway } from '../../discord/gateway.js';
import type { VoiceCache } from '../../discord/voice-cache.js';
import { AppError } from '../../shared/errors.js';
import type { Identity } from '../auth/auth.types.js';
import {
  ALL_SOURCES,
  LiveKitUnavailableError,
  type LiveKitGateway,
  type MediaSource,
} from '../livekit/livekit.gateway.js';
import type { BanRepo, ParticipationRepo } from './participations.js';
import type { RoomRecord } from './rooms.types.js';

export type AccessReason =
  'ROOM_NOT_OPEN' | 'BANNED_FROM_ROOM' | 'ROLE_NOT_ALLOWED' | 'NOT_IN_VOICE' | 'ROOM_FULL';

export type AccessResult =
  | { canJoin: true }
  | {
      canJoin: false;
      reason: AccessReason;
      /** Texto para a pessoa saber o que fazer. */
      hint: string;
      details: Record<string, unknown>;
    };

export interface RoomPermissions {
  canPublish: boolean;
  canPublishSources: MediaSource[];
  canModerate: boolean;
}

export interface JoinResult {
  livekit: { url: string; token: string };
  participant: { identity: string; name: string; role: Role };
  permissions: RoomPermissions;
  room: { id: string; lectureMode: boolean };
}

/** Erro HTTP de cada motivo de recusa. Catálogo: docs/backend/erros.md. */
const REFUSAL: Record<AccessReason, { status: number; message: string }> = {
  NOT_IN_VOICE: {
    status: 403,
    message: 'Você precisa estar no canal de voz para entrar nesta sala.',
  },
  ROLE_NOT_ALLOWED: { status: 403, message: 'Seu cargo não tem acesso a esta reunião.' },
  BANNED_FROM_ROOM: { status: 403, message: 'Você foi removido desta sala.' },
  ROOM_NOT_OPEN: { status: 409, message: 'Esta sala não está aberta.' },
  ROOM_FULL: { status: 409, message: 'A sala está lotada.' },
};

export interface AccessDeps {
  participations: ParticipationRepo;
  bans: BanRepo;
  cache: VoiceCache;
  /** Só para dizer o nome do canal na dica. */
  gateway: Pick<DiscordGateway, 'getChannel'>;
  livekit: LiveKitGateway;
  livekitPublicUrl: string;
  tokenTtlSeconds: number;
  now?: () => Date;
}

/** Quem pode entrar na sala e com quais permissões. Ver docs/backend/permissoes.md. */
export class RoomAccess {
  private readonly now: () => Date;

  constructor(private readonly deps: AccessDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Avalia o acesso sem efeitos colaterais (usado por `GET /rooms/:id/access`). */
  async evaluate(room: RoomRecord, identity: Identity): Promise<AccessResult> {
    const userId = identity.user.id;
    const isStaff = ROLE_RANK[identity.role] >= ROLE_RANK.MOD;

    if (room.status !== 'OPEN') {
      return refuse('ROOM_NOT_OPEN', 'Esta sala não está aberta.', {
        status: room.status,
        startsAt: room.startsAt?.toISOString() ?? null,
      });
    }

    const ban = await this.deps.bans.find(room.id, userId, this.now());
    if (ban) {
      return refuse('BANNED_FROM_ROOM', 'Você foi removido desta sala.', {
        expiresAt: ban.expiresAt?.toISOString() ?? null,
      });
    }

    if (room.type === 'MEETING' && !isStaff && room.allowedRoleIds.length > 0) {
      const allowed = room.allowedRoleIds.some((r) => identity.roleIds.includes(r));
      if (!allowed) {
        return refuse('ROLE_NOT_ALLOWED', 'Seu cargo não tem acesso a esta reunião.', {});
      }
    }

    // Lives: só quem está AGORA no canal de voz (a checagem é no servidor, via bot).
    // Moderação entra sem estar na call para poder moderar.
    if (room.type === 'LIVE' && !isStaff) {
      const channelId = room.voiceChannelId;
      if (!channelId || !this.deps.cache.isInChannel(userId, channelId)) {
        const name = channelId ? (await this.deps.gateway.getChannel(channelId))?.name : undefined;
        return refuse(
          'NOT_IN_VOICE',
          name
            ? `Entre no canal de voz "${name}" no Discord para participar.`
            : 'Entre no canal de voz da live no Discord para participar.',
          name ? { voiceChannelName: name } : {},
        );
      }
    }

    // Quem já está na sala pode reconectar mesmo com a sala cheia.
    const already = await this.deps.participations.findOpen(room.id, userId);
    if (!already && (await this.deps.participations.countOpen(room.id)) >= room.maxParticipants) {
      return refuse('ROOM_FULL', 'A sala está lotada. Tente novamente em instantes.', {
        maxParticipants: room.maxParticipants,
      });
    }

    return { canJoin: true };
  }

  /** O que a pessoa pode publicar nesta sala agora. */
  async permissionsFor(room: RoomRecord, identity: Identity): Promise<RoomPermissions> {
    const staff = ROLE_RANK[identity.role] >= ROLE_RANK.MOD;
    if (staff) return { canPublish: true, canPublishSources: ALL_SOURCES, canModerate: true };

    const participation = await this.deps.participations.findOpen(room.id, identity.user.id);
    const silenced = participation?.mutedByModeration ?? false;
    const lectureBlocked = room.lectureMode && !room.speakerIds.includes(identity.user.id);
    if (silenced || lectureBlocked) {
      return { canPublish: false, canPublishSources: [], canModerate: false };
    }
    return { canPublish: true, canPublishSources: ALL_SOURCES, canModerate: false };
  }

  /** Valida o acesso e emite o token do LiveKit. Lança `AppError` se recusado. */
  async join(room: RoomRecord, identity: Identity): Promise<JoinResult> {
    const access = await this.evaluate(room, identity);
    if (!access.canJoin) {
      const { status, message } = REFUSAL[access.reason];
      throw new AppError(access.reason, status, message, access.details);
    }

    const permissions = await this.permissionsFor(room, identity);
    const metadata = JSON.stringify({ role: identity.role, avatarUrl: identity.avatarUrl });

    try {
      await this.deps.livekit.ensureRoom(room.id, room.maxParticipants);
      const token = await this.deps.livekit.createToken({
        roomName: room.id,
        identity: identity.user.id,
        name: identity.displayName,
        metadata,
        canPublish: permissions.canPublish,
        canPublishSources: permissions.canPublishSources,
        roomAdmin: identity.role === 'ADMIN',
        ttlSeconds: this.deps.tokenTtlSeconds,
      });
      return {
        livekit: { url: this.deps.livekitPublicUrl, token },
        participant: {
          identity: identity.user.id,
          name: identity.displayName,
          role: identity.role,
        },
        permissions,
        room: { id: room.id, lectureMode: room.lectureMode },
      };
    } catch (err) {
      if (err instanceof LiveKitUnavailableError) {
        throw new AppError('LIVEKIT_UNAVAILABLE', 502, 'O servidor de vídeo está indisponível.');
      }
      throw err;
    }
  }
}

function refuse(
  reason: AccessReason,
  hint: string,
  details: Record<string, unknown>,
): AccessResult {
  return { canJoin: false, reason, hint, details };
}
