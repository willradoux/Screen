import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { LiveVoiceHandler } from '../../src/discord/live-handler.js';
import { VoiceCache } from '../../src/discord/voice-cache.js';
import {
  AuditLogModel,
  GuildSettingsModel,
  ParticipationModel,
  RoomBanModel,
  RoomModel,
  SessionModel,
  UserModel,
} from '../../src/db/models.js';
import { AuditService, createAuditRepo } from '../../src/modules/audit/audit.service.js';
import { createSessionRepo, createUserRepo } from '../../src/modules/auth/auth.repositories.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { LiveKitWebhookHandler } from '../../src/modules/livekit/livekit.webhook.js';
import { MeetingScheduler } from '../../src/modules/meetings/scheduler.js';
import { MeetingService } from '../../src/modules/meetings/meetings.service.js';
import { buildReport, summarize } from '../../src/modules/meetings/report.js';
import { ModerationService } from '../../src/modules/moderation/moderation.service.js';
import { RoleResolver } from '../../src/modules/permissions/role-resolver.js';
import { RoomAccess } from '../../src/modules/rooms/access.js';
import { RoomAnnouncer } from '../../src/modules/rooms/announcer.js';
import { createBanRepo, createParticipationRepo } from '../../src/modules/rooms/participations.js';
import { PresenceService } from '../../src/modules/rooms/presence.js';
import { createRoomRepo } from '../../src/modules/rooms/rooms.repository.js';
import { RoomService } from '../../src/modules/rooms/rooms.service.js';
import { createSettingsRepo } from '../../src/modules/settings/settings.repository.js';
import { SettingsService } from '../../src/modules/settings/settings.service.js';
import { createSocketServer, type SocketServer } from '../../src/realtime/socket.js';
import { createLogger } from '../../src/shared/logger.js';
import {
  CATEGORY,
  FakeGateway,
  FakeScheduler,
  LIVE_TEXT,
  ANNOUNCE,
  VOICE_1,
  WEB_URL,
} from '../fixtures/bot-fakes.js';
import { ADMIN_ROLE, FakeClock, FakeDiscord, MOD_ROLE } from '../fixtures/fakes.js';
import { FakeLiveKit, RecordingEmitter, connectSocket } from '../fixtures/rooms-fakes.js';
import { useTestDb } from './helpers.js';

useTestDb('e2e', [
  UserModel,
  SessionModel,
  RoomModel,
  GuildSettingsModel,
  ParticipationModel,
  RoomBanModel,
  AuditLogModel,
]);

const MIN = 60_000;

/**
 * Espera uma condição que depende de trabalho assíncrono já em andamento (os temporizadores
 * falsos disparam na hora, mas o que eles fazem no MongoDB leva alguns milissegundos).
 */
async function eventually<T>(check: () => Promise<T>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return await check();
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}
const ORIGIN = 'http://localhost:5173';
const ids = {
  admin: '960000000000000001',
  mod: '960000000000000002',
  ana: '960000000000000003',
  beto: '960000000000000004',
};
const open: Socket[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) s.close();
  for (const c of closers.splice(0)) await c();
});

/**
 * O sistema todo, com o MongoDB REAL e todos os serviços de verdade. Só o Discord, o
 * LiveKit e o relógio são dublês (não dá para tê-los de verdade num teste).
 */
