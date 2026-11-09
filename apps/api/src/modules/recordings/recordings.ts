import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { RecordingModel } from '../../db/models.js';
import type { RealtimeEmitter } from '../../realtime/emitter.js';
import { AppError } from '../../shared/errors.js';
import { randomToken } from '../../shared/crypto.js';
import type { Logger } from '../../shared/logger.js';
import { opsLog } from '../../shared/ops-log.js';
import type { Scheduler } from '../../shared/scheduler.js';
import type { AuditLog } from '../audit/audit.service.js';
import {
  LiveKitUnavailableError,
  type EgressUpdate,
  type LiveKitGateway,
  type RecordingMode,
} from '../livekit/livekit.gateway.js';
import type { ParticipationRepo } from '../rooms/participations.js';
import type { RoomRepo } from '../rooms/rooms.types.js';

export type RecordingStatus =
  'STARTING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';

export interface RecordingRecord {
  id: string;
  roomId: string;
  title: string;
  mode: RecordingMode;
  targetUserId: string | null;
  egressId: string | null;
  status: RecordingStatus;
  error: string | null;
  fileName: string;
  sizeBytes: number;
  durationSec: number;
  startedBy: string;
  startedAt: Date;
  endedAt: Date | null;
  expiresAt: Date | null;
  downloadedAt: Date | null;
}

export interface RecordingRepo {
  create(r: RecordingRecord): Promise<void>;
  findById(id: string): Promise<RecordingRecord | null>;
  findByEgress(egressId: string): Promise<RecordingRecord | null>;
  update(id: string, patch: Partial<Omit<RecordingRecord, 'id'>>): Promise<RecordingRecord | null>;
  list(limit: number): Promise<RecordingRecord[]>;
  /** Gravações em andamento (STARTING, RECORDING ou PROCESSING) de uma sala. */
  active(roomId: string): Promise<RecordingRecord[]>;
  /** Para a limpeza: o que já deveria ter sido apagado ou travou. */
  due(now: Date): Promise<RecordingRecord[]>;
}

/** Acesso aos arquivos gravados. Em testes é substituído. */
export interface RecordingFiles {
  size(path: string): Promise<number | null>;
  remove(path: string): Promise<void>;
}

export const realFiles: RecordingFiles = {
  async size(path) {
    try {
      return (await stat(path)).size;
    } catch {
      return null;
    }
  },
  async remove(path) {
    try {
      await unlink(path);
    } catch {
      // Já não existe: é o que queríamos.
    }
  },
};

type Doc = Omit<RecordingRecord, 'id'> & { _id: string };
const toRecord = (d: Doc): RecordingRecord => {
  const { _id, ...rest } = d;
  return { id: _id, ...rest };
};

export function createRecordingRepo(): RecordingRepo {
  return {
    async create(r) {
      const { id, ...rest } = r;
      await RecordingModel.create({ _id: id, ...rest });
    },
    async findById(id) {
      const d = await RecordingModel.findById(id).lean();
      return d ? toRecord(d as unknown as Doc) : null;
    },
    async findByEgress(egressId) {
      const d = await RecordingModel.findOne({ egressId }).lean();
      return d ? toRecord(d as unknown as Doc) : null;
    },
    async update(id, patch) {
      const d = await RecordingModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, lean: true },
      );
      return d ? toRecord(d as unknown as Doc) : null;
    },
    async list(limit) {
      const docs = await RecordingModel.find().sort({ startedAt: -1 }).limit(limit).lean();
      return docs.map((d) => toRecord(d as unknown as Doc));
    },
    async active(roomId) {
      const docs = await RecordingModel.find({
        roomId,
        status: { $in: ['STARTING', 'RECORDING', 'PROCESSING'] },
      }).lean();
      return docs.map((d) => toRecord(d as unknown as Doc));
    },
    async due(now) {
      const docs = await RecordingModel.find({
        $or: [
          { status: 'READY', expiresAt: { $lte: now } },
          { status: 'FAILED', endedAt: { $lte: new Date(now.getTime() - 86_400_000) } },
          { status: 'STARTING', startedAt: { $lte: new Date(now.getTime() - 5 * 60_000) } },
          { status: 'PROCESSING', endedAt: { $lte: new Date(now.getTime() - 10 * 60_000) } },
        ],
      }).lean();
      return docs.map((d) => toRecord(d as unknown as Doc));
    },
  };
}

