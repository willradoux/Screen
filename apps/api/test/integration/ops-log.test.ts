import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscordOpsLogger } from '../../src/discord/ops-logger.js';
import { opsLog } from '../../src/shared/ops-log.js';
import { errorHint } from '../../src/shared/error-catalog.js';
import { ADMIN_ROLE } from '../fixtures/fakes.js';
import { ANNOUNCE, LIVE_TEXT, VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const ADMIN = '991000000000000001';
const USER = '991000000000000002';

afterEach(() => {
  opsLog.sink = null;
});

/** Liga a auditoria e o ops-log a um logger de Discord de mentira, como faz o main.ts. */
function withLogChannel(ctx: RoomsCtx, logChannelId: string | null = LIVE_TEXT) {
  ctx.settings.settings.logChannelId = logChannelId;
  const logger = new DiscordOpsLogger({
    gateway: ctx.gateway,
    settings: ctx.settings,
    guildId: ctx.env.DISCORD_GUILD_ID,
    logger: ctx.logger,
  });
  ctx.audit.setSink(logger.fromAudit);
  opsLog.sink = logger.fromOps;
  return logger;
}

const flush = () => new Promise((r) => setTimeout(r, 20));

async function login(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

describe('canal de logs', () => {
  it('ações auditadas viram uma mensagem no canal de logs, sem marcar ninguém', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    withLogChannel(ctx);
    await ctx.audit.record({
      actorId: ADMIN,
      action: 'PARTICIPANT_KICKED',
      targetId: USER,
      reason: 'spam',
    });
    await flush();

    const sent = ctx.gateway.sent.filter((m) => m.channelId === LIVE_TEXT);
    expect(sent).toHaveLength(1);
    const embed = sent[0]!.payload.embeds[0]!;
    expect(embed.description).toContain(`<@${ADMIN}> 👢 expulsou <@${USER}>`);
    expect(embed.description).toContain('Motivo: spam');
    expect(sent[0]!.payload.allowed_mentions).toEqual({ parse: [] });
  });

  it('sem canal de logs configurado, não envia nada (e não dá erro)', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    withLogChannel(ctx, null);
    await ctx.audit.record({ actorId: ADMIN, action: 'SETTINGS_UPDATED' });
    await flush();
    expect(ctx.gateway.sent).toHaveLength(0);
  });

  it('bot sem permissão no canal de logs: a ação auditada continua valendo', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    withLogChannel(ctx);
    ctx.gateway.failSendChannels.add(LIVE_TEXT);
    await ctx.audit.record({ actorId: ADMIN, action: 'SETTINGS_UPDATED' });
    await flush();
    expect(ctx.auditRepo.records).toHaveLength(1);
  });

  it('o mesmo erro repetido não inunda o canal (1 a cada 5 minutos)', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    let now = 1_000_000;
    const logger = new DiscordOpsLogger(
      {
        gateway: ctx.gateway,
        settings: ctx.settings,
        guildId: ctx.env.DISCORD_GUILD_ID,
        logger: ctx.logger,
      },
      () => now,
    );
    ctx.settings.settings.logChannelId = LIVE_TEXT;
    for (let i = 0; i < 5; i++) logger.fromOps({ level: 'error', title: 'Falha X' });
    await flush();
    expect(ctx.gateway.sent).toHaveLength(1);

    now += 6 * 60_000;
    logger.fromOps({ level: 'error', title: 'Falha X' });
    logger.fromOps({ level: 'error', title: 'Falha Y' });
    await flush();
    expect(ctx.gateway.sent).toHaveLength(3);
  });

  it('falha ao enviar o aviso de uma live vai para o canal de logs com o que fazer', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    withLogChannel(ctx, ANNOUNCE);
    ctx.gateway.failSendChannels.add(VOICE_1);
    ctx.gateway.failSendChannels.add(LIVE_TEXT);
    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    await flush();

    const logs = ctx.gateway.sent.filter(
      (m) =>
        m.channelId === ANNOUNCE && String(m.payload.embeds[0]!.title).includes('Não consegui'),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]!.payload.embeds[0]!.title).toContain('Não consegui enviar o aviso');
    expect(logs[0]!.payload.embeds[0]!.description).toMatch(
      /permissões Ver Canal, Enviar Mensagens/,
    );
  });
});

describe('erros claros para a pessoa', () => {
  it('toda resposta de erro traz código, mensagem, dica do que fazer e o código para suporte', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    const room = [...ctx.rooms.rooms.values()][0]!;
    const outsider = await login(ctx, '991000000000000009');

    const res = await outsider
      .post(`/api/v1/rooms/${room.id}/join`)
      .set('Origin', ctx.origin)
      .send();
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'NOT_IN_VOICE',
      message: expect.stringContaining('canal de voz'),
      hint: 'Entre no canal de voz da live no Discord e tente de novo.',
    });
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('erro interno: mensagem genérica (sem vazar detalhes), dica e aviso no canal de logs', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    withLogChannel(ctx, ANNOUNCE);
    const admin = await login(ctx, ADMIN, [ADMIN_ROLE]);
    ctx.gateway.listChannels = async () => {
      throw new Error('senha do banco: hunter2');
    };

    const res = await admin.get('/api/v1/guild');
    await flush();
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.hint).toMatch(/avise um administrador/);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');

    const logs = ctx.gateway.sent.filter((m) => m.channelId === ANNOUNCE);
    expect(logs.length).toBeGreaterThan(0);
    const text = JSON.stringify(logs.map((l) => l.payload));
    expect(text).toContain('Erro interno na API');
    expect(text).toContain(res.body.error.requestId);
    expect(text).not.toContain('hunter2');
  });

  it('as dicas existem para os erros mais comuns', () => {
    for (const code of [
      'NOT_IN_VOICE',
      'ROOM_NOT_OPEN',
      'RATE_LIMITED',
      'LIVEKIT_UNAVAILABLE',
      'DISCORD_SEND_FAILED',
    ]) {
      expect(errorHint(code), code).toBeTruthy();
    }
    expect(errorHint('CODIGO_INEXISTENTE')).toBeUndefined();
  });
});