function build() {
  const env = loadEnv({ NODE_ENV: 'test' });
  const guildId = env.DISCORD_GUILD_ID;
  const logger = createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'test' });
  const clock = new FakeClock(Date.parse('2026-11-08T15:00:00Z'));
  const scheduler = new FakeScheduler();
  const gateway = new FakeGateway();
  const discord = new FakeDiscord();
  const livekit = new FakeLiveKit();
  const emitter = new RecordingEmitter();
  const cache = new VoiceCache();

  gateway.addChannel({ id: CATEGORY, name: 'Lives', kind: 'category', parentId: null });
  gateway.addChannel({ id: LIVE_TEXT, name: 'lives', kind: 'text', parentId: null });
  gateway.addChannel({ id: ANNOUNCE, name: 'avisos', kind: 'text', parentId: null });
  gateway.addChannel({ id: VOICE_1, name: 'Live 1', kind: 'voice', parentId: CATEGORY });
  gateway.roles.add(ADMIN_ROLE);
  gateway.roles.add(MOD_ROLE);
  gateway.getMemberRoleIds = async (id) => discord.members.get(id)?.roles ?? [];

  const settings = createSettingsRepo();
  const rooms = createRoomRepo();
  const participations = createParticipationRepo();
  const bans = createBanRepo();
  const audit = new AuditService({ repo: createAuditRepo(), logger, now: clock.now });

  let sockets: SocketServer | undefined;
  const presence = new PresenceService({
    participations,
    livekit,
    realtime: emitter,
    settings,
    cache,
    scheduler,
    logger,
    guildId,
    now: clock.now,
  });
  const announcer = new RoomAnnouncer({
    gateway,
    rooms,
    settings,
    scheduler,
    logger,
    guildId,
    webUrl: WEB_URL,
    countParticipants: (r) => (r.voiceChannelId ? cache.count(r.voiceChannelId) : 0),
    summary: async (r) =>
      summarize(buildReport(r, await participations.listAll(r.id), clock.now())),
  });
  const roomService = new RoomService({ rooms, announcer, logger, now: clock.now });
  roomService.onEnded((room, reason) => presence.onRoomEnded(room, reason));

  const live = new LiveVoiceHandler({
    gateway,
    settings,
    rooms,
    roomService,
    announcer,
    cache,
    scheduler,
    logger,
    guildId,
    emptyEndSeconds: 60,
    presence,
  });
  const meetings = new MeetingService({
    rooms,
    roomService,
    announcer,
    settings,
    gateway,
    participations,
    audit,
    logger,
    guildId,
    now: clock.now,
  });
  const meetingScheduler = new MeetingScheduler({
    rooms,
    roomService,
    announcer,
    participations,
    audit,
    scheduler,
    logger,
    guildId,
    intervalMs: 15_000,
    emptyEndMinutes: 15,
    now: clock.now,
  });
  const roles = new RoleResolver({ gateway, settings, guildId, bootstrapAdminIds: [] });
  const access = new RoomAccess({
    participations,
    bans,
    cache,
    gateway,
    livekit,
    livekitPublicUrl: env.LIVEKIT_PUBLIC_URL,
    tokenTtlSeconds: 600,
    now: clock.now,
  });
  const webhook = new LiveKitWebhookHandler({
    livekit,
    rooms,
    participations,
    presence,
    realtime: emitter,
    cache,
    logger,
    now: clock.now,
  });
  const moderation = new ModerationService({
    rooms,
    participations,
    bans,
    livekit,
    presence,
    realtime: emitter,
    audit,
    roles,
    onRoomChanged: (r) => announcer.refresh(r),
    logger,
    now: clock.now,
  });
  const settingsService = new SettingsService({
    settings,
    gateway,
    audit,
    realtime: emitter,
    guildId,
  });
  const auth = new AuthService({
    env,
    discord,
    users: createUserRepo(),
    sessions: createSessionRepo(),
    settings,
    now: clock.now,
    guildPermissions: gateway,
    onSessionRevoked: (t) => sockets?.revoke(t),
  });

  const app = createApp(env, logger, {
    auth,
    rooms: {
      rooms,
      participations,
      access,
      presence,
      roomService,
      webhook,
      audit,
      guildId,
      webUrl: WEB_URL,
    },
    moderation: { moderation, access, participations, webUrl: WEB_URL },
    admin: { settings: settingsService, audit },
    meetings: { meetings, participations, webUrl: WEB_URL },
  });

  const listen = async () => {
    const server = createServer(app);
    sockets = createSocketServer({
      httpServer: server,
      env,
      auth,
      rooms,
      participations,
      access,
      logger,
    });
    emitter.forward = sockets;
    await new Promise<void>((r) => server.listen(0, r));
    closers.push(async () => void (await sockets?.close()));
    return `http://localhost:${(server.address() as AddressInfo).port}`;
  };

  let n = 0;
  const webhookCall = async (event: Parameters<FakeLiveKit['events']['set']>[1]) => {
    const body = `evento-${++n}`;
    livekit.events.set(body, event);
    return request(app).post('/api/v1/livekit/webhook').set('Authorization', 'assinado').send(body);
  };

  /** Login completo como na vida real: OAuth, cookie de sessão, papel pelos cargos. */
  const login = async (userId: string, roleIds: string[] = [], nick?: string) => {
    discord.addMember(userId, { roles: roleIds, ...(nick ? { nick } : {}) });
    const agent = request.agent(app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const cb = await agent
      .get('/api/v1/auth/discord/callback')
      .query({ code: `code-${userId}`, state });
    const sid = /screem_sid=([^;]+)/.exec(
      (cb.headers['set-cookie'] as unknown as string[]).join(';'),
    )![1]!;
    return { agent, cookie: `screem_sid=${sid}` };
  };

  const post = (agent: ReturnType<typeof request.agent>, path: string, body?: object) =>
    agent.post(`/api/v1${path}`).set('Origin', ORIGIN).send(body);

  return {
    env,
    clock,
    scheduler,
    gateway,
    discord,
    livekit,
    emitter,
    cache,
    settings,
    rooms,
    participations,
    bans,
    live,
    meetings,
    meetingScheduler,
    roomService,
    webhook,
    listen,
    webhookCall,
    login,
    post,
    app,
  };
}

