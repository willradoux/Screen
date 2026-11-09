import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { buildRoomsApp, openMeeting, type RoomsCtx } from '../fixtures/rooms-fakes.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';

const ANA = '993000000000000001';
const BETO = '993000000000000002';
const MOD = '993000000000000003';

type Agent = ReturnType<typeof request.agent>;

async function login(ctx: RoomsCtx, id: string, roles: string[] = []) {
  ctx.discord.addMember(id, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${id}`, state });
  return agent;
}
const call = (a: Agent, ctx: RoomsCtx, method: 'post' | 'delete', path: string) =>
  a[method](`/api/v1${path}`).set('Origin', ctx.origin).send();

async function setup() {
  const ctx = buildRoomsApp();
  const room = await openMeeting(ctx);
  for (const id of [ANA, BETO]) {
    await ctx.participations.open({
      roomId: room.id,
      userId: id,
      displayName: `Nome ${id.slice(-1)}`,
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });
  }
  ctx.emitter.events.length = 0;
  return { ctx, room };
}

describe('pedir a palavra', () => {
  it('levantar a mão entra na fila por ordem e avisa a sala', async () => {
    const { ctx, room } = await setup();
    const ana = await login(ctx, ANA);
    const beto = await login(ctx, BETO);
    expect((await call(beto, ctx, 'post', `/rooms/${room.id}/hand`)).status).toBe(204);
    ctx.clock.advance(5_000);
    expect((await call(ana, ctx, 'post', `/rooms/${room.id}/hand`)).status).toBe(204);

    const mod = await login(ctx, MOD, [MOD_ROLE]);
    const list = await mod.get(`/api/v1/rooms/${room.id}/hands`);
    expect(list.body.data.map((h: { userId: string }) => h.userId)).toEqual([BETO, ANA]);
    expect(ctx.emitter.of('hand:updated')).toHaveLength(2);
  });

  it('levantar de novo mantém a posição; abaixar tira da fila', async () => {
    const { ctx, room } = await setup();
    const ana = await login(ctx, ANA);
    const beto = await login(ctx, BETO);
    await call(ana, ctx, 'post', `/rooms/${room.id}/hand`);
    await call(beto, ctx, 'post', `/rooms/${room.id}/hand`);
    await call(ana, ctx, 'post', `/rooms/${room.id}/hand`); // de novo
    const mod = await login(ctx, MOD, [MOD_ROLE]);
    expect((await mod.get(`/api/v1/rooms/${room.id}/hands`)).body.data[0].userId).toBe(ANA);

    await call(ana, ctx, 'delete', `/rooms/${room.id}/hand`);
    const after = await mod.get(`/api/v1/rooms/${room.id}/hands`);
    expect(after.body.data.map((h: { userId: string }) => h.userId)).toEqual([BETO]);
  });

  it('membro só vê a própria mão; moderação vê a fila inteira', async () => {
    const { ctx, room } = await setup();
    const ana = await login(ctx, ANA);
    const beto = await login(ctx, BETO);
    await call(ana, ctx, 'post', `/rooms/${room.id}/hand`);
    await call(beto, ctx, 'post', `/rooms/${room.id}/hand`);
    const seen = await ana.get(`/api/v1/rooms/${room.id}/hands`);
    expect(seen.body.data.map((h: { userId: string }) => h.userId)).toEqual([ANA]);
  });

  it('quem recebe a palavra (vira palestrante) sai da fila', async () => {
    const { ctx, room } = await setup();
    const ana = await login(ctx, ANA);
    await call(ana, ctx, 'post', `/rooms/${room.id}/hand`);
    const admin = await login(ctx, '993000000000000009', [ADMIN_ROLE]);
    expect(
      (await call(admin, ctx, 'post', `/rooms/${room.id}/participants/${ANA}/promote`)).status,
    ).toBe(204);
    expect((await admin.get(`/api/v1/rooms/${room.id}/hands`)).body.data).toEqual([]);
  });

  it('quem saiu da sala some da fila', async () => {
    const { ctx, room } = await setup();
    const ana = await login(ctx, ANA);
    await call(ana, ctx, 'post', `/rooms/${room.id}/hand`);
    await ctx.participations.close(room.id, ANA, 'LEFT', ctx.clock.now());
    const admin = await login(ctx, '993000000000000009', [ADMIN_ROLE]);
    expect((await admin.get(`/api/v1/rooms/${room.id}/hands`)).body.data).toEqual([]);
  });

  it('quem não está na sala recebe explicação; live não tem fila', async () => {
    const { ctx, room } = await setup();
    const outsider = await login(ctx, '993000000000000008');
    const res = await call(outsider, ctx, 'post', `/rooms/${room.id}/hand`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARTICIPANT_NOT_IN_ROOM');

    ctx.configureLives();
    await ctx.live.handle({ userId: ANA, oldChannelId: null, newChannelId: VOICE_1 });
    const live = [...ctx.rooms.rooms.values()].find((r) => r.type === 'LIVE')!;
    const ana = await login(ctx, ANA);
    const refused = await call(ana, ctx, 'post', `/rooms/${live.id}/hand`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('MODERATION_ONLY_IN_MEETINGS');
  });

  it('sem login: 401', async () => {
    const { ctx, room } = await setup();
    expect(
      (await request(ctx.app).post(`/api/v1/rooms/${room.id}/hand`).set('Origin', ctx.origin))
        .status,
    ).toBe(401);
  });
});
