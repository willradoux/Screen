import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscordOpsLogger } from '../../src/discord/ops-logger.js';
import { opsLog } from '../../src/shared/ops-log.js';
import { LIVE_TEXT, VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';
import { ADMIN_ROLE } from '../fixtures/fakes.js';

const USER = '992000000000000001';
const ADMIN = '992000000000000002';

afterEach(() => {
  opsLog.sink = null;
});

function withLogs(ctx: RoomsCtx) {
  ctx.settings.settings.logChannelId = LIVE_TEXT;
  // O embed da live também vai para o chat da call; os logs vão só para LIVE_TEXT.
  const logger = new DiscordOpsLogger({
    gateway: ctx.gateway,
    settings: ctx.settings,
    guildId: ctx.env.DISCORD_GUILD_ID,
    logger: ctx.logger,
  });
  opsLog.sink = logger.fromOps;
}
const flush = () => new Promise((r) => setTimeout(r, 30));
const logTexts = (ctx: RoomsCtx) =>
  ctx.gateway.sent
    .filter((m) => m.channelId === LIVE_TEXT && m.payload.embeds[0]?.timestamp)
    .map((m) => `${m.payload.embeds[0]!.title} | ${m.payload.embeds[0]!.description}`);

async function login(ctx: RoomsCtx, id: string, roles: string[] = []) {
  ctx.discord.addMember(id, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${id}`, state });
  return agent;
}

describe('log de atividade da live', () => {
  it('registra quem abriu a live, quem entrou e saiu da sala e quando ela fechou', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    withLogs(ctx);

    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    const room = [...ctx.rooms.rooms.values()][0]!;
    const agent = await login(ctx, USER);
    await agent.post(`/api/v1/rooms/${room.id}/join`).set('Origin', ctx.origin).send();

    // O LiveKit avisa que a pessoa conectou e depois saiu.
    const meta = JSON.stringify({ role: 'MEMBER', avatarUrl: null });
    const joined = ctx.sendWebhook({
      event: 'participant_joined',
      roomName: room.id,
      participant: { identity: USER, name: 'x', metadata: meta, leaveCause: 'other' },
    });
    await request(ctx.app)
      .post('/api/v1/livekit/webhook')
      .set('Authorization', joined.auth)
      .send(joined.body);
    const left = ctx.sendWebhook({
      event: 'participant_left',
      roomName: room.id,
      participant: { identity: USER, name: 'x', metadata: meta, leaveCause: 'client' },
    });
    await request(ctx.app)
      .post('/api/v1/livekit/webhook')
      .set('Authorization', left.auth)
      .send(left.body);

    await ctx.roomService.endRoom(room.id, 'VOICE_EMPTY');
    await flush();

    const texts = logTexts(ctx);
    expect(texts.some((t) => t.includes('Live aberta') && t.includes(`<@${USER}>`))).toBe(true);
    expect(texts.some((t) => t.includes('Entrou na sala') && t.includes(`<@${USER}>`))).toBe(true);
    expect(texts.some((t) => t.includes('Saiu da sala') && t.includes(`<@${USER}>`))).toBe(true);
    expect(
      texts.some((t) => t.includes('Live encerrada') && t.includes('a call ficou vazia')),
    ).toBe(true);
    // todo registro leva data e hora (timestamp do embed)
    expect(
      ctx.gateway.sent
        .filter((m) => m.channelId === LIVE_TEXT)
        .every((m) => m.payload.embeds[0]!.timestamp),
    ).toBe(true);
  });

  it('sem canal de logs configurado, nada é enviado', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    withLogs(ctx);
    ctx.settings.settings.logChannelId = null;
    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    await flush();
    expect(logTexts(ctx)).toEqual([]);
  });
});

describe('GET /status (avisos de configuração para qualquer membro)', () => {
  it('tudo certo', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    const member = await login(ctx, USER);
    const res = await member.get('/api/v1/status');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      botInGuild: true,
      livesConfigured: true,
      announceConfigured: true,
    });
  });

  it('bot fora do servidor e nada configurado', async () => {
    const ctx = buildRoomsApp();
    ctx.gateway.guildPresent = false;
    // buildRoomsApp já vem configurado; aqui simulamos um servidor recém-instalado.
    Object.assign(ctx.settings.settings, {
      liveCategoryId: null,
      liveChannelIds: [],
      announceChannelId: null,
    });
    const member = await login(ctx, USER);
    const res = await member.get('/api/v1/status');
    expect(res.body.data).toEqual({
      botInGuild: false,
      livesConfigured: false,
      announceConfigured: false,
    });
  });

  it('exige login e não expõe IDs', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    expect((await request(ctx.app).get('/api/v1/status')).status).toBe(401);
    const admin = await login(ctx, ADMIN, [ADMIN_ROLE]);
    expect(JSON.stringify((await admin.get('/api/v1/status')).body)).not.toMatch(/\d{17}/);
  });
});
