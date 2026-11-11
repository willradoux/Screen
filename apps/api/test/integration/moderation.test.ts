import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, openMeeting, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const MEMBER = '940000000000000001';
const MEMBER2 = '940000000000000002';
const MOD = '940000000000000003';
const MOD2 = '940000000000000004';
const ADMIN = '940000000000000005';
const ADMIN2 = '940000000000000006';
const ALL = ['microphone', 'camera', 'screen_share', 'screen_share_audio'];

type Agent = ReturnType<typeof request.agent>;

async function loginAs(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

/** Reunião aberta (moderação só existe em reuniões), com algumas pessoas já conectadas. */
async function setup(
  people: { id: string; role?: 'MEMBER' | 'MOD' | 'ADMIN'; roles?: string[] }[] = [],
) {
  const ctx = buildRoomsApp();
  const room = await openMeeting(ctx);
  for (const p of [{ id: MEMBER }, { id: MEMBER2 }, ...people]) {
    const role = (p as { role?: 'MEMBER' | 'MOD' | 'ADMIN' }).role ?? 'MEMBER';
    const roles = (p as { roles?: string[] }).roles ?? [];
    ctx.discord.addMember(p.id, { roles });
    await ctx.participations.open({
      roomId: room.id,
      userId: p.id,
      displayName: `Nome ${p.id.slice(-1)}`,
      avatarUrl: null,
      role,
      at: ctx.clock.now(),
    });
  }
  ctx.emitter.events.length = 0;
  ctx.auditRepo.records.length = 0; // a criação da reunião não faz parte do cenário
  return { ctx, room };
}

const act = (
  agent: Agent,
  ctx: RoomsCtx,
  method: 'post' | 'delete' | 'patch',
  path: string,
  body?: unknown,
) =>
  agent[method](`/api/v1${path}`)
    .set('Origin', ctx.origin)
    .send(body as object);

const staff = {
  mod: { id: MOD, role: 'MOD' as const, roles: [MOD_ROLE] },
  mod2: { id: MOD2, role: 'MOD' as const, roles: [MOD_ROLE] },
  admin: { id: ADMIN, role: 'ADMIN' as const, roles: [ADMIN_ROLE] },
  admin2: { id: ADMIN2, role: 'ADMIN' as const, roles: [ADMIN_ROLE] },
};

describe('mutar e liberar', () => {
  it('MOD silencia tudo: bloqueia no LiveKit, avisa o alvo e a sala, e audita', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);

    const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/mute`, {
      reason: 'ruído',
    });
    expect(res.status).toBe(204);

    expect(await ctx.participations.getMutedSources(room.id, MEMBER)).toEqual(ALL);
    expect(ctx.livekit.permissions.at(-1)).toEqual({
      roomName: room.id,
      identity: MEMBER,
      canPublish: false,
      sources: [],
    });
    expect(ctx.livekit.muted.at(-1)).toEqual({ roomName: room.id, identity: MEMBER, sources: ALL });

    expect(ctx.emitter.of('moderation:action')).toEqual([
      {
        target: 'user',
        id: MEMBER,
        event: 'moderation:action',
        payload: { roomId: room.id, action: 'MUTED', by: MOD, reason: 'ruído', sources: ALL },
      },
    ]);
    expect(ctx.emitter.of('participant:updated')[0]!.payload).toEqual({
      roomId: room.id,
      userId: MEMBER,
      isSpeaker: false,
      mutedByModeration: true,
      mutedSources: ALL,
    });
    expect(ctx.auditRepo.of('PARTICIPANT_MUTED')).toMatchObject([
      { actorId: MOD, targetId: MEMBER, roomId: room.id, reason: 'ruído', meta: { sources: ALL } },
    ]);
  });

  it('silenciar só o microfone mantém câmera e tela; os silenciamentos se acumulam', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const url = `/rooms/${room.id}/participants/${MEMBER}/mute`;

    await act(mod, ctx, 'post', url, { sources: ['microphone'] });
    expect(ctx.livekit.permissions.at(-1)).toMatchObject({
      canPublish: true,
      sources: ['camera', 'screen_share', 'screen_share_audio'],
    });
    expect(ctx.livekit.muted.at(-1)!.sources).toEqual(['microphone']);

    await act(mod, ctx, 'post', url, { sources: ['camera'] });
    expect(await ctx.participations.getMutedSources(room.id, MEMBER)).toEqual([
      'microphone',
      'camera',
    ]);
    expect(ctx.livekit.permissions.at(-1)!.sources).toEqual(['screen_share', 'screen_share_audio']);
  });

  it('silenciar a tela também silencia o áudio da tela', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/mute`, {
      sources: ['screen_share'],
    });
    expect(await ctx.participations.getMutedSources(room.id, MEMBER)).toEqual([
      'screen_share',
      'screen_share_audio',
    ]);
  });

  it('quem foi silenciado e reconecta continua silenciado (token já vem sem permissão)', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/mute`);
    await ctx.participations.close(room.id, MEMBER, 'LEFT', ctx.clock.now());

    await ctx.live.handle({ userId: MEMBER, oldChannelId: null, newChannelId: VOICE_1 });
    const member = await loginAs(ctx, MEMBER);
    const join = await act(member, ctx, 'post', `/rooms/${room.id}/join`);
    expect(join.status).toBe(200);
    expect(join.body.data.permissions).toEqual({
      canPublish: false,
      canPublishSources: [],
      canModerate: false,
    });
    expect(ctx.livekit.tokens.at(-1)).toMatchObject({ canPublish: false, canPublishSources: [] });
  });

  it('liberar devolve a permissão; no modo palestra, quem não é palestrante continua sem publicar', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/mute`);

    const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/unmute`);
    expect(res.status).toBe(204);
    expect(await ctx.participations.getMutedSources(room.id, MEMBER)).toEqual([]);
    expect(ctx.livekit.permissions.at(-1)).toMatchObject({ canPublish: true, sources: ALL });
    expect(ctx.emitter.of('moderation:action').at(-1)!.payload).toMatchObject({
      action: 'UNMUTED',
    });
    expect(ctx.auditRepo.of('PARTICIPANT_UNMUTED')).toHaveLength(1);

    ctx.rooms.rooms.get(room.id)!.lectureMode = true;
    await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/mute`);
    await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/unmute`);
    expect(ctx.livekit.permissions.at(-1)).toMatchObject({ canPublish: false });
  });

  it('LiveKit fora do ar -> 502, mas o silenciamento já fica gravado (vale no próximo join)', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    ctx.livekit.down = true;
    const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/mute`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('LIVEKIT_UNAVAILABLE');
    expect(await ctx.participations.getMutedSources(room.id, MEMBER)).toEqual(ALL);
  });
});

