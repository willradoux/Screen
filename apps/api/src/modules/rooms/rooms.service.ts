import { opsLog } from '../../shared/ops-log.js';
import type { Logger } from '../../shared/logger.js';
import type { RoomAnnouncer } from './announcer.js';
import type { NewMeeting, RoomRecord, RoomRepo } from './rooms.types.js';

const END_REASON_TEXT: Record<string, string> = {
  ENDED_BY_MOD: 'encerrada por um moderador',
  ENDED_BY_ADMIN: 'encerrada por um administrador',
  VOICE_EMPTY: 'a call ficou vazia',
  MEETING_FINISHED: 'a reunião terminou (ou ficou parada)',
  CANCELED: 'cancelada',
};

export type EndReason =
  'VOICE_EMPTY' | 'ENDED_BY_MOD' | 'ENDED_BY_ADMIN' | 'MEETING_FINISHED' | 'CANCELED';

/** Ouvintes de encerramento (Fase 5: derrubar o LiveKit e avisar os sockets). */
export type RoomEndedListener = (room: RoomRecord, reason: EndReason) => void | Promise<void>;

export interface RoomServiceDeps {
  rooms: RoomRepo;
  announcer: RoomAnnouncer;
  logger: Logger;
  now?: () => Date;
}

/** Regras do ciclo de vida das salas. Ver docs/backend/reunioes.md. */
export class RoomService {
  private readonly now: () => Date;
  private readonly endedListeners: RoomEndedListener[] = [];

  constructor(private readonly deps: RoomServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  onEnded(listener: RoomEndedListener): void {
    this.endedListeners.push(listener);
  }

  /** Sala de live aberta do canal. Cria e anuncia se necessário. */
  async ensureLive(input: {
    guildId: string;
    channelId: string;
    title: string;
    maxParticipants: number;
    openedBy: string;
  }): Promise<{ room: RoomRecord; created: boolean }> {
    const { room, created } = await this.deps.rooms.ensureOpenLive({
      guildId: input.guildId,
      channelId: input.channelId,
      title: input.title,
      maxParticipants: input.maxParticipants,
      createdBy: input.openedBy,
      now: this.now(),
    });
    return { room, created };
  }

  /**
   * Encerra uma sala aberta. Idempotente: a segunda chamada devolve `null`.
   * Atualiza o embed e notifica os ouvintes.
   */
  async endRoom(roomId: string, reason: EndReason): Promise<RoomRecord | null> {
    const room = await this.deps.rooms.transition(roomId, ['OPEN'], 'ENDED', {
      endedAt: this.now(),
      endReason: reason,
    });
    if (!room) return null;
    this.deps.announcer.cancelScheduled(room.id);
    opsLog.info(
      room.type === 'LIVE' ? 'Live encerrada' : 'Reunião encerrada',
      `"${room.title}": ${END_REASON_TEXT[reason] ?? reason}.`,
      [{ name: 'Sala', value: room.id }],
    );
    await this.safely('atualizar embed', () => this.deps.announcer.refresh(room));
    for (const listener of this.endedListeners) {
      await this.safely('ouvinte de encerramento', () => listener(room, reason));
    }
    return room;
  }

  /** Cria a reunião e, se pedido, publica o aviso. */
  async createMeeting(
    input: NewMeeting,
    announce: boolean,
  ): Promise<{ room: RoomRecord; announced: boolean }> {
    const room = await this.deps.rooms.createMeeting(input);
    let announced = false;
    if (announce) {
      try {
        announced = await this.deps.announcer.publish(room);
      } catch (err) {
        this.deps.logger.error({ err, roomId: room.id }, 'falha ao enviar o aviso da reunião');
      }
    }
    return { room, announced };
  }

  /** Cancela uma reunião que ainda não começou. */
  async cancelMeeting(roomId: string): Promise<RoomRecord | null> {
    const room = await this.deps.rooms.transition(roomId, ['SCHEDULED'], 'CANCELED', {
      endedAt: this.now(),
      endReason: 'CANCELED',
    });
    if (!room) return null;
    await this.safely('atualizar embed', () => this.deps.announcer.refresh(room));
    return room;
  }

  private async safely(what: string, fn: () => unknown): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.deps.logger.error({ err }, `falha ao ${what}`);
    }
  }
}
