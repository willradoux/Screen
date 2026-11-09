import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { VOICE_1, VOICE_2, WEB_URL } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const MEMBER_ID = '900000000000000001';
const OTHER_ID = '900000000000000002';
const MOD_ID = '900000000000000003';
const ADMIN_ID = '900000000000000004';

/** Faz o login completo no sistema com dublês e devolve um agente autenticado. */
async function loginAs(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles, nick: `Nick ${userId.slice(-1)}` });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

const post = (agent: ReturnType<typeof request.agent>, ctx: RoomsCtx, path: string) =>
  agent.post(`/api/v1${path}`).set('Origin', ctx.origin);

/** Abre uma live com `userId` dentro do canal. */
async function openLive(ctx: RoomsCtx, userId = MEMBER_ID, channel = VOICE_1) {
  await ctx.live.handle({ userId, oldChannelId: null, newChannelId: channel });
  return [...ctx.rooms.rooms.values()].find(
    (r) => r.voiceChannelId === channel && r.status === 'OPEN',
  )!;
}

async function meeting(
  ctx: RoomsCtx,
  over: Partial<{ startsAt: Date | null; allowedRoleIds: string[]; max: number }> = {},
) {
  return ctx.rooms.createMeeting({
    guildId: ctx.env.DISCORD_GUILD_ID,
    title: 'Reunião mensal',
    description: 'Pauta',
    startsAt: over.startsAt === undefined ? null : over.startsAt,
    createdBy: ADMIN_ID,
    maxParticipants: over.max ?? 100,
    allowedRoleIds: over.allowedRoleIds ?? [],
    reminders: [],
    now: ctx.clock.now(),
  });
}