describe('hierarquia e validações', () => {
  it('membro comum não tem nenhuma ação de moderação', async () => {
    const { ctx, room } = await setup();
    const member = await loginAs(ctx, MEMBER);
    const calls: ['post' | 'delete' | 'patch', string, unknown?][] = [
      ['post', `/rooms/${room.id}/participants/${MEMBER2}/mute`],
      ['post', `/rooms/${room.id}/participants/${MEMBER2}/unmute`],
      ['post', `/rooms/${room.id}/participants/${MEMBER2}/kick`],
      ['post', `/rooms/${room.id}/participants/${MEMBER2}/ban`],
      ['delete', `/rooms/${room.id}/bans/${MEMBER2}`],
      ['post', `/rooms/${room.id}/participants/${MEMBER2}/promote`],
      ['post', `/rooms/${room.id}/participants/${MEMBER2}/demote`],
      ['patch', `/rooms/${room.id}`, { lectureMode: true }],
    ];
    for (const [method, path, body] of calls) {
      const res = await act(member, ctx, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(ctx.auditRepo.records).toHaveLength(0);
    expect(ctx.livekit.permissions).toHaveLength(0);
  });

  it('MOD não age sobre MOD nem ADMIN; ADMIN não age sobre ADMIN; ADMIN age sobre MOD', async () => {
    const { ctx, room } = await setup([staff.mod2, staff.admin2]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);

    for (const target of [MOD2, ADMIN2]) {
      const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${target}/kick`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('HIERARCHY_VIOLATION');
    }
    const adminOnAdmin = await act(
      admin,
      ctx,
      'post',
      `/rooms/${room.id}/participants/${ADMIN2}/mute`,
    );
    expect(adminOnAdmin.body.error.code).toBe('HIERARCHY_VIOLATION');

    expect(
      (await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MOD2}/mute`)).status,
    ).toBe(204);
    expect(await ctx.participations.findOpen(room.id, MOD2)).not.toBeNull();
  });

  it('o papel atual conta, não o do momento da entrada (foi promovido a MOD depois de entrar)', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    ctx.discord.addMember(MEMBER2, { roles: [MOD_ROLE] }); // virou MOD enquanto estava na sala
    const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER2}/kick`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HIERARCHY_VIOLATION');
  });

  it('o dono do servidor não pode ser moderado nem por ADMIN', async () => {
    const { ctx, room } = await setup();
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    ctx.gateway.permissions.set(MEMBER2, { isOwner: true, isAdmin: false, isMod: false });
    const res = await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER2}/ban`);
    expect(res.body.error.code).toBe('HIERARCHY_VIOLATION');
    expect(ctx.bans.bans).toHaveLength(0);
  });

  it('ninguém age sobre si mesmo (CANNOT_TARGET_SELF)', async () => {
    const { ctx, room } = await setup([staff.mod]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    for (const action of ['mute', 'unmute', 'kick', 'ban']) {
      const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MOD}/${action}`);
      expect(res.status, action).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_TARGET_SELF');
    }
  });

  it('alvo que não está conectado -> 404 PARTICIPANT_NOT_IN_ROOM', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    for (const action of ['mute', 'kick', 'ban', 'promote']) {
      const res = await act(
        action === 'promote' ? admin : mod,
        ctx,
        'post',
        `/rooms/${room.id}/participants/940000000000000099/${action}`,
      );
      expect(res.status, action).toBe(404);
      expect(res.body.error.code).toBe('PARTICIPANT_NOT_IN_ROOM');
    }
  });

  it('sala encerrada -> 409; sala inexistente ou id malformado -> 404', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    await ctx.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    expect(
      (await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/kick`)).body.error
        .code,
    ).toBe('ROOM_NOT_OPEN');

    const missing = await act(
      mod,
      ctx,
      'post',
      `/rooms/${'x'.repeat(22)}/participants/${MEMBER}/kick`,
    );
    expect(missing.body.error.code).toBe('ROOM_NOT_FOUND');
    const malformed = await act(mod, ctx, 'post', `/rooms/curto/participants/${MEMBER}/kick`);
    expect(malformed.status).toBe(404);
  });

  it('entradas inválidas -> 400 VALIDATION_ERROR', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const bad = async (path: string, body?: unknown) =>
      (await act(mod, ctx, 'post', path, body)).body.error?.code;

    expect(await bad(`/rooms/${room.id}/participants/abc/kick`)).toBe('VALIDATION_ERROR');
    expect(
      await bad(`/rooms/${room.id}/participants/${MEMBER}/mute`, { sources: ['webcam'] }),
    ).toBe('VALIDATION_ERROR');
    expect(await bad(`/rooms/${room.id}/participants/${MEMBER}/mute`, { sources: [] })).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      await bad(`/rooms/${room.id}/participants/${MEMBER}/kick`, { reason: 'x'.repeat(201) }),
    ).toBe('VALIDATION_ERROR');
    expect(await bad(`/rooms/${room.id}/participants/${MEMBER}/kick`, { extra: 1 })).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      await bad(`/rooms/${room.id}/participants/${MEMBER}/ban`, { durationMinutes: 1441 }),
    ).toBe('VALIDATION_ERROR');
    expect(await bad(`/rooms/${room.id}/participants/${MEMBER}/ban`, { durationMinutes: -1 })).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      await bad(`/rooms/${room.id}/participants/${MEMBER}/ban`, { durationMinutes: 1.5 }),
    ).toBe('VALIDATION_ERROR');
    expect(ctx.auditRepo.records).toHaveLength(0);
  });

  it('exige login e Origin', async () => {
    const { ctx, room } = await setup();
    const url = `/api/v1/rooms/${room.id}/participants/${MEMBER}/kick`;
    expect((await request(ctx.app).post(url).set('Origin', ctx.origin)).status).toBe(401);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const noOrigin = await mod.post(url);
    expect(noOrigin.status).toBe(403);
    expect(await ctx.participations.findOpen(room.id, MEMBER)).not.toBeNull();
  });

  it('limite de 60 ações por minuto por usuário', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    let last = 0;
    for (let i = 0; i < 61; i++) {
      last = (await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/unmute`))
        .status;
    }
    expect(last).toBe(429);
  });

  it('falha ao gravar a auditoria não desfaz a ação', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    ctx.auditRepo.failNext = true;
    const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/kick`);
    expect(res.status).toBe(204);
    expect(await ctx.participations.findOpen(room.id, MEMBER)).toBeNull();
    expect(ctx.auditRepo.records).toHaveLength(0);
  });
});

