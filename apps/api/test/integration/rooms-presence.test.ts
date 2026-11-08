import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { MOD_ROLE } from '../fixtures/fakes.js';
import { VOICE_1, VOICE_2 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const USER = '920000000000000001';
const FRIEND = '920000000000000002';
const MOD = '920000000000000003';

const meta = (role: string) => JSON.stringify({ role, avatarUrl: null });

/** Entra na call, abre a live, conecta no LiveKit (webhook) e devolve a sala. */
async function connected(ctx: RoomsCtx, userId = USER, role = 'MEMBER') {
  await ctx.live.handle({ userId, oldChannelId: null, newChannelId: VOICE_1 });
  const room = [...ctx.rooms.rooms.values()].find(
    (r) => r.voiceChannelId === VOICE_1 && r.status === 'OPEN',
  )!;
  const { body, auth } = ctx.sendWebhook({
    event: 'participant_joined',
    roomName: room.id,
    participant: { identity: userId, name: userId, metadata: meta(role), leaveCause: 'other' },
  });
  await request(ctx.app).post('/api/v1/livekit/webhook').set('Authorization', auth).send(body);
  return room;
}

const leaveVoice = (ctx: RoomsCtx, userId = USER, from = VOICE_1) =>
  ctx.live.handle({ userId, oldChannelId: from, newChannelId: null });

describe('tolerância ao sair da call', () => {
  it('avisa com voice:warning e remove da live depois de graceSeconds (30 s)', async () => {
    const ctx = buildRoomsApp();
    const room = await connected(ctx);
    await connected(ctx, FRIEND); // outra pessoa mantém o canal ocupado

    await leaveVoice(ctx);
    expect(ctx.emitter.of('voice:warning')).toEqual([
      {
        target: 'user',
        id: USER,
        event: 'voice:warning',
        payload: { roomId: room.id, secondsLeft: 30 },
      },
    ]);

    await ctx.scheduler.advance(29_000);
    expect(ctx.livekit.removed).toHaveLength(0);
    expect(await ctx.participations.findOpen(room.id, USER)).not.toBeNull();

    await ctx.scheduler.advance(1_000);
    expect(ctx.livekit.removed).toEqual([{ roomName: room.id, identity: USER }]);
    expect(await ctx.participations.findOpen(room.id, USER)).toBeNull();
    expect(ctx.participations.rows.find((r) => r.userId === USER)!.leaveReason).toBe('LEFT_VOICE');
    expect(ctx.emitter.of('participant:left')[0]!.payload).toEqual({
      roomId: room.id,
      userId: USER,
      reason: 'LEFT_VOICE',
    });
    // Quem ficou não é afetado.
    expect(await ctx.participations.findOpen(room.id, FRIEND)).not.toBeNull();
  });

  it('respeita o graceSeconds configurado', async () => {
    const ctx = buildRoomsApp({ graceSeconds: 10 });
    await connected(ctx);
    await connected(ctx, FRIEND);
    await leaveVoice(ctx);
    expect(ctx.emitter.of('voice:warning')[0]!.payload).toMatchObject({ secondsLeft: 10 });
    await ctx.scheduler.advance(10_000);
    expect(ctx.livekit.removed).toHaveLength(1);
  });

  it('voltar ao canal dentro da tolerância cancela a remoção e avisa com voice:restored', async () => {
    const ctx = buildRoomsApp();
    const room = await connected(ctx);
    await connected(ctx, FRIEND);

    await leaveVoice(ctx);
    await ctx.scheduler.advance(20_000);
    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    expect(ctx.emitter.of('voice:restored')).toEqual([
      { target: 'user', id: USER, event: 'voice:restored', payload: { roomId: room.id } },
    ]);

    await ctx.scheduler.advance(60_000);
    expect(ctx.livekit.removed).toHaveLength(0);
    expect(await ctx.participations.findOpen(room.id, USER)).not.toBeNull();
  });

  it('sair e voltar duas vezes não deixa timer pendente nem remove por engano', async () => {
    const ctx = buildRoomsApp();
    await connected(ctx);
    await connected(ctx, FRIEND);
    for (let i = 0; i < 3; i++) {
      await leaveVoice(ctx);
      await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    }
    await ctx.scheduler.advance(120_000);
    expect(ctx.livekit.removed).toHaveLength(0);
  });

  it('MOD pode sair da call sem ser removido (modera sem estar na call)', async () => {
    const ctx = buildRoomsApp();
    const room = await connected(ctx, MOD, 'MOD');
    await connected(ctx, FRIEND);
    await leaveVoice(ctx, MOD);
    await ctx.scheduler.advance(120_000);
    expect(ctx.emitter.of('voice:warning')).toHaveLength(0);
    expect(await ctx.participations.findOpen(room.id, MOD)).not.toBeNull();
  });

  it('quem estava na call mas nunca conectou no LiveKit não gera aviso', async () => {
    const ctx = buildRoomsApp();
    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    await ctx.live.handle({ userId: FRIEND, oldChannelId: null, newChannelId: VOICE_1 });
    await leaveVoice(ctx);
    expect(ctx.emitter.of('voice:warning')).toHaveLength(0);
  });

  it('saiu por conta própria do LiveKit durante a tolerância: nada de remoção duplicada', async () => {
    const ctx = buildRoomsApp();
    const room = await connected(ctx);
    await connected(ctx, FRIEND);
    await leaveVoice(ctx);

    const { body, auth } = ctx.sendWebhook({
      event: 'participant_left',
      roomName: room.id,
      participant: { identity: USER, name: '', metadata: '', leaveCause: 'client' },
    });
    await request(ctx.app).post('/api/v1/livekit/webhook').set('Authorization', auth).send(body);

    await ctx.scheduler.advance(60_000);
    expect(ctx.livekit.removed).toHaveLength(0);
    expect(ctx.emitter.of('participant:left')).toHaveLength(1);
  });

  it('trocar para outro canal de live não mantém a pessoa na live anterior', async () => {
    const ctx = buildRoomsApp();
    const room1 = await connected(ctx);
    await connected(ctx, FRIEND);
    await ctx.live.handle({ userId: USER, oldChannelId: VOICE_1, newChannelId: VOICE_2 });
    await ctx.scheduler.advance(30_000);
    expect(await ctx.participations.findOpen(room1.id, USER)).toBeNull();
    expect(ctx.livekit.removed).toContainEqual({ roomName: room1.id, identity: USER });
  });

  it('depois de removida, a pessoa não consegue entrar de novo sem voltar à call', async () => {
    const ctx = buildRoomsApp();
    const room = await connected(ctx);
    await connected(ctx, FRIEND);

    ctx.discord.addMember(USER);
    const agent = request.agent(ctx.app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${USER}`, state });

    await leaveVoice(ctx);
    await ctx.scheduler.advance(30_000);

    const res = await agent.post(`/api/v1/rooms/${room.id}/join`).set('Origin', ctx.origin);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_IN_VOICE');

    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    expect(
      (await agent.post(`/api/v1/rooms/${room.id}/join`).set('Origin', ctx.origin)).status,
    ).toBe(200);
  });
});

describe('encerramento da sala', () => {
  it('canal vazio por 60 s: avisa room:ended, derruba o LiveKit e fecha as participações', async () => {
    const ctx = buildRoomsApp();
    const room = await connected(ctx);
    await leaveVoice(ctx);

    await ctx.scheduler.advance(60_000);
    expect(ctx.rooms.rooms.get(room.id)).toMatchObject({
      status: 'ENDED',
      endReason: 'VOICE_EMPTY',
    });
    expect(ctx.emitter.of('room:ended')[0]).toMatchObject({
      id: room.id,
      payload: { roomId: room.id, reason: 'VOICE_EMPTY' },
    });
    expect(ctx.livekit.deleted).toEqual([room.id]);
    expect(await ctx.participations.countOpen(room.id)).toBe(0);
  });

  it('o encerramento cancela as contagens regressivas pendentes (sem remoção tardia)', async () => {
    const ctx = buildRoomsApp({ graceSeconds: 600 });
    const room = await connected(ctx);
    await leaveVoice(ctx);
    expect(ctx.emitter.of('voice:warning')).toHaveLength(1);

    await ctx.scheduler.advance(60_000); // sala encerra por canal vazio
    ctx.livekit.removed.length = 0;
    await ctx.scheduler.advance(600_000);
    expect(ctx.livekit.removed).toHaveLength(0);
    expect(ctx.participations.rows.find((r) => r.roomId === room.id)!.leaveReason).toBe(
      'ROOM_ENDED',
    );
  });

  it('moderador pode encerrar pela API mesmo fora da call', async () => {
    const ctx = buildRoomsApp();
    const room = await connected(ctx);
    ctx.discord.addMember(MOD, { roles: [MOD_ROLE] });
    const agent = request.agent(ctx.app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${MOD}`, state });
    expect(
      (await agent.post(`/api/v1/rooms/${room.id}/end`).set('Origin', ctx.origin)).status,
    ).toBe(204);
    expect(ctx.emitter.of('room:ended')).toHaveLength(1);
  });
});
