import type { VoiceCache } from '../../discord/voice-cache.js';
import type { RealtimeEmitter } from '../../realtime/emitter.js';
import type { Logger } from '../../shared/logger.js';
import type { Scheduler } from '../../shared/scheduler.js';
import type { LiveKitGateway } from '../livekit/livekit.gateway.js';
import type { SettingsRepo } from '../settings/settings.types.js';
import type { EndReason } from './rooms.service.js';
import type { LeaveReason, ParticipationRepo } from './participations.js';
import type { RoomRecord } from './rooms.types.js';

export interface PresenceDeps {
  participations: ParticipationRepo;
  livekit: LiveKitGateway;
  realtime: RealtimeEmitter;
  settings: SettingsRepo;
  cache: VoiceCache;
  scheduler: Scheduler;
  logger: Logger;
  guildId: string;
  now?: () => Date;
}

/**
 * Quem está na sala e por quanto tempo pode continuar. É aqui que a regra
 * "saiu da call, perdeu a live" vira ação (com tolerância).
 * Ver docs/backend/livekit-webrtc.md.
 */
export class PresenceService {
  private readonly timers = new Map<string, unknown>();
  private readonly now: () => Date;

  constructor(private readonly deps: PresenceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private key(roomId: string, userId: string) {
    return `${roomId}:${userId}`;
  }

  /**
   * Alguém saiu do canal de voz da live. Se estava transmitindo como membro comum,
   * avisa e dá `graceSeconds` para voltar; depois remove. MOD e ADMIN não são
   * removidos (podem moderar sem estar na call).
   */
  async userLeftVoice(room: RoomRecord, userId: string): Promise<void> {
    const participation = await this.deps.participations.findOpen(room.id, userId);
    if (!participation || participation.roleAtJoin !== 'MEMBER') return;

    const key = this.key(room.id, userId);
    if (this.timers.has(key)) return;

    const { graceSeconds } = await this.deps.settings.get(this.deps.guildId);
    this.deps.realtime.toUser(userId, 'voice:warning', {
      roomId: room.id,
      secondsLeft: graceSeconds,
    });

    const channelId = room.voiceChannelId;
    this.timers.set(
      key,
      this.deps.scheduler.setTimeout(() => {
        this.timers.delete(key);
        void this.expire(room.id, userId, channelId).catch((err) =>
          this.deps.logger.error({ err, roomId: room.id, userId }, 'falha ao remover da live'),
        );
      }, graceSeconds * 1000),
    );
  }

  /** Voltou para o canal dentro da tolerância: cancela a remoção. */
  userReturnedToVoice(roomId: string, userId: string): void {
    if (this.clearTimer(roomId, userId)) {
      this.deps.realtime.toUser(userId, 'voice:restored', { roomId });
    }
  }

  private async expire(roomId: string, userId: string, channelId: string | null) {
    // Confere de novo: pode ter voltado no último instante.
    if (channelId && this.deps.cache.isInChannel(userId, channelId)) return;
    await this.removeFromRoom(roomId, userId, 'LEFT_VOICE');
  }

  /** Tira a pessoa da sala: fecha a participação, derruba no LiveKit e avisa a sala. */
  async removeFromRoom(roomId: string, userId: string, reason: LeaveReason): Promise<boolean> {
    this.clearTimer(roomId, userId);
    const closed = await this.deps.participations.close(roomId, userId, reason, this.now());

    try {
      await this.deps.livekit.removeParticipant(roomId, userId);
    } catch (err) {
      this.deps.logger.warn({ err, roomId, userId }, 'não consegui remover do LiveKit');
    }

    if (closed) this.deps.realtime.toRoom(roomId, 'participant:left', { roomId, userId, reason });
    return closed !== null;
  }

  /** Cancela a contagem regressiva de alguém que saiu por conta própria. */
  clearTimer(roomId: string, userId: string): boolean {
    const key = this.key(roomId, userId);
    const handle = this.timers.get(key);
    if (handle === undefined) return false;
    this.deps.scheduler.clearTimeout(handle);
    this.timers.delete(key);
    return true;
  }

  /** Sala encerrada: avisa os clientes, derruba o LiveKit e fecha as participações. */
  async onRoomEnded(room: RoomRecord, reason: EndReason): Promise<void> {
    for (const key of [...this.timers.keys()]) {
      if (!key.startsWith(`${room.id}:`)) continue;
      this.deps.scheduler.clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    // Primeiro avisa (o cliente sai com elegância); depois derruba.
    this.deps.realtime.toRoom(room.id, 'room:ended', { roomId: room.id, reason });
    await this.deps.participations.closeAll(room.id, 'ROOM_ENDED', this.now());
    try {
      await this.deps.livekit.deleteRoom(room.id);
    } catch (err) {
      this.deps.logger.warn({ err, roomId: room.id }, 'não consegui encerrar a sala no LiveKit');
    }
  }
}
