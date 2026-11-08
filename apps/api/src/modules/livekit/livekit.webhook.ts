import { roleSchema, type Role } from '@screem/shared';
import type { VoiceCache } from '../../discord/voice-cache.js';
import type { RealtimeEmitter } from '../../realtime/emitter.js';
import type { Logger } from '../../shared/logger.js';
import type { ParticipationRepo } from '../rooms/participations.js';
import type { PresenceService } from '../rooms/presence.js';
import type { RoomRepo } from '../rooms/rooms.types.js';
import { metrics } from '../../observability/metrics.js';
import type { LiveKitEvent, LiveKitGateway } from './livekit.gateway.js';

export interface WebhookDeps {
  livekit: LiveKitGateway;
  rooms: RoomRepo;
  participations: ParticipationRepo;
  presence: PresenceService;
  realtime: RealtimeEmitter;
  cache: VoiceCache;
  logger: Logger;
  now?: () => Date;
}

/** O papel vem do metadata que NÓS colocamos no token; o cliente não consegue alterá-lo. */
function parseMetadata(metadata: string): { role: Role; avatarUrl: string | null } {
  try {
    const raw = JSON.parse(metadata) as { role?: unknown; avatarUrl?: unknown };
    const role = roleSchema.safeParse(raw.role);
    return {
      role: role.success ? role.data : 'MEMBER',
      avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null,
    };
  } catch {
    return { role: 'MEMBER', avatarUrl: null };
  }
}

/**
 * Eventos do LiveKit. O webhook é informativo e idempotente: quem decide o acesso
 * é sempre o `join`. A única decisão tomada aqui é derrubar quem conectou sem
 * estar na call (token emitido antes de sair do canal).
 */
export class LiveKitWebhookHandler {
  private readonly now: () => Date;

  constructor(private readonly deps: WebhookDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Lança `InvalidWebhookError` se a assinatura for inválida. */
  async handle(rawBody: string, authHeader: string | undefined): Promise<void> {
    const event = await this.deps.livekit.verifyWebhook(rawBody, authHeader);
    metrics.webhookEvents.inc({ event: event.event });
    switch (event.event) {
      case 'participant_joined':
        return this.onJoined(event);
      case 'participant_left':
        return this.onLeft(event);
      case 'room_finished':
        return this.onRoomFinished(event);
      default:
        this.deps.logger.debug({ event: event.event }, 'evento do LiveKit ignorado');
    }
  }

  private async onJoined(event: LiveKitEvent): Promise<void> {
    const { roomName, participant } = event;
    if (!roomName || !participant) return;

    const room = await this.deps.rooms.findById(roomName);
    if (!room) return; // sala de outro sistema

    const { role, avatarUrl } = parseMetadata(participant.metadata);
    const userId = participant.identity;

    if (room.status !== 'OPEN') {
      await this.deps.livekit.removeParticipant(room.id, userId);
      return;
    }

    // Token antigo usado depois de sair da call: derruba na hora.
    if (
      room.type === 'LIVE' &&
      role === 'MEMBER' &&
      room.voiceChannelId &&
      !this.deps.cache.isInChannel(userId, room.voiceChannelId)
    ) {
      this.deps.logger.info({ roomId: room.id, userId }, 'conectou fora da call: removendo');
      await this.deps.livekit.removeParticipant(room.id, userId);
      return;
    }

    const { participation, created } = await this.deps.participations.open({
      roomId: room.id,
      userId,
      displayName: participant.name || userId,
      avatarUrl,
      role,
      at: this.now(),
    });
    if (!created) return;

    this.deps.realtime.toRoom(room.id, 'participant:joined', {
      roomId: room.id,
      participant: {
        userId,
        displayName: participation.displayName,
        avatarUrl: participation.avatarUrl,
        role,
        isSpeaker: room.speakerIds.includes(userId),
      },
    });
  }

  private async onLeft(event: LiveKitEvent): Promise<void> {
    const { roomName, participant } = event;
    if (!roomName || !participant) return;
    // Reconexão: a conexão antiga foi trocada pela nova (mesma identidade).
    if (participant.leaveCause === 'duplicate') return;

    const userId = participant.identity;
    this.deps.presence.clearTimer(roomName, userId);
    const reason = participant.leaveCause === 'client' ? 'LEFT' : 'DISCONNECTED';
    const closed = await this.deps.participations.close(roomName, userId, reason, this.now());
    if (closed) {
      this.deps.realtime.toRoom(roomName, 'participant:left', { roomId: roomName, userId, reason });
    }
  }

  private async onRoomFinished(event: LiveKitEvent): Promise<void> {
    if (!event.roomName) return;
    // A sala do LiveKit fecha sozinha quando fica vazia; a sala do Screem não é
    // encerrada por isso (a live depende do canal de voz). Só fechamos o que sobrou.
    const closed = await this.deps.participations.closeAll(
      event.roomName,
      'DISCONNECTED',
      this.now(),
    );
    for (const p of closed) {
      this.deps.realtime.toRoom(event.roomName, 'participant:left', {
        roomId: event.roomName,
        userId: p.userId,
        reason: 'DISCONNECTED',
      });
    }
  }
}
