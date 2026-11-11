import { ROLE_RANK, type Role } from '@screem/shared';
import type { RealtimeEmitter } from '../../realtime/emitter.js';
import { AppError } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';
import type { AuditLog } from '../audit/audit.service.js';
import {
  ALL_SOURCES,
  LiveKitUnavailableError,
  type LiveKitGateway,
  type MediaSource,
} from '../livekit/livekit.gateway.js';
import { computePermissions, type RoomPermissions } from '../rooms/access.js';
import type { BanRepo, Participation, ParticipationRepo } from '../rooms/participations.js';
import type { PresenceService } from '../rooms/presence.js';
import type { RoomPatch, RoomRecord, RoomRepo } from '../rooms/rooms.types.js';
import { assertCan, type Capability } from '../permissions/capabilities.js';
import type { RoleResolver } from '../permissions/role-resolver.js';

export interface Actor {
  id: string;
  role: Role;
}

export interface ModerationDeps {
  rooms: RoomRepo;
  participations: ParticipationRepo;
  bans: BanRepo;
  livekit: LiveKitGateway;
  presence: PresenceService;
  realtime: RealtimeEmitter;
  audit: AuditLog;
  roles: Pick<RoleResolver, 'resolveUser'>;
  /** Chamado quando título/descrição da sala mudam (para atualizar o embed). */
  onRoomChanged?: (room: RoomRecord) => Promise<void>;
  /** Fila de "pedir a palavra": quem recebe a palavra sai dela. */
  hands?: { lower(roomId: string, userId: string): void };
  logger: Logger;
  now?: () => Date;
}

export const DEFAULT_BAN_MINUTES = 60;
export const MAX_BAN_MINUTES = 1440;

const err = {
  notOpen: () => new AppError('ROOM_NOT_OPEN', 409, 'Esta sala não está aberta.'),
  meetingOnly: () =>
    new AppError(
      'MODERATION_ONLY_IN_MEETINGS',
      409,
      'Moderação só existe em reuniões. Nas lives (calls) cada pessoa controla a própria transmissão; use as ferramentas do Discord para moderar a call.',
    ),
  notFound: () => new AppError('ROOM_NOT_FOUND', 404, 'Sala não encontrada.'),
  notInRoom: () =>
    new AppError('PARTICIPANT_NOT_IN_ROOM', 404, 'Essa pessoa não está conectada à sala.'),
  self: () => new AppError('CANNOT_TARGET_SELF', 400, 'Você não pode fazer isso consigo mesmo.'),
  hierarchy: () =>
    new AppError(
      'HIERARCHY_VIOLATION',
      403,
      'Você não pode moderar alguém com papel igual ou superior ao seu.',
    ),
  livekit: () => new AppError('LIVEKIT_UNAVAILABLE', 502, 'O servidor de vídeo está indisponível.'),
};

/** "Compartilhar tela" e o áudio da tela andam juntos. */
function normalizeSources(sources: MediaSource[]): MediaSource[] {
  const set = new Set(sources);
  if (set.has('screen_share')) set.add('screen_share_audio');
  return ALL_SOURCES.filter((s) => set.has(s));
}

const union = (a: MediaSource[], b: MediaSource[]) =>
  ALL_SOURCES.filter((s) => a.includes(s) || b.includes(s));

/**
 * Moderação dentro da sala: mutar, expulsar, banir, palestrante e modo palestra.
 * Regras (docs/backend/permissoes.md): papel mínimo por ação, ninguém age sobre
 * papel igual ou superior, ninguém age sobre si, e tudo gera auditoria.
 */
export class ModerationService {
  private readonly now: () => Date;

