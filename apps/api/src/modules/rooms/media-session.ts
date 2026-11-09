import type { RealtimeEmitter } from '../../realtime/emitter.js';
import type { Logger } from '../../shared/logger.js';
import type { Scheduler } from '../../shared/scheduler.js';
import type { AuditLog } from '../audit/audit.service.js';
import type { LiveKitGateway } from '../livekit/livekit.gateway.js';
import type { SettingsRepo } from '../settings/settings.types.js';
import type { ParticipationRepo } from './participations.js';
import type { RoomRecord, RoomRepo } from './rooms.types.js';

export interface MediaSessionDeps {
  rooms: RoomRepo;
  participations: ParticipationRepo;
  livekit: LiveKitGateway;
  realtime: RealtimeEmitter;
  settings: SettingsRepo;
  audit: AuditLog;
  scheduler: Scheduler;
  logger: Logger;
  guildId: string;
  /** De quanto em quanto tempo olhar o LiveKit (ms). */
  pollMs?: number;
  /** Quanto tempo uma sala sem ninguém conectado espera antes de entrar em espera (ms). */
  emptyGraceMs?: number;
  now?: () => Date;
}

interface Tracking {
  activatedAt: number;
  /** Última vez que alguém estava transmitindo câmera ou tela. */
  lastPublisherAt: number | null;
  /** Última vez que havia alguém conectado ao LiveKit. */
  lastConnectedAt: number;
}

const VIDEO_SOURCES = new Set(['camera', 'screen_share']);

/**
 * Sessão de mídia das lives. A live (a sala, o link no chat da call) existe enquanto há gente
 * na call do Discord; já o vídeo só fica "no ar" enquanto alguém usa:
 *  - sem ninguém conectado ao site, ou
 *  - sem ninguém transmitindo câmera/tela por `idleSessionMinutes`,
 * a sessão entra em ESPERA: derruba o LiveKit e avisa quem estiver na página. Quem entra pelo link
 * depois "ativa" de novo, e tem `activationGraceMinutes` para alguém começar a transmitir.
 */
export class MediaSessionService {
  private readonly tracking = new Map<string, Tracking>();
  private readonly now: () => Date;
  private timer: unknown;
  private running = false;
  private onChange: (room: RoomRecord) => void = () => undefined;

  constructor(private readonly deps: MediaSessionDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Quem precisa atualizar o embed quando o estado muda (o anunciador, ligado depois). */
  setOnChange(fn: (room: RoomRecord) => void): void {
    this.onChange = fn;
  }

  // ---------- ativação (chamada no join) ----------

  /** Garante a sessão ativa. Devolve `true` se estava em espera e foi ativada agora. */
  async ensureActive(room: RoomRecord): Promise<boolean> {
    if (room.type !== 'LIVE') return false;
    const at = this.now();
    const updated = await this.deps.rooms.setMediaState(room.id, 'IDLE', 'ACTIVE', at);
    if (!updated) {
      if (room.mediaState === 'ACTIVE' && !this.tracking.has(room.id)) this.begin(room.id);
      return false; // já estava ativa (ou a sala não está aberta)
    }
    this.begin(room.id);
    room.mediaState = 'ACTIVE';
    this.deps.realtime.toRoom(room.id, 'room:updated', {
      roomId: room.id,
      changes: { mediaState: 'ACTIVE' },
    });
    this.onChange(updated);
    await this.deps.audit.record({
      actorId: 'system',
      roomId: room.id,
      action: 'SESSION_ACTIVATED',
      meta: { via: 'join' },
    });
    return true;
  }

  private begin(roomId: string): void {
    const t = this.now().getTime();
    this.tracking.set(roomId, { activatedAt: t, lastPublisherAt: null, lastConnectedAt: t });
  }

  // ---------- relógio ----------

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.reconcile().finally(() => this.schedule());
  }

  stop(): void {
    this.running = false;
    if (this.timer !== undefined) this.deps.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = this.deps.scheduler.setTimeout(() => {
      void this.tick()
        .catch((err) => this.deps.logger.error({ err }, 'falha ao conferir as sessões de mídia'))
        .finally(() => this.schedule());
    }, this.deps.pollMs ?? 30_000);
  }

