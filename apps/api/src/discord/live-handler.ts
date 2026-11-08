import type { Logger } from '../shared/logger.js';
import { KeyedQueue, type Scheduler } from '../shared/scheduler.js';
import type { RoomAnnouncer } from '../modules/rooms/announcer.js';
import type { RoomService } from '../modules/rooms/rooms.service.js';
import type { RoomRepo } from '../modules/rooms/rooms.types.js';
import type { SettingsRepo } from '../modules/settings/settings.types.js';
import type { DiscordGateway } from './gateway.js';
import type { VoiceCache } from './voice-cache.js';

export interface LiveHandlerDeps {
  gateway: DiscordGateway;
  settings: SettingsRepo;
  rooms: RoomRepo;
  roomService: RoomService;
  announcer: RoomAnnouncer;
  cache: VoiceCache;
  scheduler: Scheduler;
  logger: Logger;
  guildId: string;
  /** Tempo com o canal vazio antes de encerrar a live. */
  emptyEndSeconds: number;
}

export interface VoiceChange {
  userId: string;
  oldChannelId: string | null;
  newChannelId: string | null;
}

/**
 * Transforma entradas e saídas nos canais de voz da categoria de lives em salas
 * e embeds. Ver docs/backend/bot-discord.md.
 */
export class LiveVoiceHandler {
  private readonly queue = new KeyedQueue();
  private readonly emptyTimers = new Map<string, unknown>();

  constructor(private readonly deps: LiveHandlerDeps) {}

  /** Um evento de `voiceStateUpdate` (já sem bots). */
  async handle(change: VoiceChange): Promise<void> {
    const { userId, oldChannelId, newChannelId } = change;
    this.deps.cache.set(userId, newChannelId);
    if (oldChannelId === newChannelId) return;

    if (newChannelId) {
      await this.queue.run(newChannelId, () => this.onJoin(newChannelId, userId));
    }
    if (oldChannelId) {
      await this.queue.run(oldChannelId, () => this.onLeave(oldChannelId));
    }
  }

  /** Canal de voz dentro da categoria de lives configurada? Devolve o nome. */
  private async liveChannelName(channelId: string): Promise<string | null> {
    const settings = await this.deps.settings.get(this.deps.guildId);
    if (!settings.liveCategoryId) return null;
    const channel = await this.deps.gateway.getChannel(channelId);
    if (!channel || channel.kind !== 'voice') return null;
    return channel.parentId === settings.liveCategoryId ? channel.name : null;
  }

  private async onJoin(channelId: string, userId: string): Promise<void> {
    const name = await this.liveChannelName(channelId);
    if (!name) return;

    this.cancelEmptyTimer(channelId);
    const settings = await this.deps.settings.get(this.deps.guildId);
    const { room, created } = await this.deps.roomService.ensureLive({
      guildId: this.deps.guildId,
      channelId,
      title: `Live - ${name}`,
      maxParticipants: settings.maxParticipantsLive,
      openedBy: userId,
    });

    if (created || !room.announceMessageId) {
      // Sala nova (ou antiga sem mensagem, p.ex. canal de lives configurado depois).
      await this.publishSafely(room);
    } else {
      this.deps.announcer.scheduleRefresh(room.id);
    }
  }

  private async onLeave(channelId: string): Promise<void> {
    const name = await this.liveChannelName(channelId);
    if (!name) return;
    const room = await this.deps.rooms.findOpenLiveByChannel(channelId);
    if (!room) return;

    if (this.deps.cache.count(channelId) === 0) {
      this.startEmptyTimer(channelId, room.id);
    } else {
      this.deps.announcer.scheduleRefresh(room.id);
    }
  }

  private startEmptyTimer(channelId: string, roomId: string): void {
    this.cancelEmptyTimer(channelId);
    const handle = this.deps.scheduler.setTimeout(() => {
      this.emptyTimers.delete(channelId);
      void this.queue
        .run(channelId, async () => {
          // Confere de novo: alguém pode ter voltado no último instante.
          if (this.deps.cache.count(channelId) > 0) return;
          await this.deps.roomService.endRoom(roomId, 'VOICE_EMPTY');
        })
        .catch((err) => this.deps.logger.error({ err, roomId }, 'falha ao encerrar live vazia'));
    }, this.deps.emptyEndSeconds * 1000);
    this.emptyTimers.set(channelId, handle);
  }

  private cancelEmptyTimer(channelId: string): void {
    const handle = this.emptyTimers.get(channelId);
    if (handle !== undefined) {
      this.deps.scheduler.clearTimeout(handle);
      this.emptyTimers.delete(channelId);
    }
  }

  private async publishSafely(room: Parameters<RoomAnnouncer['publish']>[0]): Promise<void> {
    try {
      await this.deps.announcer.publish(room);
    } catch (err) {
      this.deps.logger.error({ err, roomId: room.id }, 'falha ao enviar o embed da live');
    }
  }

  /**
   * Chamado ao iniciar: reconstrói o cache de voz e concilia as salas com a
   * realidade (o bot pode ter ficado fora do ar). Não duplica embeds.
   */
  async reconcile(): Promise<void> {
    this.deps.cache.replaceAll(await this.deps.gateway.listVoiceStates());
    const settings = await this.deps.settings.get(this.deps.guildId);
    const open = await this.deps.rooms.listOpenLive(this.deps.guildId);

    for (const room of open) {
      const channelId = room.voiceChannelId;
      if (!channelId) continue;
      if (this.deps.cache.count(channelId) === 0) {
        await this.deps.roomService.endRoom(room.id, 'VOICE_EMPTY');
      } else {
        await this.deps.announcer.refresh(room).catch((err) => {
          this.deps.logger.warn(
            { err, roomId: room.id },
            'falha ao atualizar embed na reconciliação',
          );
        });
      }
    }

    if (!settings.liveCategoryId) return;
    const openChannels = new Set(open.map((r) => r.voiceChannelId));
    for (const channelId of this.deps.cache.occupiedChannels()) {
      if (openChannels.has(channelId)) continue;
      const [first] = this.deps.cache.membersIn(channelId);
      if (first) await this.queue.run(channelId, () => this.onJoin(channelId, first));
    }
  }
}