  constructor(private readonly deps: ModerationDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  // ---------- ajudantes ----------

  private async loadRoom(roomId: string): Promise<RoomRecord> {
    const room = await this.deps.rooms.findById(roomId);
    if (!room) throw err.notFound();
    return room;
  }

  private async openRoom(roomId: string): Promise<RoomRecord> {
    const room = await this.loadRoom(roomId);
    // Moderar (silenciar, expulsar, banir, palestrante) é coisa de reunião, não de live.
    if (room.type !== 'MEETING') throw err.meetingOnly();
    if (room.status !== 'OPEN') throw err.notOpen();
    return room;
  }

  /** Alvo conectado e hierarquicamente abaixo de quem age. */
  private async moderatable(
    room: RoomRecord,
    actor: Actor,
    targetId: string,
  ): Promise<{ participation: Participation; role: Role }> {
    if (targetId === actor.id) throw err.self();
    const participation = await this.deps.participations.findOpen(room.id, targetId);
    if (!participation) throw err.notInRoom();

    // O papel pode ter mudado depois que a pessoa entrou: vale o mais alto dos dois.
    const fresh = await this.deps.roles.resolveUser(targetId).catch(() => participation.roleAtJoin);
    const role =
      ROLE_RANK[fresh] > ROLE_RANK[participation.roleAtJoin] ? fresh : participation.roleAtJoin;
    if (ROLE_RANK[actor.role] <= ROLE_RANK[role]) throw err.hierarchy();
    return { participation, role };
  }

  private async inRoom(room: RoomRecord, targetId: string): Promise<Participation> {
    const participation = await this.deps.participations.findOpen(room.id, targetId);
    if (!participation) throw err.notInRoom();
    return participation;
  }

  private async liveKit<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof LiveKitUnavailableError) throw err.livekit();
      throw e;
    }
  }

  private applyPermissions(room: RoomRecord, userId: string, p: RoomPermissions) {
    return this.liveKit(() =>
      this.deps.livekit.setPermissions(room.id, userId, {
        canPublish: p.canPublish,
        canPublishSources: p.canPublishSources,
      }),
    );
  }

  private async audit(entry: Parameters<AuditLog['record']>[0]) {
    await this.deps.audit.record(entry);
  }

  private updated(room: RoomRecord, userId: string, speaker: boolean, muted: MediaSource[]) {
    this.deps.realtime.toRoom(room.id, 'participant:updated', {
      roomId: room.id,
      userId,
      isSpeaker: speaker,
      mutedByModeration: muted.length > 0,
      mutedSources: muted,
    });
  }

  private act(cap: Capability, actor: Actor) {
    assertCan(actor.role, cap);
  }

  // ---------- mutar ----------

  async mute(
    actor: Actor,
    roomId: string,
    targetId: string,
    input: { sources?: MediaSource[] | undefined; reason?: string | null | undefined },
  ): Promise<void> {
    this.act('moderation.mute', actor);
    const room = await this.openRoom(roomId);
    const { role } = await this.moderatable(room, actor, targetId);

    const requested = normalizeSources(input.sources ?? ALL_SOURCES);
    const muted = union(
      await this.deps.participations.getMutedSources(room.id, targetId),
      requested,
    );
    await this.deps.participations.setMutedSources(room.id, targetId, muted);

    // Revoga a permissão (o LiveKit para de aceitar essas fontes) e silencia o que já estava no ar.
    const perms = computePermissions({
      role,
      userId: targetId,
      mutedSources: muted,
      lectureMode: room.lectureMode,
      speakerIds: room.speakerIds,
      screenLock: room.screenLock,
    });
    await this.applyPermissions(room, targetId, perms);
    await this.liveKit(() => this.deps.livekit.muteSources(room.id, targetId, requested));

    this.deps.realtime.toUser(targetId, 'moderation:action', {
      roomId: room.id,
      action: 'MUTED',
      by: actor.id,
      reason: input.reason ?? null,
      sources: requested,
    });
    this.updated(room, targetId, room.speakerIds.includes(targetId), muted);
    await this.audit({
      actorId: actor.id,
      targetId,
      roomId: room.id,
      action: 'PARTICIPANT_MUTED',
      reason: input.reason ?? null,
      meta: { sources: requested },
    });
  }

  async unmute(
    actor: Actor,
    roomId: string,
    targetId: string,
    input: { reason?: string | null | undefined },
  ): Promise<void> {
    this.act('moderation.mute', actor);
    const room = await this.openRoom(roomId);
    const { role } = await this.moderatable(room, actor, targetId);

    await this.deps.participations.setMutedSources(room.id, targetId, []);
    // Devolve a permissão respeitando o modo palestra.
    const perms = computePermissions({
      role,
      userId: targetId,
      mutedSources: [],
      lectureMode: room.lectureMode,
      speakerIds: room.speakerIds,
      screenLock: room.screenLock,
    });
    await this.applyPermissions(room, targetId, perms);

    this.deps.realtime.toUser(targetId, 'moderation:action', {
      roomId: room.id,
      action: 'UNMUTED',
      by: actor.id,
      reason: input.reason ?? null,
    });
    this.updated(room, targetId, room.speakerIds.includes(targetId), []);
    await this.audit({
      actorId: actor.id,
      targetId,
      roomId: room.id,
      action: 'PARTICIPANT_UNMUTED',
      reason: input.reason ?? null,
    });
  }

  // ---------- expulsar e banir ----------

  async kick(
    actor: Actor,
    roomId: string,
    targetId: string,
    input: { reason?: string | null | undefined },
  ): Promise<void> {
    this.act('moderation.kick', actor);
    const room = await this.openRoom(roomId);
    await this.moderatable(room, actor, targetId);

    await this.deps.presence.removeFromRoom(room.id, targetId, 'KICKED');
    this.deps.realtime.toUser(targetId, 'moderation:action', {
      roomId: room.id,
      action: 'KICKED',
      by: actor.id,
      reason: input.reason ?? null,
    });
    await this.audit({
      actorId: actor.id,
      targetId,
      roomId: room.id,
      action: 'PARTICIPANT_KICKED',
      reason: input.reason ?? null,
    });
  }

  /** `durationMinutes = 0` (só ADMIN) vale até o fim da sala. */
  async ban(
    actor: Actor,
    roomId: string,
    targetId: string,
    input: { durationMinutes?: number | undefined; reason?: string | null | undefined },
  ): Promise<void> {
    this.act('moderation.ban', actor);
    const minutes = input.durationMinutes ?? DEFAULT_BAN_MINUTES;
    if (minutes === 0 && actor.role !== 'ADMIN') {
      throw new AppError('FORBIDDEN', 403, 'Só administradores podem banir até o fim da sala.');
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_BAN_MINUTES) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        `A duração deve ser de 0 a ${MAX_BAN_MINUTES} minutos.`,
      );
    }

    const room = await this.openRoom(roomId);
    await this.moderatable(room, actor, targetId);

    const expiresAt = minutes === 0 ? null : new Date(this.now().getTime() + minutes * 60_000);
    // Grava o banimento ANTES de remover: se a pessoa tentar voltar na hora, já está barrada.
    await this.deps.bans.upsert({
      roomId: room.id,
      userId: targetId,
      bannedBy: actor.id,
      reason: input.reason ?? null,
      expiresAt,
    });
    await this.deps.presence.removeFromRoom(room.id, targetId, 'BANNED');

    this.deps.realtime.toUser(targetId, 'moderation:action', {
      roomId: room.id,
      action: 'BANNED',
      by: actor.id,
      reason: input.reason ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
    await this.audit({
      actorId: actor.id,
      targetId,
      roomId: room.id,
      action: 'PARTICIPANT_BANNED',
      reason: input.reason ?? null,
      meta: { durationMinutes: minutes, expiresAt: expiresAt?.toISOString() ?? null },
    });
  }

  /** Idempotente: remover um banimento que não existe não é erro. */
  async unban(actor: Actor, roomId: string, targetId: string): Promise<void> {
    this.act('moderation.ban', actor);
    const room = await this.loadRoom(roomId);
    await this.deps.bans.remove(room.id, targetId);
    await this.audit({ actorId: actor.id, targetId, roomId: room.id, action: 'BAN_REMOVED' });
  }

  // ---------- palestrantes ----------

  async promote(actor: Actor, roomId: string, targetId: string): Promise<void> {
    await this.setSpeaker(actor, roomId, targetId, true);
  }

  async demote(actor: Actor, roomId: string, targetId: string): Promise<void> {
    await this.setSpeaker(actor, roomId, targetId, false);
  }

  private async setSpeaker(actor: Actor, roomId: string, targetId: string, speaker: boolean) {
    this.act('moderation.speaker', actor);
    const open = await this.openRoom(roomId);
    const participation = await this.inRoom(open, targetId);

    const room = await this.deps.rooms.updateSpeakers(
      open.id,
      speaker ? 'add' : 'remove',
      targetId,
    );
    if (!room) throw err.notFound();

    const muted = await this.deps.participations.getMutedSources(room.id, targetId);
    if (room.lectureMode || room.screenLock) {
      // No modo palestra é isto que liga ou desliga a câmera e o microfone da pessoa; com a
      // tela travada, é o que libera ou tira a tela dela.
      const perms = computePermissions({
        role: participation.roleAtJoin,
        userId: targetId,
        mutedSources: muted,
        lectureMode: room.lectureMode,
        speakerIds: room.speakerIds,
        screenLock: room.screenLock,
      });
      await this.applyPermissions(room, targetId, perms);
    }

    if (speaker) this.deps.hands?.lower(room.id, targetId);
    this.updated(room, targetId, speaker, muted);
    await this.audit({
      actorId: actor.id,
      targetId,
      roomId: room.id,
      action: speaker ? 'SPEAKER_PROMOTED' : 'SPEAKER_DEMOTED',
    });
  }

  // ---------- ações em massa (reuniões) ----------

  /**
   * Silencia todo mundo de uma vez: `MUTE_ALL` desliga os microfones, `CAMERAS_OFF` as câmeras.
   * É como o "silenciar todos" do Meet: desliga o que está no ar agora, mas cada pessoa pode
   * ligar de novo. Para impedir de falar de verdade, use o modo palestra ou silencie uma pessoa.
   * Nunca atinge quem tem papel igual ou superior ao de quem age, nem a si mesmo.
   */
  async muteEveryone(
    actor: Actor,
    roomId: string,
    kind: 'MUTE_ALL' | 'CAMERAS_OFF',
  ): Promise<{ affected: number }> {
    this.act('moderation.mute', actor);
    const room = await this.openRoom(roomId);
    const sources: MediaSource[] =
      kind === 'MUTE_ALL' ? ['microphone'] : ['camera', 'screen_share', 'screen_share_audio'];

    const people = await this.deps.participations.listOpen(room.id);
    let affected = 0;
    for (const p of people) {
      if (p.userId === actor.id) continue;
      const fresh = await this.deps.roles.resolveUser(p.userId).catch(() => p.roleAtJoin);
      const role = ROLE_RANK[fresh] > ROLE_RANK[p.roleAtJoin] ? fresh : p.roleAtJoin;
      if (ROLE_RANK[actor.role] <= ROLE_RANK[role]) continue;
      try {
        await this.liveKit(() => this.deps.livekit.muteSources(room.id, p.userId, sources));
        this.deps.realtime.toUser(p.userId, 'moderation:action', {
          roomId: room.id,
          action: kind === 'MUTE_ALL' ? 'MUTED' : 'CAMERA_OFF',
          by: actor.id,
          reason: null,
          sources,
        });
        affected += 1;
      } catch (e) {
        this.deps.logger.warn(
          { err: e, roomId: room.id, userId: p.userId },
          'falha ao silenciar em massa',
        );
      }
    }
    await this.audit({
      actorId: actor.id,
      roomId: room.id,
      action: kind === 'MUTE_ALL' ? 'MEETING_MUTE_ALL' : 'MEETING_CAMERAS_OFF',
      meta: { affected },
    });
    return { affected };
  }

  // ---------- editar a sala (inclui o modo palestra) ----------

  async updateRoom(actor: Actor, roomId: string, patch: RoomPatch): Promise<RoomRecord> {
    const changesLecture = patch.lectureMode !== undefined || patch.screenLock !== undefined;
    const changesSpotlight = patch.spotlightId !== undefined;
    const changesDetails =
      patch.title !== undefined ||
      patch.description !== undefined ||
      patch.maxParticipants !== undefined;
    if (changesLecture) this.act('room.lecture', actor);
    if (changesSpotlight) this.act('moderation.speaker', actor);
    if (changesDetails) this.act('room.edit', actor);

    const current = await this.loadRoom(roomId);
    if (current.type !== 'MEETING') throw err.meetingOnly();
    if (current.status !== 'OPEN' && current.status !== 'SCHEDULED') throw err.notOpen();

    const room = await this.deps.rooms.update(current.id, patch);
    if (!room) throw err.notFound();

    const permissionsChanged =
      room.lectureMode !== current.lectureMode || room.screenLock !== current.screenLock;
    if (changesLecture && permissionsChanged && room.status === 'OPEN') {
      await this.reapplyAll(room);
    }
    if (changesDetails && this.deps.onRoomChanged) {
      await this.deps
        .onRoomChanged(room)
        .catch((e) =>
          this.deps.logger.warn({ err: e, roomId: room.id }, 'falha ao atualizar o embed'),
        );
    }

    const changes: Record<string, unknown> = {};
    for (const key of [
      'title',
      'description',
      'maxParticipants',
      'lectureMode',
      'screenLock',
      'spotlightId',
    ] as const) {
      if (patch[key] !== undefined) changes[key] = room[key];
    }
    this.deps.realtime.toRoom(room.id, 'room:updated', { roomId: room.id, changes });
    await this.audit({
      actorId: actor.id,
      roomId: room.id,
      action: 'ROOM_UPDATED',
      meta: { changes },
    });
    return room;
  }

  /** Recalcula a permissão de todos que estão na sala (modo palestra ligado/desligado). */
  private async reapplyAll(room: RoomRecord): Promise<void> {
    const people = await this.deps.participations.listOpen(room.id);
    // Em blocos: com centenas de pessoas, uma a uma levaria minutos.
    const BATCH = 25;
    for (let i = 0; i < people.length; i += BATCH) {
      await Promise.all(
        people.slice(i, i + BATCH).map(async (p) => {
          const mutedSources = await this.deps.participations.getMutedSources(room.id, p.userId);
          const perms = computePermissions({
            role: p.roleAtJoin,
            userId: p.userId,
            mutedSources,
            lectureMode: room.lectureMode,
            speakerIds: room.speakerIds,
            screenLock: room.screenLock,
          });
          try {
            await this.applyPermissions(room, p.userId, perms);
          } catch (e) {
            this.deps.logger.warn(
              { err: e, roomId: room.id, userId: p.userId },
              'falha ao aplicar o palco',
            );
          }
        }),
      );
    }
  }

  // ---------- consulta ----------

  async participants(roomId: string): Promise<{ room: RoomRecord; people: Participation[] }> {
    const room = await this.loadRoom(roomId);
    return { room, people: await this.deps.participations.listOpen(room.id) };
  }
}