type World = ReturnType<typeof build>;

const meta = (role: string) => JSON.stringify({ role, avatarUrl: null });
const joined = (room: string, id: string, role = 'MEMBER') => ({
  event: 'participant_joined',
  roomName: room,
  participant: { identity: id, name: id, metadata: meta(role), leaveCause: 'other' as const },
});

async function configured(): Promise<World> {
  const w = build();
  await w.settings.update(
    w.env.DISCORD_GUILD_ID,
    { liveCategoryId: CATEGORY, liveTextChannelId: LIVE_TEXT, announceChannelId: ANNOUNCE },
    'setup',
  );
  await w.settings.modifyList(w.env.DISCORD_GUILD_ID, 'adminRoleIds', 'add', ADMIN_ROLE, 'setup');
  await w.settings.modifyList(w.env.DISCORD_GUILD_ID, 'modRoleIds', 'add', MOD_ROLE, 'setup');
  return w;
}

describe('fluxo completo de uma live (MongoDB real)', () => {
  it('canal de voz -> embed -> login -> join -> webhook -> moderação -> saída da call -> fim', async () => {
    const w = await configured();
    const server = await w.listen();

    // 1. Ana entra no canal de voz: nasce a sala e o embed com o link.
    await w.live.handle({ userId: ids.ana, oldChannelId: null, newChannelId: VOICE_1 });
    const stored = await RoomModel.findOne({ type: 'LIVE', status: 'OPEN' }).lean();
    expect(stored).toMatchObject({
      voiceChannelId: VOICE_1,
      createdBy: ids.ana,
      title: 'Live - Live 1',
    });
    const roomId = stored!._id as string;
    expect(w.gateway.sent).toHaveLength(1);
    expect(JSON.stringify(w.gateway.sent[0]!.payload.components)).toContain(
      `${WEB_URL}/r/${roomId}`,
    );
    expect(stored!.announceMessageId).toBe(w.gateway.sent[0]!.messageId);

    // 2. Ana e Beto fazem login. Beto NÃO está na call.
    const ana = await w.login(ids.ana, [], 'Ana');
    const beto = await w.login(ids.beto, [], 'Beto');
    expect(await UserModel.countDocuments()).toBe(2);
    expect(await SessionModel.countDocuments()).toBe(2);

    const list = await ana.agent.get('/api/v1/rooms');
    expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([roomId]);

    // 3. Beto (fora da call) é barrado; Ana entra e recebe o token.
    const denied = await w.post(beto.agent, `/rooms/${roomId}/join`);
    expect(denied.body.error).toMatchObject({
      code: 'NOT_IN_VOICE',
      details: { voiceChannelName: 'Live 1' },
    });

    const join = await w.post(ana.agent, `/rooms/${roomId}/join`);
    expect(join.status).toBe(200);
    expect(join.body.data.livekit).toMatchObject({
      url: w.env.LIVEKIT_PUBLIC_URL,
      token: 'token-1',
    });
    expect(w.livekit.tokens[0]).toMatchObject({ roomName: roomId, identity: ids.ana, name: 'Ana' });

    // 4. O LiveKit avisa que a Ana conectou: a participação é gravada no banco.
    expect((await w.webhookCall(joined(roomId, ids.ana))).status).toBe(200);
    expect(await ParticipationModel.find({ roomId, leftAt: null }).lean()).toHaveLength(1);

    // 5. Beto entra na call e agora consegue; pelo socket, vê quem está na sala.
    await w.live.handle({ userId: ids.beto, oldChannelId: null, newChannelId: VOICE_1 });
    expect((await w.post(beto.agent, `/rooms/${roomId}/join`)).status).toBe(200);
    await w.webhookCall(joined(roomId, ids.beto));

    const socket = connectSocket(server, beto.cookie);
    open.push(socket);
    await new Promise<void>((res, rej) => {
      socket.once('connect', () => res());
      socket.once('connect_error', rej);
    });
    const snapshot = await new Promise<{
      ok: boolean;
      data: { participants: { userId: string }[] };
    }>((res) => socket.emit('room:subscribe', { roomId }, res));
    expect(snapshot.ok).toBe(true);
    expect(snapshot.data.participants.map((p) => p.userId).sort()).toEqual(
      [ids.ana, ids.beto].sort(),
    );

    // 6. Um moderador silencia o Beto: fica gravado no banco e vale se ele voltar.
    const mod = await w.login(ids.mod, [MOD_ROLE], 'Moderadora');
    const warning = new Promise<{ action: string }>((res) => socket.once('moderation:action', res));
    expect(
      (
        await w.post(mod.agent, `/rooms/${roomId}/participants/${ids.beto}/mute`, {
          reason: 'ruído',
        })
      ).status,
    ).toBe(204);
    expect(await warning).toMatchObject({ action: 'MUTED' });
    expect(
      (await ParticipationModel.findOne({ roomId, userId: ids.beto }).lean())?.mutedSources,
    ).toHaveLength(4);

    // 7. Beto sai da call do Discord: aviso, tolerância de 30 s e remoção.
    await w.live.handle({ userId: ids.beto, oldChannelId: VOICE_1, newChannelId: null });
    expect(w.emitter.of('voice:warning')).toHaveLength(1);
    await w.scheduler.advance(30_000);
    const betoRow = await eventually(async () => {
      const row = await ParticipationModel.findOne({ roomId, userId: ids.beto }).lean();
      expect(row).toMatchObject({ leaveReason: 'LEFT_VOICE' });
      return row;
    });
    expect(betoRow!.leftAt).toBeTruthy();
    expect((await w.post(beto.agent, `/rooms/${roomId}/join`)).body.error.code).toBe(
      'NOT_IN_VOICE',
    );

    // 8. Ana sai: o canal esvazia e, em 60 s, a sala termina sozinha e o embed muda.
    await w.live.handle({ userId: ids.ana, oldChannelId: VOICE_1, newChannelId: null });
    await w.scheduler.advance(60_000);
    expect(await RoomModel.findById(roomId).lean()).toMatchObject({
      status: 'ENDED',
      endReason: 'VOICE_EMPTY',
    });
    expect(w.gateway.edits.at(-1)!.payload.embeds[0]!.title).toBe('⚫ Live encerrada');
    expect(await ParticipationModel.countDocuments({ roomId, leftAt: null })).toBe(0);
    expect(w.livekit.deleted).toContain(roomId);

    // 9. Tudo ficou na auditoria, que só o admin lê.
    const admin = await w.login(ids.admin, [ADMIN_ROLE], 'Admin');
    const audit = await admin.agent.get('/api/v1/audit').query({ roomId });
    expect(audit.body.data.map((a: { action: string }) => a.action)).toContain('PARTICIPANT_MUTED');
    expect((await mod.agent.get('/api/v1/audit')).status).toBe(403);
  });

  it('banido não volta, nem reconectando; desbanir libera', async () => {
    const w = await configured();
    await w.live.handle({ userId: ids.ana, oldChannelId: null, newChannelId: VOICE_1 });
    await w.live.handle({ userId: ids.beto, oldChannelId: null, newChannelId: VOICE_1 });
    const roomId = (await RoomModel.findOne({ status: 'OPEN' }).lean())!._id as string;
    const beto = await w.login(ids.beto);
    const mod = await w.login(ids.mod, [MOD_ROLE]);
    await w.post(beto.agent, `/rooms/${roomId}/join`);
    await w.webhookCall(joined(roomId, ids.beto));

    await w.post(mod.agent, `/rooms/${roomId}/participants/${ids.beto}/ban`, {
      durationMinutes: 30,
    });
    expect(await RoomBanModel.countDocuments({ roomId, userId: ids.beto })).toBe(1);
    expect((await w.post(beto.agent, `/rooms/${roomId}/join`)).body.error.code).toBe(
      'BANNED_FROM_ROOM',
    );

    w.clock.advance(31 * MIN);
    expect((await w.post(beto.agent, `/rooms/${roomId}/join`)).status).toBe(200);

    await w
      .post(mod.agent, `/rooms/${roomId}/participants/${ids.beto}/ban`, { durationMinutes: 30 })
      .catch(() => undefined);
    await mod.agent.delete(`/api/v1/rooms/${roomId}/bans/${ids.beto}`).set('Origin', ORIGIN);
    expect(await RoomBanModel.countDocuments({ roomId })).toBe(0);
  });
});