describe('POST /rooms/:id/join (lives)', () => {
  it('quem está na call recebe o token e as permissões completas', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);

    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      livekit: { url: 'ws://localhost:7880', token: 'token-1' },
      participant: { identity: MEMBER_ID, name: 'Nick 1', role: 'MEMBER' },
      permissions: {
        canPublish: true,
        canPublishSources: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
        canModerate: false,
      },
      room: { id: room.id, lectureMode: false },
    });

    // O token é pedido ao LiveKit com a identidade do Discord e papel no metadata.
    expect(ctx.livekit.ensured).toEqual([{ roomName: room.id, max: 25 }]);
    expect(ctx.livekit.tokens[0]).toMatchObject({
      roomName: room.id,
      identity: MEMBER_ID,
      name: 'Nick 1',
      canPublish: true,
      roomAdmin: false,
      ttlSeconds: 600,
    });
    expect(JSON.parse(ctx.livekit.tokens[0]!.metadata)).toEqual({
      role: 'MEMBER',
      avatarUrl: null,
    });
  });

  it('quem NÃO está na call é recusado (NOT_IN_VOICE) e nenhum token é emitido', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx, OTHER_ID);
    const agent = await loginAs(ctx, MEMBER_ID);

    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'NOT_IN_VOICE',
      details: { voiceChannelName: 'Live 1' },
    });
    expect(ctx.livekit.tokens).toHaveLength(0);
    expect(ctx.livekit.ensured).toHaveLength(0);
  });

  it('estar em OUTRO canal de voz não vale', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx, OTHER_ID);
    await ctx.live.handle({ userId: MEMBER_ID, oldChannelId: null, newChannelId: VOICE_2 });
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.body.error.code).toBe('NOT_IN_VOICE');
  });

  it('a checagem é no momento do pedido: saiu da call, perdeu o acesso', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);
    expect((await post(agent, ctx, `/rooms/${room.id}/join`)).status).toBe(200);

    await ctx.live.handle({ userId: MEMBER_ID, oldChannelId: VOICE_1, newChannelId: null });
    const again = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('NOT_IN_VOICE');
  });

  it('na live, MOD e ADMIN também precisam estar na call e não moderam; só o ADMIN recebe roomAdmin', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx, OTHER_ID);

    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);
    const refused = await post(mod, ctx, `/rooms/${room.id}/join`);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('NOT_IN_VOICE');

    await ctx.live.handle({ userId: MOD_ID, oldChannelId: null, newChannelId: VOICE_1 });
    await ctx.live.handle({ userId: ADMIN_ID, oldChannelId: null, newChannelId: VOICE_1 });
    const modRes = await post(mod, ctx, `/rooms/${room.id}/join`);
    expect(modRes.status).toBe(200);
    expect(modRes.body.data.permissions.canModerate).toBe(false);
    expect(modRes.body.data.participant.role).toBe('MOD');

    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const adminRes = await post(admin, ctx, `/rooms/${room.id}/join`);
    expect(adminRes.status).toBe(200);

    const [modTok, adminTok] = ctx.livekit.tokens;
    expect(modTok).toMatchObject({ identity: MOD_ID, roomAdmin: false });
    expect(adminTok).toMatchObject({ identity: ADMIN_ID, roomAdmin: true });
  });

  it('dono do servidor (permissão do Discord) entra como ADMIN', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx, OTHER_ID);
    await ctx.live.handle({ userId: ADMIN_ID, oldChannelId: null, newChannelId: VOICE_1 });
    ctx.gateway.permissions.set(ADMIN_ID, { isOwner: true, isAdmin: false, isMod: false });
    const agent = await loginAs(ctx, ADMIN_ID);
    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.body.data.participant.role).toBe('ADMIN');
  });

  it('sem login -> 401; sem Origin -> 403; sala inexistente ou id malformado -> 404', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    expect(
      (await request(ctx.app).post(`/api/v1/rooms/${room.id}/join`).set('Origin', ctx.origin))
        .status,
    ).toBe(401);

    const agent = await loginAs(ctx, MEMBER_ID);
    const noOrigin = await agent.post(`/api/v1/rooms/${room.id}/join`);
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body.error.code).toBe('FORBIDDEN');

    for (const id of ['x'.repeat(22), 'curto', '../../etc/passwd', 'a'.repeat(40)]) {
      const res = await post(agent, ctx, `/rooms/${encodeURIComponent(id)}/join`);
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
    }
  });

  it('sala encerrada -> 409 ROOM_NOT_OPEN', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await ctx.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_NOT_OPEN');
  });

  it('banido -> 403 BANNED_FROM_ROOM com o prazo; banimento vencido não vale', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);
    const until = new Date(ctx.clock.now().getTime() + 3600_000);
    await ctx.bans.upsert({
      roomId: room.id,
      userId: MEMBER_ID,
      bannedBy: MOD_ID,
      reason: null,
      expiresAt: until,
    });

    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'BANNED_FROM_ROOM',
      details: { expiresAt: until.toISOString() },
    });

    ctx.clock.advance(3601_000);
    expect((await post(agent, ctx, `/rooms/${room.id}/join`)).status).toBe(200);
  });

  it('sala lotada -> 409 ROOM_FULL, mas quem já está dentro pode reconectar', async () => {
    const ctx = buildRoomsApp();
    ctx.settings.settings.maxParticipantsLive = 2;
    const room = await openLive(ctx);
    await ctx.live.handle({ userId: OTHER_ID, oldChannelId: null, newChannelId: VOICE_1 });
    const third = '900000000000000010';
    await ctx.live.handle({ userId: third, oldChannelId: null, newChannelId: VOICE_1 });
    const at = ctx.clock.now();
    for (const userId of [MEMBER_ID, OTHER_ID]) {
      await ctx.participations.open({
        roomId: room.id,
        userId,
        displayName: userId,
        avatarUrl: null,
        role: 'MEMBER',
        at,
      });
    }

    const newcomer = await loginAs(ctx, third);
    const full = await post(newcomer, ctx, `/rooms/${room.id}/join`);
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('ROOM_FULL');

    const inside = await loginAs(ctx, MEMBER_ID);
    expect((await post(inside, ctx, `/rooms/${room.id}/join`)).status).toBe(200);
  });

  it('LiveKit fora do ar -> 502 LIVEKIT_UNAVAILABLE', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);
    ctx.livekit.down = true;
    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('LIVEKIT_UNAVAILABLE');
    ctx.livekit.down = false;
    expect((await post(agent, ctx, `/rooms/${room.id}/join`)).status).toBe(200);
  });

  it('modo palestra (reunião): membro não publica, palestrante e MOD publicam', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx);
    ctx.rooms.rooms.get(room.id)!.lectureMode = true;

    const member = await loginAs(ctx, MEMBER_ID);
    const res = await post(member, ctx, `/rooms/${room.id}/join`);
    expect(res.body.data.permissions).toEqual({
      canPublish: false,
      canPublishSources: [],
      canModerate: false,
    });
    expect(ctx.livekit.tokens[0]).toMatchObject({ canPublish: false, canPublishSources: [] });

    ctx.rooms.rooms.get(room.id)!.speakerIds = [MEMBER_ID];
    const speaker = await post(member, ctx, `/rooms/${room.id}/join`);
    expect(speaker.body.data.permissions.canPublish).toBe(true);

    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);
    expect((await post(mod, ctx, `/rooms/${room.id}/join`)).body.data.permissions.canPublish).toBe(
      true,
    );
  });

  it('silenciado pela moderação não publica', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await ctx.participations.open({
      roomId: room.id,
      userId: MEMBER_ID,
      displayName: 'x',
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });
    await ctx.participations.setMutedSources(room.id, MEMBER_ID, [
      'microphone',
      'camera',
      'screen_share',
      'screen_share_audio',
    ]);
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.body.data.permissions.canPublish).toBe(false);
  });

  it('limite de 20 entradas por minuto por usuário (429)', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await post(agent, ctx, `/rooms/${room.id}/join`)).status;
    expect(last).toBe(429);

    // Outro usuário não é afetado.
    const other = await loginAs(ctx, OTHER_ID);
    await ctx.live.handle({ userId: OTHER_ID, oldChannelId: null, newChannelId: VOICE_1 });
    expect((await post(other, ctx, `/rooms/${room.id}/join`)).status).toBe(200);
  });
});

