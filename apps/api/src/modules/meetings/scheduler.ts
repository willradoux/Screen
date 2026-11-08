import { metrics } from '../../observability/metrics.js';
import type { Logger } from '../../shared/logger.js';
import type { Scheduler } from '../../shared/scheduler.js';
import type { AuditLog } from '../audit/audit.service.js';
import type { RoomAnnouncer } from '../rooms/announcer.js';
import type { ParticipationRepo } from '../rooms/participations.js';
import type { RoomService } from '../rooms/rooms.service.js';
import type { RoomRecord, RoomRepo } from '../rooms/rooms.types.js';

export interface MeetingSchedulerDeps {
  rooms: RoomRepo;
  roomService: RoomService;
  announcer: RoomAnnouncer;
  participations: ParticipationRepo;
  audit: AuditLog;
  scheduler: Scheduler;
  logger: Logger;
  guildId: string;
  /** De quanto em quanto tempo verifica. */
  intervalMs: number;
  /** Reunião aberta e vazia por tanto tempo é encerrada. */
  emptyEndMinutes: number;
  now?: () => Date;
}

/** Lembrete que ficou para trás por mais que isso (servidor fora do ar) é descartado. */
export const STALE_REMINDER_MS = 10 * 60_000;

export interface TickResult {
  opened: number;
  reminded: number;
  ended: number;
}

/**
 * O relógio das reuniões. Tudo vem do MongoDB, então reiniciar o servidor não
 * perde nada, e cada passo é idempotente (pode rodar duas vezes sem repetir).
 * Ver docs/backend/reunioes.md.
 */
export class MeetingScheduler {
  private timer: unknown;
  private running = false;
  private stopped = true;
  private readonly now: () => Date;

  constructor(private readonly deps: MeetingSchedulerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Verifica já e a cada `intervalMs`. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.deps.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async loop(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.tick();
    } catch (err) {
      this.deps.logger.error({ err }, 'falha no agendador de reuniões');
    }
    if (this.stopped) return;
    this.timer = this.deps.scheduler.setTimeout(() => void this.loop(), this.deps.intervalMs);
  }

  /** Uma rodada. Nunca roda duas ao mesmo tempo. */
  async tick(): Promise<TickResult> {
    const result: TickResult = { opened: 0, reminded: 0, ended: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const scheduled = await this.deps.rooms.listMeetings(this.deps.guildId, ['SCHEDULED']);
      for (const room of scheduled) {
        await this.guard(room, async () => {
          result.reminded += await this.sendReminders(room);
          if (room.startsAt && room.startsAt.getTime() <= this.now().getTime()) {
            if (await this.open(room)) result.opened++;
          }
        });
      }

      const open = await this.deps.rooms.listMeetings(this.deps.guildId, ['OPEN']);
      for (const room of open) {
        await this.guard(room, async () => {
          if (await this.endIfAbandoned(room)) result.ended++;
        });
      }
    } finally {
      this.running = false;
    }
    metrics.schedulerActions.inc({ kind: 'opened' }, result.opened);
    metrics.schedulerActions.inc({ kind: 'reminded' }, result.reminded);
    metrics.schedulerActions.inc({ kind: 'ended' }, result.ended);
    return result;
  }

  /** Um erro numa reunião não pode impedir as outras. */
  private async guard(room: RoomRecord, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      this.deps.logger.error({ err, roomId: room.id }, 'falha ao processar reunião');
    }
  }

  // ---------- abertura ----------

  private async open(room: RoomRecord): Promise<boolean> {
    // Condicional: se alguém abriu ou cancelou no meio, não faz nada.
    const opened = await this.deps.rooms.transition(room.id, ['SCHEDULED'], 'OPEN', {
      openedAt: this.now(),
    });
    if (!opened) return false;

    try {
      await this.deps.announcer.refresh(opened); // "🟢 Reunião aberta agora"
    } catch (err) {
      this.deps.logger.warn({ err, roomId: room.id }, 'não consegui atualizar o aviso ao abrir');
    }
    await this.deps.audit.record({
      actorId: 'system',
      roomId: room.id,
      action: 'MEETING_OPENED',
      meta: { via: 'scheduler' },
    });
    return true;
  }

  // ---------- lembretes ----------

  private async sendReminders(room: RoomRecord): Promise<number> {
    if (!room.startsAt) return 0;
    const now = this.now().getTime();
    let sent = 0;

    // Do mais distante para o mais próximo.
    const pending = room.reminders
      .filter((r) => r.sentAt === null)
      .sort((a, b) => b.minutesBefore - a.minutesBefore);

    for (const reminder of pending) {
      const dueAt = room.startsAt.getTime() - reminder.minutesBefore * 60_000;
      if (now < dueAt) continue;

      // Reserva o envio (só uma rodada consegue). Se falhar, devolve para tentar de novo.
      const claimed = await this.deps.rooms.claimReminder(
        room.id,
        reminder.minutesBefore,
        this.now(),
      );
      if (!claimed) continue;

      const stale = now - dueAt > STALE_REMINDER_MS;
      const alreadyStarted = room.startsAt.getTime() <= now;
      if (stale || alreadyStarted) {
        this.deps.logger.info(
          { roomId: room.id, minutesBefore: reminder.minutesBefore },
          'lembrete atrasado descartado',
        );
        continue;
      }

      try {
        const ok = await this.deps.announcer.sendNotice(room, 'reminder');
        if (ok) sent++;
        else {
          this.deps.logger.warn({ roomId: room.id }, 'lembrete sem canal de avisos configurado');
        }
      } catch (err) {
        this.deps.logger.warn(
          { err, roomId: room.id },
          'falha ao enviar lembrete; tentará de novo',
        );
        await this.deps.rooms.releaseReminder(room.id, reminder.minutesBefore);
      }
    }
    return sent;
  }

  // ---------- encerramento por abandono ----------

  /** Aberta, sem ninguém e sem atividade há `emptyEndMinutes`: encerra. */
  private async endIfAbandoned(room: RoomRecord): Promise<boolean> {
    if ((await this.deps.participations.countOpen(room.id)) > 0) return false;

    const lastActivity = Math.max(
      (room.openedAt ?? room.createdAt).getTime(),
      (await this.deps.participations.lastActivityAt(room.id))?.getTime() ?? 0,
    );
    if (this.now().getTime() - lastActivity < this.deps.emptyEndMinutes * 60_000) return false;

    const ended = await this.deps.roomService.endRoom(room.id, 'MEETING_FINISHED');
    if (!ended) return false;
    await this.deps.audit.record({
      actorId: 'system',
      roomId: room.id,
      action: 'ROOM_ENDED',
      meta: { via: 'scheduler', reason: 'MEETING_FINISHED' },
    });
    return true;
  }
}