  /** Ao iniciar: retoma o acompanhamento das lives que estavam ativas (começa um prazo novo). */
  async reconcile(): Promise<void> {
    const open = await this.deps.rooms.listOpenLive(this.deps.guildId);
    for (const room of open) {
      if (room.mediaState === 'ACTIVE' && !this.tracking.has(room.id)) this.begin(room.id);
    }
  }

  /** Uma passada: olha o LiveKit de cada live ativa e coloca em espera as ociosas. */
  async tick(): Promise<{ idled: number }> {
    const settings = await this.deps.settings.get(this.deps.guildId);
    const idleMs = settings.idleSessionMinutes * 60_000;
    const graceMs = settings.activationGraceMinutes * 60_000;
    const emptyMs = this.deps.emptyGraceMs ?? 60_000;
    const open = await this.deps.rooms.listOpenLive(this.deps.guildId);
    const now = this.now().getTime();
    let idled = 0;

    for (const room of open) {
      if (room.mediaState !== 'ACTIVE') {
        this.tracking.delete(room.id);
        continue;
      }
      let t = this.tracking.get(room.id);
      if (!t) {
        this.begin(room.id);
        t = this.tracking.get(room.id)!;
      }

      let people;
      try {
        people = await this.deps.livekit.listParticipants(room.id);
      } catch (err) {
        this.deps.logger.warn(
          { err, roomId: room.id },
          'LiveKit indisponível ao conferir a sessão',
        );
        continue; // sem informação confiável, não derruba ninguém
      }

      if (people.length > 0) t.lastConnectedAt = now;
      const publishing = people.some((p) =>
        p.tracks.some((tr) => VIDEO_SOURCES.has(tr.source) && !tr.muted),
      );
      if (publishing) t.lastPublisherAt = now;

      // Prazo: antes de alguém transmitir vale a tolerância da ativação; depois, a ociosidade.
      const publisherDeadline =
        t.lastPublisherAt !== null ? t.lastPublisherAt + idleMs : t.activatedAt + graceMs;
      const emptyDeadline = t.lastConnectedAt + emptyMs;
      const deadline =
        people.length === 0 ? Math.min(publisherDeadline, emptyDeadline) : publisherDeadline;

      if (!publishing && now >= deadline) {
        if (
          await this.goIdle(room, people.length === 0 ? 'NOBODY_CONNECTED' : 'NOBODY_STREAMING')
        ) {
          idled += 1;
        }
      }
    }
    return { idled };
  }

  /** Coloca em espera: derruba o vídeo, fecha as participações e avisa. Idempotente. */
  async goIdle(
    room: RoomRecord,
    reason: 'NOBODY_CONNECTED' | 'NOBODY_STREAMING',
  ): Promise<boolean> {
    const updated = await this.deps.rooms.setMediaState(room.id, 'ACTIVE', 'IDLE', this.now());
    if (!updated) return false;
    this.tracking.delete(room.id);

    const people = await this.deps.participations.listOpen(room.id);
    // Primeiro avisa (o cliente mostra "sessão em espera" em vez de erro); depois derruba.
    this.deps.realtime.toRoom(room.id, 'session:idle', { roomId: room.id, reason });
    this.deps.realtime.toRoom(room.id, 'room:updated', {
      roomId: room.id,
      changes: { mediaState: 'IDLE' },
    });
    await this.deps.participations.closeAll(room.id, 'SESSION_IDLE', this.now());
    for (const p of people) {
      this.deps.realtime.toRoom(room.id, 'participant:left', {
        roomId: room.id,
        userId: p.userId,
        reason: 'SESSION_IDLE',
      });
    }
    try {
      await this.deps.livekit.deleteRoom(room.id);
    } catch (err) {
      this.deps.logger.warn({ err, roomId: room.id }, 'não consegui derrubar a sala no LiveKit');
    }
    this.onChange(updated);
    await this.deps.audit.record({
      actorId: 'system',
      roomId: room.id,
      action: 'SESSION_IDLE',
      meta: { reason, disconnected: people.length },
    });
    return true;
  }

  /** Sala encerrada: para de acompanhar. */
  forget(roomId: string): void {
    this.tracking.delete(roomId);
  }
}
