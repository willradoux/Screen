import { AppError } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';
import type { DiscordGateway } from '../../discord/gateway.js';
import type { AuditLog } from '../audit/audit.service.js';
import type { RoomAnnouncer } from '../rooms/announcer.js';
import type { ParticipationRepo } from '../rooms/participations.js';
import type { EndReason, RoomService } from '../rooms/rooms.service.js';
import {
  DEFAULT_MEETING_CAPACITY,
  DEFAULT_REMINDERS,
  type RoomRecord,
  type RoomRepo,
} from '../rooms/rooms.types.js';
import type { SettingsRepo } from '../settings/settings.types.js';
import { buildReport, type MeetingReport } from './report.js';

/** Quem fez e por onde: aparece na auditoria. */
export interface MeetingActor {
  id: string;
  via: 'command' | 'api';
  /** Define o motivo registrado ao encerrar. */
  role?: 'MEMBER' | 'MOD' | 'ADMIN';
}

export interface CreateMeetingInput {
  title: string;
  description: string | null;
  /** `null` = abre agora. */
  startsAt: Date | null;
  announce: boolean;
  /** Minutos antes do início. Padrão: 24 h, 1 h e 5 min. */
  reminders?: number[];
  maxParticipants?: number;
  /** Padrão: o que estiver em `/config cargo-reuniao`. */
  allowedRoleIds?: string[];
}

export interface UpdateMeetingInput {
  title?: string;
  description?: string | null;
  startsAt?: Date;
  maxParticipants?: number;
  allowedRoleIds?: string[];
  reminders?: number[];
}

export interface MeetingServiceDeps {
  rooms: RoomRepo;
  roomService: RoomService;
  announcer: RoomAnnouncer;
  settings: SettingsRepo;
  gateway: Pick<DiscordGateway, 'roleExists'>;
  participations: ParticipationRepo;
  audit: AuditLog;
  logger: Logger;
  guildId: string;
  now?: () => Date;
}

/** Antecedência mínima para agendar. */
export const MIN_LEAD_MS = 2 * 60_000;

const e = {
  notFound: () => new AppError('ROOM_NOT_FOUND', 404, 'Não encontrei essa reunião.'),
  pastStart: () =>
    new AppError(
      'STARTS_AT_IN_PAST',
      400,
      'O horário precisa estar pelo menos 2 minutos no futuro.',
    ),
  noChannel: () =>
    new AppError(
      'ANNOUNCE_CHANNEL_NOT_SET',
      409,
      'O canal de avisos ainda não foi configurado. Use `/config canal-avisos` (ou crie sem aviso com `avisar: não`).',
    ),
  notEditable: (message: string) => new AppError('MEETING_NOT_EDITABLE', 409, message),
};

/**
 * Regras das reuniões, compartilhadas pelos comandos do bot e pela API REST.
 * Ver docs/backend/reunioes.md.
 */
export class MeetingService {
  private readonly now: () => Date;