export interface RecordingServiceDeps {
  repo: RecordingRepo;
  rooms: RoomRepo;
  participations: Pick<ParticipationRepo, 'findOpen'>;
  livekit: LiveKitGateway;
  realtime: RealtimeEmitter;
  audit: AuditLog;
  logger: Logger;
  files?: RecordingFiles;
  /** Pasta (no servidor da API) onde os arquivos aparecem. */
  dir: string;
  /** Pasta onde o serviço de gravação (Egress) escreve. É a mesma, vista de dentro dele. */
  egressDir: string;
  /** Dias para baixar antes de apagar. */
  retentionDays: number;
  now?: () => Date;
}

const ext = (mode: RecordingMode) => (mode === 'AUDIO' ? 'ogg' : 'mp4');
const ID = /^[\w-]{22}$/;

const e = {
  notFound: () => new AppError('RECORDING_NOT_FOUND', 404, 'Gravação não encontrada.'),
  expired: () =>
    new AppError(
      'RECORDING_EXPIRED',
      410,
      'Esta gravação passou do prazo e o arquivo foi apagado.',
    ),
  notReady: () =>
    new AppError(
      'RECORDING_NOT_READY',
      409,
      'A gravação ainda está sendo processada. Tente em instantes.',
    ),
};

/**
 * Gravação de reuniões (LiveKit Egress). O arquivo fica no servidor e o admin tem
 * `retentionDays` para baixar; passado o prazo, o arquivo é apagado de vez.
 */
export class RecordingService {
  private readonly now: () => Date;
  private readonly files: RecordingFiles;
  private timer: unknown;
  private running = false;

  constructor(private readonly deps: RecordingServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.files = deps.files ?? realFiles;
  }

  private pathOf(r: Pick<RecordingRecord, 'fileName'>) {
    return join(this.deps.dir, r.fileName);
  }

  private notify(roomId: string, recording: boolean, mode?: RecordingMode) {
    this.deps.realtime.toRoom(roomId, 'recording:state', {
      roomId,
      recording,
      ...(mode ? { mode } : {}),
    });
  }

  async start(
    actorId: string,
    input: { roomId: string; mode: RecordingMode; userId?: string | undefined },
  ): Promise<RecordingRecord> {
    const room = await this.deps.rooms.findById(input.roomId);
    if (!room) throw new AppError('ROOM_NOT_FOUND', 404, 'Sala não encontrada.');
    if (room.type !== 'MEETING') {
      throw new AppError('RECORDING_ONLY_MEETINGS', 409, 'Só reuniões podem ser gravadas.');
    }
    if (room.status !== 'OPEN')
      throw new AppError('ROOM_NOT_OPEN', 409, 'Esta sala não está aberta.');
    if ((await this.deps.repo.active(room.id)).length > 0) {
      throw new AppError('RECORDING_ALREADY_RUNNING', 409, 'Esta reunião já está sendo gravada.');
    }
    const single = input.mode === 'PARTICIPANT' || input.mode === 'SCREEN';
    if (single) {
      if (!input.userId) {
        throw new AppError('VALIDATION_ERROR', 400, 'Escolha de quem é a gravação.');
      }
      if (!(await this.deps.participations.findOpen(room.id, input.userId))) {
        throw new AppError(
          'PARTICIPANT_NOT_IN_ROOM',
          409,
          'Essa pessoa não está conectada à sala agora.',
        );
      }
    }

    const id = randomToken(16);
    const fileName = `${id}.${ext(input.mode)}`;
    const record: RecordingRecord = {
      id,
      roomId: room.id,
      title: room.title,
      mode: input.mode,
      targetUserId: single ? (input.userId ?? null) : null,
      egressId: null,
      status: 'STARTING',
      error: null,
      fileName,
      sizeBytes: 0,
      durationSec: 0,
      startedBy: actorId,
      startedAt: this.now(),
      endedAt: null,
      expiresAt: null,
      downloadedAt: null,
    };
    await this.deps.repo.create(record);

    try {
      const { egressId } = await this.deps.livekit.startRecording({
        roomName: room.id,
        mode: input.mode,
        userId: record.targetUserId ?? undefined,
        filepath: `${this.deps.egressDir.replace(/\/$/, '')}/${fileName}`,
      });
      record.egressId = egressId;
      record.status = 'RECORDING';
      await this.deps.repo.update(id, { egressId, status: 'RECORDING' });
    } catch (err) {
      await this.deps.repo.update(id, {
        status: 'FAILED',
        endedAt: this.now(),
        error: 'Não iniciou',
      });
      this.deps.logger.error({ err, roomId: room.id }, 'falha ao iniciar a gravação');
      opsLog.error(
        'Não consegui iniciar a gravação',
        `O serviço de gravação (Egress) não respondeu para "${room.title}". Confira se o container "egress" e o Redis estão no ar.`,
      );
      throw new AppError(
        'RECORDING_FAILED',
        err instanceof LiveKitUnavailableError ? 502 : 500,
        'Não foi possível iniciar a gravação. O serviço de gravação parece estar fora do ar.',
      );
    }

    this.notify(room.id, true, input.mode);
    await this.deps.audit.record({
      actorId,
      roomId: room.id,
      action: 'RECORDING_STARTED',
      meta: { mode: input.mode, targetUserId: record.targetUserId },
    });
    return record;
  }