describe('expulsar', () => {
  it('remove da sala e do LiveKit, avisa e audita; a pessoa pode voltar', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);

    const res = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/kick`, {
      reason: 'spam',
    });
    expect(res.status).toBe(204);

    expect(await ctx.participations.findOpen(room.id, MEMBER)).toBeNull();
    expect(ctx.participations.rows.find((r) => r.userId === MEMBER)!.leaveReason).toBe('KICKED');
    expect(ctx.livekit.removed).toContainEqual({ roomName: room.id, identity: MEMBER });
    expect(ctx.emitter.of('participant:left')[0]!.payload).toEqual({
      roomId: room.id,
      userId: MEMBER,
      reason: 'KICKED',
    });
    expect(ctx.emitter.of('moderation:action')[0]).toMatchObject({
      id: MEMBER,
      payload: { action: 'KICKED', by: MOD, reason: 'spam' },
    });
    expect(ctx.auditRepo.of('PARTICIPANT_KICKED')).toMatchObject([
      { actorId: MOD, targetId: MEMBER, reason: 'spam' },
    ]);

    // expulsar não é banir: continua na call, então pode entrar de novo
    const member = await loginAs(ctx, MEMBER);
    expect((await act(member, ctx, 'post', `/rooms/${room.id}/join`)).status).toBe(200);
  });
});

describe('banir e desbanir', () => {
  it('padrão de 60 minutos: remove, barra a volta e libera depois do prazo', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const member = await loginAs(ctx, MEMBER);

    expect(
      (
        await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/ban`, {
          reason: 'assédio',
        })
      ).status,
    ).toBe(204);
    const expiresAt = new Date(ctx.clock.now().getTime() + 3600_000);
    expect(ctx.bans.bans[0]).toMatchObject({
      roomId: room.id,
      userId: MEMBER,
      bannedBy: MOD,
      reason: 'assédio',
      expiresAt,
    });
    expect(ctx.participations.rows.find((r) => r.userId === MEMBER)!.leaveReason).toBe('BANNED');
    expect(ctx.emitter.of('moderation:action')[0]!.payload).toMatchObject({
      action: 'BANNED',
      expiresAt: expiresAt.toISOString(),
    });
    expect(ctx.auditRepo.of('PARTICIPANT_BANNED')[0]!.meta).toMatchObject({ durationMinutes: 60 });

    const denied = await act(member, ctx, 'post', `/rooms/${room.id}/join`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('BANNED_FROM_ROOM');

    ctx.clock.advance(3601_000);
    expect((await act(member, ctx, 'post', `/rooms/${room.id}/join`)).status).toBe(200);
  });

  it('duração personalizada; 0 (até o fim da sala) é só para ADMIN', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);

    await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/ban`, {
      durationMinutes: 5,
    });
    expect(ctx.bans.bans[0]!.expiresAt).toEqual(new Date(ctx.clock.now().getTime() + 5 * 60_000));

    const forbidden = await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER2}/ban`, {
      durationMinutes: 0,
    });
    expect(forbidden.status).toBe(403);
    expect(await ctx.participations.findOpen(room.id, MEMBER2)).not.toBeNull();

    expect(
      (
        await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER2}/ban`, {
          durationMinutes: 0,
        })
      ).status,
    ).toBe(204);
    expect(ctx.bans.bans.find((b) => b.userId === MEMBER2)!.expiresAt).toBeNull();
    ctx.clock.advance(7 * 86_400_000);
    expect(await ctx.bans.find(room.id, MEMBER2, ctx.clock.now())).not.toBeNull();
  });

  it('desbanir libera na hora, é idempotente e audita', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const member = await loginAs(ctx, MEMBER);
    await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/ban`);
    expect((await act(member, ctx, 'post', `/rooms/${room.id}/join`)).status).toBe(403);

    expect((await act(mod, ctx, 'delete', `/rooms/${room.id}/bans/${MEMBER}`)).status).toBe(204);
    expect((await act(member, ctx, 'post', `/rooms/${room.id}/join`)).status).toBe(200);
    expect((await act(mod, ctx, 'delete', `/rooms/${room.id}/bans/${MEMBER}`)).status).toBe(204);
    expect(ctx.auditRepo.of('BAN_REMOVED')).toHaveLength(2);
    expect(ctx.auditRepo.of('BAN_REMOVED')[0]).toMatchObject({ actorId: MOD, targetId: MEMBER });
  });
});