describe('POST /rooms/:id/join (reuniões)', () => {
  it('não exige estar numa call; qualquer membro entra se não há restrição de cargo', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.status).toBe(200);
    expect(res.body.data.room.id).toBe(room.id);
  });

  it('restrição por cargo: sem o cargo -> ROLE_NOT_ALLOWED; com o cargo ou MOD/ADMIN -> entra', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx, { allowedRoleIds: ['601'] });

    const plain = await loginAs(ctx, MEMBER_ID);
    const denied = await post(plain, ctx, `/rooms/${room.id}/join`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ROLE_NOT_ALLOWED');

    const allowed = await loginAs(ctx, OTHER_ID, ['601']);
    expect((await post(allowed, ctx, `/rooms/${room.id}/join`)).status).toBe(200);

    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);
    expect((await post(mod, ctx, `/rooms/${room.id}/join`)).status).toBe(200);
  });

  it('reunião agendada -> 409 ROOM_NOT_OPEN com o horário de início', async () => {
    const ctx = buildRoomsApp();
    const startsAt = new Date('2026-12-05T23:00:00Z');
    const room = await meeting(ctx, { startsAt });
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await post(agent, ctx, `/rooms/${room.id}/join`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'ROOM_NOT_OPEN',
      details: { status: 'SCHEDULED', startsAt: startsAt.toISOString() },
    });
  });

  it('reunião cancelada -> ROOM_NOT_OPEN', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx, { startsAt: new Date('2026-12-05T23:00:00Z') });
    await ctx.roomService.cancelMeeting(room.id);
    const agent = await loginAs(ctx, MEMBER_ID);
    expect((await post(agent, ctx, `/rooms/${room.id}/join`)).body.error.code).toBe(
      'ROOM_NOT_OPEN',
    );
  });
});