  async stop(actorId: string, id: string): Promise<RecordingRecord> {
    const r = await this.get(id);
    if (r.status !== 'RECORDING' && r.status !== 'STARTING') return r;
    if (r.egressId) await this.deps.livekit.stopRecording(r.egressId);
    const updated = await this.deps.repo.update(id, { status: 'PROCESSING', endedAt: this.now() });
    this.notify(r.roomId, false);
    await this.deps.audit.record({ actorId, roomId: r.roomId, action: 'RECORDING_STOPPED' });
    return updated ?? r;
  }

  /** A reunião acabou: fecha qualquer gravação aberta (o arquivo é finalizado pelo Egress). */
  async onRoomEnded(roomId: string): Promise<void> {
    for (const r of await this.deps.repo.active(roomId)) {
      if (r.status === 'PROCESSING') continue;
      try {
        await this.stop('system', r.id);
      } catch (err) {
        this.deps.logger.warn(
          { err, recordingId: r.id },
          'falha ao parar a gravação ao fim da reunião',
        );
      }
    }
  }

  /** Andamento vindo do webhook do Egress. */
  async onEgress(info: EgressUpdate): Promise<void> {
    const r = await this.deps.repo.findByEgress(info.egressId);
    if (!r) return;
    const at = this.now();
    switch (info.status) {
      case 'ACTIVE':
        if (r.status === 'STARTING') await this.deps.repo.update(r.id, { status: 'RECORDING' });
        return;
      case 'COMPLETE': {
        const file = info.files[0];
        const size = (await this.files.size(this.pathOf(r))) ?? file?.size ?? 0;
        const expiresAt = new Date(at.getTime() + this.deps.retentionDays * 86_400_000);
        await this.deps.repo.update(r.id, {
          status: 'READY',
          sizeBytes: size,
          durationSec: file?.durationSec ?? 0,
          endedAt: r.endedAt ?? at,
          expiresAt,
        });
        this.notify(r.roomId, false);
        opsLog.info(
          'Gravação pronta',
          `"${r.title}" já pode ser baixada em Gravações (até ${expiresAt.toLocaleDateString('pt-BR')}).`,
        );
        return;
      }
      case 'FAILED':
      case 'ABORTED':
        await this.deps.repo.update(r.id, {
          status: 'FAILED',
          endedAt: r.endedAt ?? at,
          error: info.error ?? 'A gravação foi interrompida.',
        });
        this.notify(r.roomId, false);
        opsLog.error('A gravação falhou', `"${r.title}": ${info.error ?? 'interrompida'}.`);
        return;
      default:
        return;
    }
  }