  constructor(private readonly deps: MeetingServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async load(id: string): Promise<RoomRecord> {
    const room = await this.deps.rooms.findById(id);
    if (!room || room.type !== 'MEETING' || room.guildId !== this.deps.guildId) throw e.notFound();
    return room;
  }

  private assertFuture(startsAt: Date) {
    if (startsAt.getTime() < this.now().getTime() + MIN_LEAD_MS) throw e.pastStart();
  }

  private async assertRolesExist(ids: string[]) {
    for (const id of ids) {
      if (!(await this.deps.gateway.roleExists(id))) {
        throw new AppError('INVALID_DISCORD_REFERENCE', 400, 'O cargo não existe neste servidor.', {
          field: 'allowedRoleIds',
          id,
        });
      }
    }
  }

  // ---------- criar ----------

  async create(
    actor: MeetingActor,
    input: CreateMeetingInput,
  ): Promise<{ room: RoomRecord; announced: boolean }> {
    if (input.startsAt) this.assertFuture(input.startsAt);

    const settings = await this.deps.settings.get(this.deps.guildId);
    if (input.announce && !settings.announceChannelId) throw e.noChannel();
    if (input.allowedRoleIds) await this.assertRolesExist(input.allowedRoleIds);

    // Só lembretes que ainda fazem sentido (a reunião começa depois deles).
    let reminders: number[] = [];
    if (input.startsAt) {
      const minutesAway = (input.startsAt.getTime() - this.now().getTime()) / 60_000;
      reminders = (input.reminders ?? DEFAULT_REMINDERS).filter((m) => m < minutesAway);
    }

    const { room, announced } = await this.deps.roomService.createMeeting(
      {
        guildId: this.deps.guildId,
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        createdBy: actor.id,
        maxParticipants: input.maxParticipants ?? DEFAULT_MEETING_CAPACITY,
        allowedRoleIds: input.allowedRoleIds ?? settings.meetingAllowedRoleIds,
        reminders,
        now: this.now(),
      },
      input.announce,
    );

    await this.deps.audit.record({
      actorId: actor.id,
      roomId: room.id,
      action: 'MEETING_CREATED',
      meta: {
        title: room.title,
        startsAt: input.startsAt?.toISOString() ?? null,
        announced,
        via: actor.via,
      },
    });
    return { room, announced };
  }

  // ---------- editar e reagendar ----------

  /**
   * Edita uma reunião que ainda não começou. Mudar o horário reagenda: os lembretes
   * voltam a ser pendentes (só os que ainda fazem sentido), o aviso original é editado
   * e uma nova mensagem avisa o canal.
   */
  async update(actor: MeetingActor, id: string, patch: UpdateMeetingInput): Promise<RoomRecord> {
    const before = await this.load(id);
    if (before.status !== 'SCHEDULED') {
      throw e.notEditable(
        before.status === 'OPEN'
          ? 'Essa reunião já começou e não pode mais ser editada.'
          : `Só reuniões agendadas podem ser editadas (estado: ${before.status}).`,
      );
    }
    if (patch.startsAt) this.assertFuture(patch.startsAt);
    if (patch.allowedRoleIds) await this.assertRolesExist(patch.allowedRoleIds);

    const { startsAt, reminders, ...details } = patch;
    let room: RoomRecord | null = before;
    if (Object.keys(details).length > 0) room = await this.deps.rooms.update(id, details);
    if (room && (startsAt || reminders)) {
      room = await this.deps.rooms.updateSchedule(id, {
        ...(startsAt ? { startsAt } : {}),
        ...(reminders ? { reminders } : {}),
        now: this.now(),
      });
    }
    // Perdeu a corrida: outra pessoa abriu ou cancelou no meio.
    if (!room) throw e.notEditable('Essa reunião não pode mais ser editada.');

    const rescheduled = startsAt !== undefined && startsAt.getTime() !== before.startsAt?.getTime();
    await this.safely('atualizar o aviso', () => this.deps.announcer.refresh(room));
    if (rescheduled) {
      await this.safely('avisar o reagendamento', () =>
        this.deps.announcer.sendNotice(room, 'rescheduled'),
      );
    }

    const changes: Record<string, unknown> = {};
    if (details.title !== undefined) changes.title = room.title;
    if (details.description !== undefined) changes.description = room.description;
    if (details.maxParticipants !== undefined) changes.maxParticipants = room.maxParticipants;
    if (details.allowedRoleIds !== undefined) changes.allowedRoleIds = room.allowedRoleIds;
    if (startsAt)
      changes.startsAt = { from: before.startsAt?.toISOString(), to: startsAt.toISOString() };
    if (reminders) changes.reminders = room.reminders.map((r) => r.minutesBefore);
    await this.deps.audit.record({
      actorId: actor.id,
      roomId: id,
      action: 'MEETING_UPDATED',
      meta: { changes, via: actor.via },
    });
    return room;
  }

  // ---------- abrir antes da hora, cancelar e encerrar ----------

  /** Abre uma reunião agendada antes do horário. */
  async open(actor: MeetingActor, id: string): Promise<RoomRecord> {
    const room = await this.load(id);
    if (room.status !== 'SCHEDULED') {
      throw e.notEditable(`Só reuniões agendadas podem ser abertas (estado: ${room.status}).`);
    }
    const opened = await this.deps.rooms.transition(id, ['SCHEDULED'], 'OPEN', {
      openedAt: this.now(),
    });
    if (!opened) throw e.notEditable('Essa reunião não pode mais ser aberta.');
    await this.safely('atualizar o aviso', () => this.deps.announcer.refresh(opened));
    await this.deps.audit.record({
      actorId: actor.id,
      roomId: id,
      action: 'MEETING_OPENED',
      meta: { via: actor.via },
    });
    return opened;
  }

  async cancel(actor: MeetingActor, id: string): Promise<RoomRecord> {
    const room = await this.load(id);
    if (room.status === 'OPEN') {
      throw e.notEditable('Essa reunião já está aberta. Use `/reuniao encerrar`.');
    }
    const canceled = await this.deps.roomService.cancelMeeting(id);
    if (!canceled) {
      throw e.notEditable(`Essa reunião não pode ser cancelada (estado: ${room.status}).`);
    }
    await this.safely('avisar o cancelamento', () =>
      this.deps.announcer.sendNotice(canceled, 'canceled'),
    );
    await this.deps.audit.record({
      actorId: actor.id,
      roomId: id,
      action: 'MEETING_CANCELED',
      meta: { via: actor.via },
    });
    return canceled;
  }

  async end(actor: MeetingActor, id: string): Promise<RoomRecord> {
    const room = await this.load(id);
    if (room.status !== 'OPEN') {
      throw new AppError(
        'ROOM_NOT_OPEN',
        409,
        `Essa reunião não está aberta (estado: ${room.status}).`,
      );
    }
    const reason: EndReason = actor.role === 'ADMIN' ? 'ENDED_BY_ADMIN' : 'ENDED_BY_MOD';
    const ended = await this.deps.roomService.endRoom(id, reason);
    if (!ended) throw new AppError('ROOM_ALREADY_ENDED', 409, 'Essa reunião já foi encerrada.');
    await this.deps.audit.record({
      actorId: actor.id,
      roomId: id,
      action: 'ROOM_ENDED',
      meta: { via: actor.via },
    });
    return ended;
  }

  // ---------- consulta ----------

  async get(id: string): Promise<RoomRecord> {
    return this.load(id);
  }

  /** Das mais próximas para as mais distantes. `from`/`to` filtram pelo horário de início. */
  async list(input: {
    statuses: RoomRecord['status'][];
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<RoomRecord[]> {
    const all = await this.deps.rooms.listMeetings(this.deps.guildId, input.statuses);
    return all
      .filter((m) => {
        const at = (m.startsAt ?? m.openedAt ?? m.createdAt).getTime();
        return (
          (!input.from || at >= input.from.getTime()) && (!input.to || at <= input.to.getTime())
        );
      })
      .slice(0, input.limit);
  }

  /** Lista de presença. Só depois que a reunião terminou. */
  async report(id: string): Promise<{ room: RoomRecord; report: MeetingReport }> {
    const room = await this.load(id);
    if (room.status !== 'ENDED') {
      throw new AppError(
        'REPORT_NOT_AVAILABLE',
        409,
        'O relatório só fica disponível depois que a reunião termina.',
      );
    }
    const sessions = await this.deps.participations.listAll(room.id);
    return { room, report: buildReport(room, sessions, this.now()) };
  }

  private async safely(what: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      this.deps.logger.warn({ err }, `falha ao ${what}`);
    }
  }
}