describe('palestrantes e modo palestra', () => {
  it('promover e rebaixar atualizam a sala e auditam', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);

    expect(
      (await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/promote`)).status,
    ).toBe(204);
    expect(ctx.rooms.rooms.get(room.id)!.speakerIds).toEqual([MEMBER]);
    expect(ctx.emitter.of('participant:updated')[0]!.payload).toMatchObject({
      userId: MEMBER,
      isSpeaker: true,
    });
    expect(ctx.auditRepo.of('SPEAKER_PROMOTED')).toHaveLength(1);
    expect(ctx.auditRepo.of('SPEAKER_PROMOTED')[0]).toMatchObject({ actorId: ADMIN });

    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/demote`);
    expect(ctx.rooms.rooms.get(room.id)!.speakerIds).toEqual([]);
    expect(ctx.emitter.of('participant:updated').at(-1)!.payload).toMatchObject({
      isSpeaker: false,
    });
    expect(ctx.auditRepo.of('SPEAKER_DEMOTED')).toHaveLength(1);
  });

  it('promover duas vezes não duplica', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/promote`);
    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/promote`);
    expect(ctx.rooms.rooms.get(room.id)!.speakerIds).toEqual([MEMBER]);
  });

  it('ligar o modo palestra tira a permissão de quem não é palestrante (e só deles)', async () => {
    const { ctx, room } = await setup([staff.mod2, staff.admin]);
    await ctx.rooms.updateSpeakers(room.id, 'add', MEMBER2);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);

    const res = await act(mod, ctx, 'patch', `/rooms/${room.id}`, { lectureMode: true });
    expect(res.status).toBe(200);
    expect(res.body.data.lectureMode).toBe(true);

    const byUser = Object.fromEntries(
      ctx.livekit.permissions.map((p) => [p.identity, p.canPublish]),
    );
    expect(byUser[MEMBER]).toBe(false);
    expect(byUser[MEMBER2]).toBe(true); // palestrante
    expect(byUser[MOD2]).toBe(false); // nem a moderação transmite no palco por padrão

    expect(ctx.emitter.of('room:updated')[0]).toMatchObject({
      id: room.id,
      payload: { roomId: room.id, changes: { lectureMode: true } },
    });
    expect(ctx.auditRepo.of('ROOM_UPDATED')[0]).toMatchObject({
      actorId: MOD,
      meta: { changes: { lectureMode: true } },
    });
  });

  it('travar a tela tira só a tela de quem não está no palco; câmera e mic seguem', async () => {
    const { ctx, room } = await setup([staff.mod2, staff.admin]);
    await ctx.rooms.updateSpeakers(room.id, 'add', MEMBER2);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);

    const res = await act(mod, ctx, 'patch', `/rooms/${room.id}`, { screenLock: true });
    expect(res.status).toBe(200);
    expect(res.body.data.screenLock).toBe(true);

    const last = (id: string) => ctx.livekit.permissions.filter((p) => p.identity === id).at(-1)!;
    expect(last(MEMBER).canPublish).toBe(true);
    expect([...last(MEMBER).sources].sort()).toEqual(['camera', 'microphone']);
    expect([...last(MOD2).sources].sort()).toEqual(['camera', 'microphone']);
    expect(last(MEMBER2).sources).toContain('screen_share'); // no palco
  });

  it('com a tela travada, subir ao palco libera a tela e descer tira de novo', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    await act(mod, ctx, 'patch', `/rooms/${room.id}`, { screenLock: true });

    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/promote`);
    expect(ctx.livekit.permissions.at(-1)).toMatchObject({ identity: MEMBER });
    expect(ctx.livekit.permissions.at(-1)!.sources).toContain('screen_share');
    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/demote`);
    expect(ctx.livekit.permissions.at(-1)!.sources).not.toContain('screen_share');
  });

  it('destaque para todos: só admin muda; moderador leva 403', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);

    expect(
      (await act(mod, ctx, 'patch', `/rooms/${room.id}`, { spotlightId: MEMBER })).status,
    ).toBe(403);
    const ok = await act(admin, ctx, 'patch', `/rooms/${room.id}`, { spotlightId: MEMBER });
    expect(ok.status).toBe(200);
    expect(ok.body.data.spotlightId).toBe(MEMBER);
    expect(ctx.emitter.of('room:updated').at(-1)).toMatchObject({
      payload: { changes: { spotlightId: MEMBER } },
    });
    const cleared = await act(admin, ctx, 'patch', `/rooms/${room.id}`, { spotlightId: null });
    expect(cleared.body.data.spotlightId).toBeNull();
  });

  it('desligar o modo palestra devolve a permissão; repetir o mesmo valor não faz nada', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    await act(mod, ctx, 'patch', `/rooms/${room.id}`, { lectureMode: true });
    ctx.livekit.permissions.length = 0;

    await act(mod, ctx, 'patch', `/rooms/${room.id}`, { lectureMode: true });
    expect(ctx.livekit.permissions).toHaveLength(0);

    await act(mod, ctx, 'patch', `/rooms/${room.id}`, { lectureMode: false });
    expect(ctx.livekit.permissions.every((p) => p.canPublish)).toBe(true);
    expect(ctx.livekit.permissions.length).toBeGreaterThan(0);
  });

  it('no modo palestra, promover liga e rebaixar desliga na hora', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    await act(mod, ctx, 'patch', `/rooms/${room.id}`, { lectureMode: true });
    ctx.livekit.permissions.length = 0;

    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/promote`);
    expect(ctx.livekit.permissions.at(-1)).toMatchObject({ identity: MEMBER, canPublish: true });
    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/demote`);
    expect(ctx.livekit.permissions.at(-1)).toMatchObject({ identity: MEMBER, canPublish: false });
  });

  it('o admin sobe a si mesmo ao palco; moderador não consegue subir ninguém', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    await act(admin, ctx, 'patch', `/rooms/${room.id}`, { lectureMode: true });
    ctx.livekit.permissions.length = 0;

    expect(
      (await act(mod, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/promote`)).status,
    ).toBe(403);
    expect(
      (await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${ADMIN}/promote`)).status,
    ).toBe(204);
    expect(ctx.rooms.rooms.get(room.id)!.speakerIds).toEqual([ADMIN]);
    expect(ctx.livekit.permissions.at(-1)).toMatchObject({ identity: ADMIN, canPublish: true });
  });

  it('admin não muda outro admin no palco (nem sobe, nem tira); a si mesmo pode', async () => {
    const { ctx, room } = await setup([staff.admin, staff.admin2]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    await act(admin, ctx, 'patch', `/rooms/${room.id}`, { lectureMode: true });

    const promote = await act(
      admin,
      ctx,
      'post',
      `/rooms/${room.id}/participants/${ADMIN2}/promote`,
    );
    expect(promote.status).toBe(403);
    expect(ctx.rooms.rooms.get(room.id)!.speakerIds).toEqual([]);

    const admin2 = await loginAs(ctx, ADMIN2, [ADMIN_ROLE]);
    await act(admin2, ctx, 'post', `/rooms/${room.id}/participants/${ADMIN2}/promote`);
    expect(ctx.rooms.rooms.get(room.id)!.speakerIds).toEqual([ADMIN2]);
    const demote = await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${ADMIN2}/demote`);
    expect(demote.status).toBe(403);
    expect(ctx.rooms.rooms.get(room.id)!.speakerIds).toEqual([ADMIN2]);
  });

  it('fora do modo palestra, promover não mexe nas permissões', async () => {
    const { ctx, room } = await setup([staff.admin]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    await act(admin, ctx, 'post', `/rooms/${room.id}/participants/${MEMBER}/promote`);
    expect(ctx.livekit.permissions).toHaveLength(0);
  });
});

describe('PATCH /rooms/:id (edição)', () => {
  it('título, descrição e capacidade são só de ADMIN e atualizam o embed', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);

    expect(
      (await act(mod, ctx, 'patch', `/rooms/${room.id}`, { title: 'Novo título' })).status,
    ).toBe(403);
    expect(
      (await act(mod, ctx, 'patch', `/rooms/${room.id}`, { maxParticipants: 10 })).status,
    ).toBe(403);

    const res = await act(admin, ctx, 'patch', `/rooms/${room.id}`, {
      title: 'Novo título',
      description: 'Pauta',
      maxParticipants: 10,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: 'Novo título',
      description: 'Pauta',
      maxParticipants: 10,
    });
    expect(ctx.roomChanges).toEqual([room.id]);
    expect(ctx.auditRepo.of('ROOM_UPDATED')[0]!.meta).toEqual({
      changes: { title: 'Novo título', description: 'Pauta', maxParticipants: 10 },
    });

    const cleared = await act(admin, ctx, 'patch', `/rooms/${room.id}`, { description: null });
    expect(cleared.body.data.description).toBeNull();
  });

  it('MOD que mistura modo palestra com título é recusado por inteiro (nada é aplicado)', async () => {
    const { ctx, room } = await setup();
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    const res = await act(mod, ctx, 'patch', `/rooms/${room.id}`, {
      lectureMode: true,
      title: 'Outro título',
    });
    expect(res.status).toBe(403);
    expect(ctx.rooms.rooms.get(room.id)!.lectureMode).toBe(false);
    expect(ctx.livekit.permissions).toHaveLength(0);
  });

  it('valida os campos', async () => {
    const { ctx, room } = await setup();
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    for (const body of [
      {},
      { title: 'ab' },
      { maxParticipants: 1 },
      { maxParticipants: 501 },
      { lectureMode: 'sim' },
      { outro: 1 },
    ]) {
      const res = await act(admin, ctx, 'patch', `/rooms/${room.id}`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('sala encerrada ou cancelada não pode ser editada', async () => {
    const { ctx, room } = await setup();
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    await ctx.roomService.endRoom(room.id, 'ENDED_BY_ADMIN');
    expect(
      (await act(admin, ctx, 'patch', `/rooms/${room.id}`, { title: 'Novo título' })).body.error
        .code,
    ).toBe('ROOM_NOT_OPEN');
  });

  it('reunião agendada pode ser editada', async () => {
    const { ctx } = await setup();
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    const m = await ctx.rooms.createMeeting({
      guildId: ctx.env.DISCORD_GUILD_ID,
      title: 'Mensal',
      description: null,
      startsAt: new Date('2026-12-05T23:00:00Z'),
      createdBy: ADMIN,
      maxParticipants: 100,
      allowedRoleIds: [],
      reminders: [],
      now: ctx.clock.now(),
    });
    const res = await act(admin, ctx, 'patch', `/rooms/${m.id}`, { title: 'Mensal de dezembro' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Mensal de dezembro');
  });
});

describe('GET /rooms/:id/participants', () => {
  it('quem está na sala vê a lista, com silenciamento e palestrantes', async () => {
    const { ctx, room } = await setup();
    await ctx.participations.setMutedSources(room.id, MEMBER2, ['camera']);
    await ctx.rooms.updateSpeakers(room.id, 'add', MEMBER);
    const member = await loginAs(ctx, MEMBER);

    const res = await member.get(`/api/v1/rooms/${room.id}/participants`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const byId = Object.fromEntries(res.body.data.map((p: { userId: string }) => [p.userId, p]));
    expect(byId[MEMBER]).toMatchObject({
      isSpeaker: true,
      mutedByModeration: false,
      displayName: 'Nome 1',
    });
    expect(byId[MEMBER2]).toMatchObject({
      isSpeaker: false,
      mutedByModeration: true,
      mutedSources: ['camera'],
    });
  });

  it('de fora da call: negado; MOD vê mesmo fora; sem login: 401', async () => {
    const { ctx, room } = await setup();
    // Reunião restrita a um cargo que o visitante não tem.
    ctx.rooms.rooms.get(room.id)!.allowedRoleIds = ['650000000000000009'];
    const outsider = await loginAs(ctx, '940000000000000050');
    expect((await outsider.get(`/api/v1/rooms/${room.id}/participants`)).status).toBe(403);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    expect((await mod.get(`/api/v1/rooms/${room.id}/participants`)).status).toBe(200);
    expect((await request(ctx.app).get(`/api/v1/rooms/${room.id}/participants`)).status).toBe(401);
    expect((await mod.get('/api/v1/rooms/curto/participants')).status).toBe(404);
  });
});
