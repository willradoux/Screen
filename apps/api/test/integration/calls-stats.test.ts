import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE } from '../fixtures/fakes.js';
import { VOICE_1, VOICE_2 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const ANA = '994000000000000001';
const BETO = '994000000000000002';

async function login(ctx: RoomsCtx, id: string, roles: string[] = []) {
  ctx.discord.addMember(id, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${id}`, state });
  return agent;
}

describe('GET /calls (status das calls)', () => {
  it('lista as calls com live, quem está em cada uma e o estado da sessão', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    ctx.gateway.profiles.set(ANA, {
      id: ANA,
      username: 'ana',
      displayName: 'Ana',
      avatarUrl: null,
    });
    await ctx.live.handle({ userId: ANA, oldChannelId: null, newChannelId: VOICE_1 });
    await ctx.live.handle({ userId: BETO, oldChannelId: null, newChannelId: VOICE_1 });

    const agent = await login(ctx, ANA);
    const res = await agent.get('/api/v1/calls');
    expect(res.status).toBe(200);
    const one = res.body.data.find((c: { id: string }) => c.id === VOICE_1);
    expect(one.members.map((m: { userId: string }) => m.userId).sort()).toEqual([ANA, BETO].sort());
    expect(one.members.find((m: { userId: string }) => m.userId === ANA).displayName).toBe('Ana');
    expect(one.roomId).toBeTruthy();
    expect(one.mediaState).toBe('IDLE');
    const two = res.body.data.find((c: { id: string }) => c.id === VOICE_2);
    expect(two).toMatchObject({ members: [], roomId: null, mediaState: null });
  });

  it('sem calls configuradas: lista vazia; sem login: 401', async () => {
    const ctx = buildRoomsApp();
    Object.assign(ctx.settings.settings, { liveCategoryId: null, liveChannelIds: [] });
    expect((await (await login(ctx, ANA)).get('/api/v1/calls')).body.data).toEqual([]);
    expect((await request(ctx.app).get('/api/v1/calls')).status).toBe(401);
  });
});

describe('e-mail do OAuth', () => {
  it('é guardado no usuário e nunca aparece em /auth/me', async () => {
    const ctx = buildRoomsApp();
    ctx.discord.addMember(ANA);
    const original = ctx.discord.fetchMe.bind(ctx.discord);
    ctx.discord.fetchMe = async (t: string) => ({
      ...(await original(t)),
      email: 'ana@exemplo.com',
    });
    const agent = request.agent(ctx.app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${ANA}`, state });

    expect(ctx.users.users.get(ANA)?.email).toBe('ana@exemplo.com');
    const me = await agent.get('/api/v1/auth/me');
    expect(JSON.stringify(me.body)).not.toContain('ana@exemplo.com');
  });

  it('o login pede o escopo email', async () => {
    const ctx = buildRoomsApp();
    expect(ADMIN_ROLE).toBeTruthy();
    const { createDiscordApi } = await import('../../src/modules/discord/discord-api.js');
    const url = createDiscordApi(ctx.env).buildAuthorizeUrl('s');
    expect(new URL(url).searchParams.get('scope')).toContain('email');
  });
});
