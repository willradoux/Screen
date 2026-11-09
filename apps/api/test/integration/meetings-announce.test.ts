import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const ADMIN = '990000000000000001';
const MOD = '990000000000000002';
const HOUR = 3_600_000;

type Agent = ReturnType<typeof request.agent>;

async function login(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

const post = (agent: Agent, ctx: RoomsCtx, path: string, body: object = {}) =>
  agent.post(`/api/v1${path}`).set('Origin', ctx.origin).send(body);

async function setup() {
  const ctx = buildRoomsApp();
  ctx.configureLives();
  const admin = await login(ctx, ADMIN, [ADMIN_ROLE]);
  const startsAt = new Date(ctx.clock.now().getTime() + 30 * HOUR).toISOString();
  const created = await post(admin, ctx, '/meetings', { title: 'Reunião mensal', startsAt });
  return { ctx, admin, id: created.body.data.id as string, created };
}

describe('criar sem divulgar', () => {
  it('por padrão a reunião é criada sem mandar nada ao Discord', async () => {
    const { ctx, created } = await setup();
    expect(created.status).toBe(201);
    expect(created.body.data.announced).toBe(false);
    expect(ctx.gateway.sent).toHaveLength(0);
  });

  it('o horário está definido e a reunião segue agendada (ninguém entra antes da hora)', async () => {
    const { ctx, id } = await setup();
    const room = ctx.rooms.rooms.get(id)!;
    expect(room.status).toBe('SCHEDULED');
    const member = await login(ctx, '990000000000000009');
    const res = await post(member, ctx, `/rooms/${id}/join`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_NOT_OPEN');
    expect(res.body.error.details.startsAt).toBe(room.startsAt!.toISOString());
  });

  it('sem divulgar não há lembretes nem avisos de reagendamento/cancelamento', async () => {
    const { ctx, admin, id } = await setup();
    ctx.clock.advance(7 * HOUR); // passou do lembrete de 24 h
    await ctx.meetingScheduler.tick();
    expect(ctx.gateway.sent).toHaveLength(0);

    const later = new Date(ctx.clock.now().getTime() + 40 * HOUR).toISOString();
    await admin.patch(`/api/v1/meetings/${id}`).set('Origin', ctx.origin).send({ startsAt: later });
    expect(ctx.gateway.sent).toHaveLength(0);

    await post(admin, ctx, `/meetings/${id}/cancel`);
    expect(ctx.gateway.sent).toHaveLength(0);
  });

  it('abrir na hora sem ter divulgado também não publica nada', async () => {
    const { ctx, admin, id } = await setup();
    expect((await post(admin, ctx, `/meetings/${id}/open`)).status).toBe(200);
    expect(ctx.gateway.sent).toHaveLength(0);
  });
});

describe('botão Enviar aviso', () => {
  it('manda o embed no canal de avisos, marca como divulgada e audita', async () => {
    const { ctx, admin, id } = await setup();
    const res = await post(admin, ctx, `/meetings/${id}/announce`);
    expect(res.status).toBe(200);
    expect(res.body.data.announced).toBe(true);

    expect(ctx.gateway.sent).toHaveLength(1);
    const msg = ctx.gateway.sent[0]!;
    expect(msg.payload.embeds[0]!.title).toContain('Reunião mensal');
    expect(JSON.stringify(msg.payload.components)).toContain(`/r/${id}`);
    expect(ctx.rooms.rooms.get(id)!.announceMessageId).toBe(msg.messageId);
    expect(ctx.auditRepo.records.filter((r) => r.action === 'MEETING_ANNOUNCED')).toMatchObject([
      { actorId: ADMIN, roomId: id, meta: { resend: false } },
    ]);
  });

  it('depois de divulgada, os lembretes passam a valer', async () => {
    const { ctx, admin, id } = await setup();
    await post(admin, ctx, `/meetings/${id}/announce`);
    ctx.clock.advance(6 * HOUR + 60_000); // 1 min depois da hora do lembrete de 24 h
    await ctx.meetingScheduler.tick();
    const reminders = ctx.gateway.sent.filter((m) =>
      String(m.payload.embeds[0]!.title).startsWith('⏰'),
    );
    expect(reminders).toHaveLength(1);
  });

  it('divulgar duas vezes dá ALREADY_ANNOUNCED; com resend manda outra mensagem', async () => {
    const { ctx, admin, id } = await setup();
    await post(admin, ctx, `/meetings/${id}/announce`);
    const again = await post(admin, ctx, `/meetings/${id}/announce`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ANNOUNCED');
    expect(ctx.gateway.sent).toHaveLength(1);

    const resent = await post(admin, ctx, `/meetings/${id}/announce`, { resend: true });
    expect(resent.status).toBe(200);
    expect(ctx.gateway.sent).toHaveLength(2);
    expect(ctx.rooms.rooms.get(id)!.announceMessageId).toBe(ctx.gateway.sent[1]!.messageId);
  });

  it('sem canal de avisos configurado: 409 com explicação, nada é enviado', async () => {
    const { ctx, admin, id } = await setup();
    ctx.settings.settings.announceChannelId = null;
    const res = await post(admin, ctx, `/meetings/${id}/announce`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ANNOUNCE_CHANNEL_NOT_SET');
    expect(ctx.gateway.sent).toHaveLength(0);
  });

  it('bot sem permissão no canal: 502 DISCORD_SEND_FAILED explicando o que verificar', async () => {
    const { ctx, admin, id } = await setup();
    ctx.gateway.failSend = true;
    const res = await post(admin, ctx, `/meetings/${id}/announce`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DISCORD_SEND_FAILED');
    expect(res.body.error.message).toMatch(/bot pode ver e escrever/);
    expect(ctx.rooms.rooms.get(id)!.announceMessageId).toBeNull();
  });

  it('reunião encerrada ou cancelada não pode ser divulgada', async () => {
    const { ctx, admin, id } = await setup();
    await post(admin, ctx, `/meetings/${id}/cancel`);
    const res = await post(admin, ctx, `/meetings/${id}/announce`);
    expect(res.status).toBe(409);
  });

  it('só ADMIN divulga; MOD e membro recebem 403', async () => {
    const { ctx, id } = await setup();
    for (const roles of [[MOD_ROLE], []]) {
      const other = await login(ctx, MOD, roles);
      expect((await post(other, ctx, `/meetings/${id}/announce`)).status).toBe(403);
    }
    expect(ctx.gateway.sent).toHaveLength(0);
  });

  it('corpo inválido é recusado', async () => {
    const { ctx, admin, id } = await setup();
    expect((await post(admin, ctx, `/meetings/${id}/announce`, { resend: 'sim' })).status).toBe(
      400,
    );
    expect((await post(admin, ctx, `/meetings/${id}/announce`, { x: 1 })).status).toBe(400);
  });
});
