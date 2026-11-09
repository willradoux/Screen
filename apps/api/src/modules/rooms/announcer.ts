import {
  buildMeetingNotice,
  buildRoomMessage,
  type MeetingNoticeKind,
} from '../../discord/embeds.js';
import type { DiscordGateway } from '../../discord/gateway.js';
import type { Logger } from '../../shared/logger.js';
import type { Scheduler } from '../../shared/scheduler.js';
import type { MeetingSummary } from '../meetings/report.js';
import type { SettingsRepo } from '../settings/settings.types.js';
import type { RoomRecord, RoomRepo } from './rooms.types.js';

export interface AnnouncerDeps {
  gateway: DiscordGateway;
  rooms: RoomRepo;
  settings: SettingsRepo;
  scheduler: Scheduler;
  logger: Logger;
  guildId: string;
  webUrl: string;
  mentionRoleId?: string | undefined;
  /** Quantas pessoas estão na call da live. */
  countParticipants: (room: RoomRecord) => number;
  /** Intervalo mínimo entre edições do mesmo embed (limite de taxa do Discord). */
  debounceMs?: number;
  /** Números de uma reunião encerrada, para o embed final. */
  summary?: (room: RoomRecord) => Promise<MeetingSummary | null>;
}

/**
 * Mantém a mensagem pública (embed + botão) de cada sala em dia: envia uma vez,
 * depois só edita. Se a mensagem for apagada, reenvia.
 */
export class RoomAnnouncer {
  private readonly pending = new Map<string, unknown>();
  private readonly debounceMs: number;

  constructor(private readonly deps: AnnouncerDeps) {
    this.debounceMs = deps.debounceMs ?? 15_000;
  }

  /**
   * Onde publicar. Live: no chat da própria call (canal de voz). Reunião: canal de avisos.
   * O canal de texto de lives, se existir, é só o plano B quando o bot não consegue escrever na call.
   */
  private async targetChannels(room: RoomRecord): Promise<string[]> {
    const s = await this.deps.settings.get(this.deps.guildId);
    if (room.type === 'LIVE') {
      return [room.voiceChannelId, s.liveTextChannelId].filter((c): c is string => Boolean(c));
    }
    return s.announceChannelId ? [s.announceChannelId] : [];
  }

  private async targetChannel(room: RoomRecord): Promise<string | null> {
    return (await this.targetChannels(room))[0] ?? null;
  }

  /** Cargo marcado nos avisos: o do painel; sem ele, o da variável de ambiente; sem nenhum, ninguém. */
  private async mentionRole(): Promise<string | undefined> {
    const s = await this.deps.settings.get(this.deps.guildId);
    return s.mentionRoleId ?? this.deps.mentionRoleId;
  }

  private async render(room: RoomRecord) {
    const summary =
      room.type === 'MEETING' && room.status === 'ENDED' && this.deps.summary
        ? await this.deps.summary(room).catch(() => null)
        : null;
    return buildRoomMessage(room, {
      webUrl: this.deps.webUrl,
      participants: this.deps.countParticipants(room),
      mentionRoleId: await this.mentionRole(),
      summary,
    });
  }

  /**
   * Mensagem nova e curta no canal de avisos (lembrete, reagendamento, cancelamento).
   * `false` se não há canal de avisos configurado.
   */
  async sendNotice(room: RoomRecord, kind: MeetingNoticeKind): Promise<boolean> {
    const channelId = room.announceChannelId ?? (await this.targetChannel(room));
    if (!channelId) return false;
    await this.deps.gateway.sendMessage(
      channelId,
      buildMeetingNotice(room, kind, {
        webUrl: this.deps.webUrl,
        mentionRoleId: await this.mentionRole(),
      }),
    );
    return true;
  }

  /** Envia uma mensagem nova e grava o ID. `false` se não houver canal configurado. */
  async publish(room: RoomRecord): Promise<boolean> {
    const candidates = await this.targetChannels(room);
    if (candidates.length === 0) {
      this.deps.logger.warn(
        { roomId: room.id, type: room.type },
        'canal de avisos não configurado',
      );
      return false;
    }
    const payload = await this.render(room);
    let lastError: unknown;
    for (const channelId of candidates) {
      try {
        const messageId = await this.deps.gateway.sendMessage(channelId, payload);
        await this.deps.rooms.setAnnouncement(room.id, channelId, messageId);
        room.announceChannelId = channelId;
        room.announceMessageId = messageId;
        return true;
      } catch (err) {
        lastError = err;
        this.deps.logger.warn(
          { err, roomId: room.id, channelId },
          'não consegui enviar o aviso neste canal; tentando o próximo',
        );
      }
    }
    throw lastError;
  }

  /** Publica se ainda não há mensagem; senão atualiza (reenvia se foi apagada). */
  async refresh(room: RoomRecord): Promise<void> {
    if (!room.announceChannelId || !room.announceMessageId) {
      await this.publish(room);
      return;
    }
    const result = await this.deps.gateway.editMessage(
      room.announceChannelId,
      room.announceMessageId,
      await this.render(room),
    );
    if (result === 'not_found') await this.publish(room);
  }

  /** Atualização com limite de taxa: no máximo uma edição por intervalo e por sala. */
  scheduleRefresh(roomId: string): void {
    if (this.pending.has(roomId)) return;
    const handle = this.deps.scheduler.setTimeout(() => {
      this.pending.delete(roomId);
      void this.refreshById(roomId);
    }, this.debounceMs);
    this.pending.set(roomId, handle);
  }

  cancelScheduled(roomId: string): void {
    const handle = this.pending.get(roomId);
    if (handle !== undefined) {
      this.deps.scheduler.clearTimeout(handle);
      this.pending.delete(roomId);
    }
  }

  private async refreshById(roomId: string): Promise<void> {
    try {
      const room = await this.deps.rooms.findById(roomId);
      if (room) await this.refresh(room);
    } catch (err) {
      this.deps.logger.warn({ err, roomId }, 'falha ao atualizar o embed da sala');
    }
  }
}