  async get(id: string): Promise<RecordingRecord> {
    if (!ID.test(id)) throw e.notFound();
    const r = await this.deps.repo.findById(id);
    if (!r) throw e.notFound();
    return r;
  }

  list(): Promise<RecordingRecord[]> {
    return this.deps.repo.list(100);
  }

  /** Confere que dá para baixar e devolve o caminho do arquivo. */
  async prepareDownload(
    actorId: string,
    id: string,
  ): Promise<{ path: string; downloadName: string }> {
    const r = await this.get(id);
    if (r.status === 'EXPIRED') throw e.expired();
    if (r.status !== 'READY') throw e.notReady();
    if (r.expiresAt && r.expiresAt <= this.now()) throw e.expired();
    if ((await this.files.size(this.pathOf(r))) === null) {
      throw new AppError(
        'RECORDING_FILE_MISSING',
        410,
        'O arquivo desta gravação não está mais no servidor.',
      );
    }
    await this.deps.repo.update(id, { downloadedAt: this.now() });
    await this.deps.audit.record({ actorId, roomId: r.roomId, action: 'RECORDING_DOWNLOADED' });
    const safe =
      r.title
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'gravacao';
    return {
      path: this.pathOf(r),
      downloadName: `${safe}-${r.startedAt.toISOString().slice(0, 10)}.${ext(r.mode)}`,
    };
  }

  async remove(actorId: string, id: string): Promise<void> {
    const r = await this.get(id);
    if (r.status === 'RECORDING' || r.status === 'STARTING') {
      throw new AppError('RECORDING_ALREADY_RUNNING', 409, 'Pare a gravação antes de apagar.');
    }
    await this.files.remove(this.pathOf(r));
    await this.deps.repo.update(id, { status: 'EXPIRED', sizeBytes: 0, expiresAt: null });
    await this.deps.audit.record({ actorId, roomId: r.roomId, action: 'RECORDING_DELETED' });
  }

  /** Apaga o que passou do prazo e resolve o que travou. */
  async cleanup(): Promise<{ expired: number; failed: number }> {
    let expired = 0;
    let failed = 0;
    for (const r of await this.deps.repo.due(this.now())) {
      if (r.status === 'READY') {
        await this.files.remove(this.pathOf(r));
        await this.deps.repo.update(r.id, { status: 'EXPIRED', sizeBytes: 0 });
        await this.deps.audit.record({
          actorId: 'system',
          roomId: r.roomId,
          action: 'RECORDING_EXPIRED',
        });
        expired += 1;
      } else if (r.status === 'PROCESSING') {
        // O webhook de "pronto" não chegou: se o arquivo existe, considera pronto.
        const size = await this.files.size(this.pathOf(r));
        if (size !== null && size > 0) {
          await this.deps.repo.update(r.id, {
            status: 'READY',
            sizeBytes: size,
            expiresAt: new Date(this.now().getTime() + this.deps.retentionDays * 86_400_000),
          });
        } else {
          await this.deps.repo.update(r.id, { status: 'FAILED', error: 'O arquivo não apareceu.' });
          failed += 1;
        }
      } else {
        // FAILED antigo ou STARTING travado: limpa o resto.
        await this.files.remove(this.pathOf(r));
        await this.deps.repo.update(r.id, {
          status: r.status === 'STARTING' ? 'FAILED' : 'EXPIRED',
          error: r.error ?? 'Não iniciou.',
          endedAt: r.endedAt ?? this.now(),
        });
        failed += r.status === 'STARTING' ? 1 : 0;
      }
    }
    return { expired, failed };
  }

  /** Limpeza periódica (de hora em hora). */
  startJanitor(scheduler: Scheduler): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.timer = scheduler.setTimeout(() => {
        void this.cleanup()
          .catch((err) => this.deps.logger.error({ err }, 'falha na limpeza das gravações'))
          .finally(loop);
      }, 3_600_000);
    };
    void this.cleanup().catch(() => undefined);
    loop();
    this.stopJanitor = () => {
      this.running = false;
      if (this.timer !== undefined) scheduler.clearTimeout(this.timer);
    };
  }

  stopJanitor: () => void = () => undefined;
}
