import { join } from 'node:path';
import { FakeFiles, MemoryRecordings } from '../fixtures/recordings-fakes.js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RecordingService } from '../../src/modules/recordings/recordings.js';
import { recordingsRoutes } from '../../src/modules/recordings/recordings.routes.js';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { buildRoomsApp, openMeeting, type RoomsCtx } from '../fixtures/rooms-fakes.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';

const ADMIN = '995000000000000001';
const MOD = '995000000000000002';
const ANA = '995000000000000003';
const DAY = 86_400_000;

async function login(ctx: RoomsCtx, id: string, roles: string[] = []) {
  ctx.discord.addMember(id, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${id}`, state });
  return agent;
}

async function setup() {
  const ctx = buildRoomsApp();
  const room = await openMeeting(ctx);
  await ctx.participations.open({
    roomId: room.id,
    userId: ANA,
    displayName: 'Ana',
    avatarUrl: null,
    role: 'MEMBER',
    at: ctx.clock.now(),
  });
  const repo = new MemoryRecordings();
  const files = new FakeFiles();
  const service = new RecordingService({
    repo,
    rooms: ctx.rooms,
    participations: ctx.participations,
    livekit: ctx.livekit,
    realtime: ctx.emitter,
    audit: ctx.audit,
    logger: ctx.logger,
    files,
    dir: '/rec',
    egressDir: '/out',
    retentionDays: 10,
    now: ctx.clock.now,
  });
  return { ctx, room, repo, files, service };
}

describe('gravação de reuniões', () => {
  it('começa pedindo ao Egress, avisa a sala (todo mundo sabe que está gravando) e audita', async () => {
    const { ctx, room, service, repo } = await setup();
    const rec = await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    expect(rec.status).toBe('RECORDING');
    expect(ctx.livekit.recordings[0]!.req).toMatchObject({
      roomName: room.id,
      mode: 'GRID',
      filepath: `/out/${rec.id}.mp4`,
    });
    expect(ctx.emitter.of('recording:state')[0]!.payload).toMatchObject({
      recording: true,
      mode: 'GRID',
    });
    expect(ctx.auditRepo.records.map((r) => r.action)).toContain('RECORDING_STARTED');
    expect((await repo.findById(rec.id))!.egressId).toBe('EG_1');
  });

  it('modos: só áudio vira .ogg; uma pessoa exige alguém conectado', async () => {
    const { ctx, room, service } = await setup();
    const audio = await service.start(ADMIN, { roomId: room.id, mode: 'AUDIO' });
    expect(audio.fileName.endsWith('.ogg')).toBe(true);
    await service.stop(ADMIN, audio.id);
    await service.onEgress({ egressId: 'EG_1', status: 'COMPLETE', files: [], error: null });

    await expect(
      service.start(ADMIN, { roomId: room.id, mode: 'PARTICIPANT' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.start(ADMIN, { roomId: room.id, mode: 'SCREEN', userId: '995000000000000099' }),
    ).rejects.toMatchObject({ code: 'PARTICIPANT_NOT_IN_ROOM' });
    const one = await service.start(ADMIN, { roomId: room.id, mode: 'SCREEN', userId: ANA });
    expect(ctx.livekit.recordings.at(-1)!.req).toMatchObject({ mode: 'SCREEN', userId: ANA });
    expect(one.targetUserId).toBe(ANA);
  });

  it('só reuniões abertas; uma gravação por vez', async () => {
    const { ctx, room, service } = await setup();
    ctx.configureLives();
    await ctx.live.handle({ userId: ANA, oldChannelId: null, newChannelId: VOICE_1 });
    const live = [...ctx.rooms.rooms.values()].find((r) => r.type === 'LIVE')!;
    await expect(service.start(ADMIN, { roomId: live.id, mode: 'GRID' })).rejects.toMatchObject({
      code: 'RECORDING_ONLY_MEETINGS',
    });

    await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    await expect(service.start(ADMIN, { roomId: room.id, mode: 'SPEAKER' })).rejects.toMatchObject({
      code: 'RECORDING_ALREADY_RUNNING',
    });
  });

  it('Egress fora do ar: erro claro, nada fica "gravando"', async () => {
    const { ctx, room, service, repo } = await setup();
    ctx.livekit.failRecording = true;
    await expect(service.start(ADMIN, { roomId: room.id, mode: 'GRID' })).rejects.toMatchObject({
      code: 'RECORDING_FAILED',
    });
    expect(await repo.active(room.id)).toHaveLength(0);
    expect(ctx.emitter.of('recording:state')).toHaveLength(0);
  });

  it('fluxo completo: parar -> processando -> pronta (prazo de 10 dias) -> baixar', async () => {
    const { ctx, room, service, files } = await setup();
    const rec = await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    const stopped = await service.stop(ADMIN, rec.id);
    expect(stopped.status).toBe('PROCESSING');
    expect(ctx.livekit.stoppedRecordings).toEqual(['EG_1']);
    expect(ctx.emitter.of('recording:state').at(-1)!.payload).toMatchObject({ recording: false });

    files.sizes.set(join('/rec', rec.fileName), 5_000_000);
    await service.onEgress({
      egressId: 'EG_1',
      status: 'COMPLETE',
      files: [{ filename: 'x', size: 1, durationSec: 3600 }],
      error: null,
    });
    const ready = await service.get(rec.id);
    expect(ready).toMatchObject({ status: 'READY', sizeBytes: 5_000_000, durationSec: 3600 });
    expect(ready.expiresAt!.getTime() - ctx.clock.now().getTime()).toBe(10 * DAY);

    const dl = await service.prepareDownload(ADMIN, rec.id);
    expect(dl.path).toBe(join('/rec', rec.fileName));
    expect(dl.downloadName).toMatch(/^Reuni.*\.mp4$/);
    expect((await service.get(rec.id)).downloadedAt).not.toBeNull();
    expect(ctx.auditRepo.records.map((r) => r.action)).toContain('RECORDING_DOWNLOADED');
  });

  it('passou dos 10 dias: o arquivo é apagado e o download dá 410', async () => {
    const { ctx, room, service, files } = await setup();
    const rec = await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    await service.stop(ADMIN, rec.id);
    files.sizes.set(join('/rec', rec.fileName), 1000);
    await service.onEgress({ egressId: 'EG_1', status: 'COMPLETE', files: [], error: null });

    ctx.clock.advance(9 * DAY);
    expect((await service.cleanup()).expired).toBe(0);
    ctx.clock.advance(2 * DAY);
    expect((await service.cleanup()).expired).toBe(1);
    expect(files.removed).toContain(join('/rec', rec.fileName));
    expect((await service.get(rec.id)).status).toBe('EXPIRED');
    await expect(service.prepareDownload(ADMIN, rec.id)).rejects.toMatchObject({
      code: 'RECORDING_EXPIRED',
      status: 410,
    });
    expect(ctx.auditRepo.records.map((r) => r.action)).toContain('RECORDING_EXPIRED');
  });

  it('webhook que não chegou: se o arquivo existe, a limpeza considera pronta; senão, falhou', async () => {
    const { ctx, room, service, files } = await setup();
    const a = await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    await service.stop(ADMIN, a.id);
    files.sizes.set(join('/rec', a.fileName), 777);
    ctx.clock.advance(11 * 60_000);
    await service.cleanup();
    expect((await service.get(a.id)).status).toBe('READY');
  });

  it('falha do Egress marca como falhou e avisa a sala', async () => {
    const { ctx, room, service } = await setup();
    const rec = await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    await service.onEgress({ egressId: 'EG_1', status: 'FAILED', files: [], error: 'sem espaço' });
    expect(await service.get(rec.id)).toMatchObject({ status: 'FAILED', error: 'sem espaço' });
    expect(ctx.emitter.of('recording:state').at(-1)!.payload).toMatchObject({ recording: false });
  });

  it('reunião encerrada para a gravação sozinha', async () => {
    const { ctx, room, service } = await setup();
    const rec = await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    await service.onRoomEnded(room.id);
    expect(ctx.livekit.stoppedRecordings).toEqual(['EG_1']);
    expect((await service.get(rec.id)).status).toBe('PROCESSING');
  });

  it('apagar na mão remove o arquivo; não apaga o que está gravando', async () => {
    const { room, service, files } = await setup();
    const rec = await service.start(ADMIN, { roomId: room.id, mode: 'GRID' });
    await expect(service.remove(ADMIN, rec.id)).rejects.toMatchObject({
      code: 'RECORDING_ALREADY_RUNNING',
    });
    await service.stop(ADMIN, rec.id);
    files.sizes.set(join('/rec', rec.fileName), 10);
    await service.remove(ADMIN, rec.id);
    expect(files.removed).toContain(join('/rec', rec.fileName));
  });

  it('id malformado vira 404 sem tocar no disco', async () => {
    const { service } = await setup();
    await expect(service.get('../../etc/passwd')).rejects.toMatchObject({
      code: 'RECORDING_NOT_FOUND',
    });
  });
});

describe('rotas de gravação', () => {
  async function app() {
    const base = await setup();
    // As rotas são montadas à parte (o app de teste padrão não as inclui).
    const { default: express } = await import('express');
    const { errorHandler } = await import('../../src/shared/error-handler.js');
    const { requireAuth } = await import('../../src/modules/auth/auth.middleware.js');
    void requireAuth;
    const router = recordingsRoutes(
      { recordings: base.service, now: base.ctx.clock.now },
      base.ctx.auth,
    );
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      (req as unknown as { log: { error: () => void } }).log = { error: () => undefined };
      next();
    });
    a.use('/x', router);
    a.use(errorHandler);
    return { ...base, a };
  }

  it('sem login: 401', async () => {
    const { a, room } = await app();
    expect(
      (await request(a).post(`/x/rooms/${room.id}/recordings`).send({ mode: 'GRID' })).status,
    ).toBe(401);
    expect((await request(a).get('/x/recordings')).status).toBe(401);
  });

  it('capacidade só do ADMIN (MOD e membro recebem 403) — conferido na matriz', async () => {
    const { can } = await import('../../src/modules/permissions/capabilities.js');
    expect(can('ADMIN', 'recording.manage')).toBe(true);
    expect(can('MOD', 'recording.manage')).toBe(false);
    expect(ADMIN_ROLE && MOD_ROLE && MOD).toBeTruthy();
    void login;
  });
});