describe('GET /rooms/:id/access', () => {
  it('diz se pode entrar e por que não, sem emitir token', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx, OTHER_ID);
    const agent = await loginAs(ctx, MEMBER_ID);

    const denied = await agent.get(`/api/v1/rooms/${room.id}/access`);
    expect(denied.status).toBe(200);
    expect(denied.body.data).toMatchObject({
      canJoin: false,
      reason: 'NOT_IN_VOICE',
      voiceChannelName: 'Live 1',
    });
    expect(denied.body.data.hint).toContain('Live 1');

    await ctx.live.handle({ userId: MEMBER_ID, oldChannelId: null, newChannelId: VOICE_1 });
    const ok = await agent.get(`/api/v1/rooms/${room.id}/access`);
    expect(ok.body.data).toEqual({ canJoin: true, reason: null, hint: null });
    expect(ctx.livekit.tokens).toHaveLength(0);
  });

  it('reunião futura traz startsAt para a contagem regressiva', async () => {
    const ctx = buildRoomsApp();
    const startsAt = new Date('2026-12-05T23:00:00Z');
    const room = await meeting(ctx, { startsAt });
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await agent.get(`/api/v1/rooms/${room.id}/access`);
    expect(res.body.data).toMatchObject({
      canJoin: false,
      reason: 'ROOM_NOT_OPEN',
      startsAt: startsAt.toISOString(),
    });
  });

  it('exige login', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    expect((await request(ctx.app).get(`/api/v1/rooms/${room.id}/access`)).status).toBe(401);
  });
});

describe('GET /rooms e /rooms/:id', () => {
  it('lista abertas e agendadas por padrão, com link e contagem', async () => {
    const ctx = buildRoomsApp();
    const live = await openLive(ctx);
    const scheduled = await meeting(ctx, { startsAt: new Date('2026-12-05T23:00:00Z') });
    const ended = await openLive(ctx, OTHER_ID, VOICE_2);
    await ctx.roomService.endRoom(ended.id, 'ENDED_BY_MOD');
    await ctx.participations.open({
      roomId: live.id,
      userId: MEMBER_ID,
      displayName: 'x',
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });

    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await agent.get('/api/v1/rooms');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(live.id);
    expect(ids).toContain(scheduled.id);
    expect(ids).not.toContain(ended.id);

    const liveDto = res.body.data.find((r: { id: string }) => r.id === live.id);
    expect(liveDto).toMatchObject({
      type: 'LIVE',
      status: 'OPEN',
      participantCount: 1,
      voiceChannelId: VOICE_1,
      url: `${WEB_URL}/r/${live.id}`,
    });
    expect(res.body.page).toEqual({ next: null, limit: 20 });
  });

  it('filtra por status e tipo', async () => {
    const ctx = buildRoomsApp();
    await openLive(ctx);
    await meeting(ctx);
    const ended = await openLive(ctx, OTHER_ID, VOICE_2);
    await ctx.roomService.endRoom(ended.id, 'ENDED_BY_MOD');

    const agent = await loginAs(ctx, MEMBER_ID);
    const onlyEnded = await agent.get('/api/v1/rooms').query({ status: 'ENDED' });
    expect(onlyEnded.body.data.map((r: { id: string }) => r.id)).toEqual([ended.id]);
    const onlyMeetings = await agent.get('/api/v1/rooms').query({ type: 'MEETING' });
    expect(onlyMeetings.body.data.every((r: { type: string }) => r.type === 'MEETING')).toBe(true);
    expect((await agent.get('/api/v1/rooms').query({ status: 'XYZ' })).status).toBe(400);
  });

  it('pagina por cursor sem repetir nem perder itens', async () => {
    const ctx = buildRoomsApp();
    for (let i = 0; i < 5; i++) {
      await meeting(ctx, { startsAt: new Date(`2026-12-0${i + 1}T23:00:00Z`) });
      ctx.clock.advance(1000);
    }
    const agent = await loginAs(ctx, MEMBER_ID);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await agent
        .get('/api/v1/rooms')
        .query({ limit: 2, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((r: { id: string }) => r.id));
      cursor = res.body.page.next;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
  });

  it('cursor inválido e limite fora da faixa -> 400', async () => {
    const ctx = buildRoomsApp();
    const agent = await loginAs(ctx, MEMBER_ID);
    expect((await agent.get('/api/v1/rooms').query({ cursor: 'lixo' })).body.error.code).toBe(
      'VALIDATION_ERROR',
    );
    expect((await agent.get('/api/v1/rooms').query({ limit: 0 })).status).toBe(400);
    expect((await agent.get('/api/v1/rooms').query({ limit: 51 })).status).toBe(400);
  });

  it('GET /rooms/:id devolve a sala; sem login -> 401', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await agent.get(`/api/v1/rooms/${room.id}`);
    expect(res.body.data).toMatchObject({ id: room.id, title: 'Live - Live 1', status: 'OPEN' });
    expect((await request(ctx.app).get(`/api/v1/rooms/${room.id}`)).status).toBe(401);
    expect((await agent.get('/api/v1/rooms/naoexiste')).body.error.code).toBe('ROOM_NOT_FOUND');
  });
});