describe('fluxo completo de uma reunião (MongoDB real)', () => {
  it('agendar -> lembretes -> abrir sozinha -> entrar -> encerrar -> relatório', async () => {
    const w = await configured();
    const admin = await w.login(ids.admin, [ADMIN_ROLE], 'Admin');
    const ana = await w.login(ids.ana, [], 'Ana');

    // O admin agenda pela API para daqui a 26 h.
    const startsAt = new Date(w.clock.now().getTime() + 26 * 60 * MIN).toISOString();
    const created = await w.post(admin.agent, '/meetings', {
      title: 'Reunião mensal',
      description: 'Pauta',
      startsAt,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(await RoomModel.findById(id).lean()).toMatchObject({
      status: 'SCHEDULED',
      type: 'MEETING',
    });
    expect(w.gateway.sent).toHaveLength(1); // o aviso
    expect((await w.post(ana.agent, `/rooms/${id}/join`)).body.error.code).toBe('ROOM_NOT_OPEN');

    // O relógio manda cada lembrete uma vez.
    w.clock.advance(2 * 60 * MIN);
    await w.meetingScheduler.tick();
    await w.meetingScheduler.tick();
    w.clock.advance(23 * 60 * MIN);
    await w.meetingScheduler.tick();
    w.clock.advance(55 * MIN);
    await w.meetingScheduler.tick();
    const reminders = w.gateway.sent.filter((m) =>
      String(m.payload.embeds[0]!.title).startsWith('⏰'),
    );
    expect(reminders).toHaveLength(3);
    expect((await RoomModel.findById(id).lean())!.reminders.every((r) => r.sentAt)).toBe(true);

    // No horário, abre sozinha.
    w.clock.advance(5 * MIN);
    await w.meetingScheduler.tick();
    expect(await RoomModel.findById(id).lean()).toMatchObject({ status: 'OPEN' });
    expect(w.gateway.edits.at(-1)!.payload.embeds[0]!.title).toContain('aberta agora');

    // Ana entra (reunião não exige call), fica 20 minutos e sai.
    expect((await w.post(ana.agent, `/rooms/${id}/join`)).status).toBe(200);
    await w.webhookCall(joined(id, ids.ana));
    w.clock.advance(20 * MIN);
    await w.webhookCall({
      event: 'participant_left',
      roomName: id,
      participant: { identity: ids.ana, name: '', metadata: '', leaveCause: 'client' },
    });

    // O admin encerra; o relatório sai do banco.
    expect((await w.post(admin.agent, `/rooms/${id}/end`)).status).toBe(204);
    const report = await admin.agent.get(`/api/v1/meetings/${id}/report`);
    expect(report.status).toBe(200);
    expect(report.body.data).toMatchObject({ durationMinutes: 20, peakParticipants: 1 });
    expect(report.body.data.attendees).toEqual([
      expect.objectContaining({ userId: ids.ana, displayName: ids.ana, minutes: 20 }),
    ]);
    const fields = w.gateway.edits.at(-1)!.payload.embeds[0]!.fields as {
      name: string;
      value: string;
    }[];
    expect(Object.fromEntries(fields.map((f) => [f.name, f.value]))).toEqual({
      Duração: '20 min',
      Participantes: '1',
      Pico: '1',
    });
  });

  it('reagendar: lembretes voltam a ser pendentes no banco', async () => {
    const w = await configured();
    const admin = await w.login(ids.admin, [ADMIN_ROLE]);
    const first = new Date(w.clock.now().getTime() + 26 * 60 * MIN).toISOString();
    const id = (
      await w.post(admin.agent, '/meetings', { title: 'Reunião mensal', startsAt: first })
    ).body.data.id as string;

    w.clock.advance(2 * 60 * MIN);
    await w.meetingScheduler.tick(); // lembrete de 24 h
    const later = new Date(w.clock.now().getTime() + 48 * 60 * MIN).toISOString();
    const res = await admin.agent
      .patch(`/api/v1/meetings/${id}`)
      .set('Origin', ORIGIN)
      .send({ startsAt: later });
    expect(res.status).toBe(200);

    const doc = await RoomModel.findById(id).lean();
    expect(doc!.startsAt!.toISOString()).toBe(later);
    expect(doc!.reminders.map((r) => [r.minutesBefore, r.sentAt])).toEqual([
      [1440, null],
      [60, null],
      [5, null],
    ]);
  });

  it('reunião abandonada é encerrada aos 15 minutos', async () => {
    const w = await configured();
    const admin = await w.login(ids.admin, [ADMIN_ROLE]);
    const id = (await w.post(admin.agent, '/meetings', { title: 'Reunião mensal' })).body.data
      .id as string;
    w.clock.advance(15 * MIN);
    await w.meetingScheduler.tick();
    expect(await RoomModel.findById(id).lean()).toMatchObject({
      status: 'ENDED',
      endReason: 'MEETING_FINISHED',
    });
  });
});

describe('configuração e papéis (MongoDB real)', () => {
  it('o admin muda os cargos pela API e o efeito aparece no login', async () => {
    const w = await configured();
    const admin = await w.login(ids.admin, [ADMIN_ROLE]);
    const ana = await w.login(ids.ana, [MOD_ROLE]);
    expect((await ana.agent.get('/api/v1/auth/me')).body.data.role).toBe('MOD');

    const res = await admin.agent
      .patch('/api/v1/settings')
      .set('Origin', ORIGIN)
      .send({ modRoleIds: [] });
    expect(res.status).toBe(200);
    expect((await GuildSettingsModel.findById(w.env.DISCORD_GUILD_ID).lean())!.modRoleIds).toEqual(
      [],
    );

    w.clock.advance(61_000);
    expect((await ana.agent.get('/api/v1/auth/me')).body.data.role).toBe('MEMBER');
  });

  it('logout apaga a sessão do banco e derruba o socket', async () => {
    const w = await configured();
    const server = await w.listen();
    const ana = await w.login(ids.ana);
    const socket = connectSocket(server, ana.cookie);
    open.push(socket);
    await new Promise<void>((res, rej) => {
      socket.once('connect', () => res());
      socket.once('connect_error', rej);
    });
    const revoked = new Promise<void>((res) => socket.once('session:revoked', () => res()));
    expect(await SessionModel.countDocuments()).toBe(1);
    await w.post(ana.agent, '/auth/logout');
    await revoked;
    expect(await SessionModel.countDocuments()).toBe(0);
    expect((await ana.agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});