describe('POST /rooms/:id/leave', () => {
  it('fecha a participação, derruba no LiveKit e avisa a sala; é idempotente', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await ctx.participations.open({
      roomId: room.id,
      userId: MEMBER_ID,
      displayName: 'x',
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });
    const agent = await loginAs(ctx, MEMBER_ID);

    expect((await post(agent, ctx, `/rooms/${room.id}/leave`)).status).toBe(204);
    expect(await ctx.participations.countOpen(room.id)).toBe(0);
    expect(ctx.livekit.removed).toEqual([{ roomName: room.id, identity: MEMBER_ID }]);
    expect(ctx.emitter.of('participant:left')).toHaveLength(1);
    expect(ctx.emitter.of('participant:left')[0]!.payload).toEqual({
      roomId: room.id,
      userId: MEMBER_ID,
      reason: 'LEFT',
    });

    expect((await post(agent, ctx, `/rooms/${room.id}/leave`)).status).toBe(204);
    expect(ctx.emitter.of('participant:left')).toHaveLength(1); // sem evento duplicado
  });
});

describe('POST /rooms/:id/end', () => {
  it('MEMBER não encerra', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const agent = await loginAs(ctx, MEMBER_ID);
    const res = await post(agent, ctx, `/rooms/${room.id}/end`);
    expect(res.status).toBe(403);
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('OPEN');
  });

  it('live não é encerrada pela API: termina sozinha quando a call esvazia', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);
    const res = await post(mod, ctx, `/rooms/${room.id}/end`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MODERATION_ONLY_IN_MEETINGS');
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('OPEN');
  });

  it('MOD encerra uma reunião: avisa os clientes, derruba o LiveKit, fecha participações e atualiza o embed', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx);
    await ctx.participations.open({
      roomId: room.id,
      userId: MEMBER_ID,
      displayName: 'x',
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });
    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);

    expect((await post(mod, ctx, `/rooms/${room.id}/end`)).status).toBe(204);
    expect(ctx.rooms.rooms.get(room.id)).toMatchObject({
      status: 'ENDED',
      endReason: 'ENDED_BY_MOD',
    });
    expect(ctx.emitter.of('room:ended')[0]).toMatchObject({
      target: 'room',
      id: room.id,
      payload: { roomId: room.id, reason: 'ENDED_BY_MOD' },
    });
    expect(ctx.livekit.deleted).toEqual([room.id]);
    expect(await ctx.participations.countOpen(room.id)).toBe(0);
    expect(ctx.participations.rows[0]!.leaveReason).toBe('ROOM_ENDED');
  });

  it('ADMIN encerra com o motivo ENDED_BY_ADMIN', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx);
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    expect((await post(admin, ctx, `/rooms/${room.id}/end`)).status).toBe(204);
    expect(ctx.rooms.rooms.get(room.id)!.endReason).toBe('ENDED_BY_ADMIN');
  });

  it('encerrar de novo -> 409 ROOM_ALREADY_ENDED; reunião agendada -> 409 ROOM_NOT_OPEN', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx);
    const scheduled = await meeting(ctx, { startsAt: new Date('2026-12-05T23:00:00Z') });
    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);

    await post(mod, ctx, `/rooms/${room.id}/end`);
    const again = await post(mod, ctx, `/rooms/${room.id}/end`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ROOM_ALREADY_ENDED');
    expect(ctx.emitter.of('room:ended')).toHaveLength(1);

    const sched = await post(mod, ctx, `/rooms/${scheduled.id}/end`);
    expect(sched.status).toBe(409);
    expect(sched.body.error.code).toBe('ROOM_NOT_OPEN');
  });

  it('o LiveKit fora do ar não impede o encerramento', async () => {
    const ctx = buildRoomsApp();
    const room = await meeting(ctx);
    ctx.livekit.deleteRoom = async () => {
      throw new Error('fora do ar');
    };
    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);
    expect((await post(mod, ctx, `/rooms/${room.id}/end`)).status).toBe(204);
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('ENDED');
  });
});
