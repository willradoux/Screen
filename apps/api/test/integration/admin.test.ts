import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import {
  ADMIN,
  ANNOUNCE,
  CATEGORY,
  LIVE_TEXT,
  VOICE_1,
  buildBot,
  call,
} from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const ADMIN_ID = '950000000000000001';
const MOD_ID = '950000000000000002';
const USER_ID = '950000000000000003';

type Agent = ReturnType<typeof request.agent>;

async function loginAs(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

const patch = (agent: Agent, ctx: RoomsCtx, body: unknown) =>
  agent
    .patch('/api/v1/settings')
    .set('Origin', ctx.origin)
    .send(body as object);

describe('GET /settings', () => {
  it('só ADMIN lê; MOD, membro e anônimo são barrados', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const res = await admin.get('/api/v1/settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      guildId: ctx.env.DISCORD_GUILD_ID,
      liveCategoryId: CATEGORY,
      liveTextChannelId: LIVE_TEXT,
      announceChannelId: ANNOUNCE,
      adminRoleIds: [ADMIN_ROLE],
      modRoleIds: [MOD_ROLE],
      meetingAllowedRoleIds: [],
      maxParticipantsLive: 25,
      graceSeconds: 30,
    });

    for (const roles of [[MOD_ROLE], []]) {
      const other = await loginAs(ctx, MOD_ID, roles);
      expect((await other.get('/api/v1/settings')).status).toBe(403);
    }
    expect((await request(ctx.app).get('/api/v1/settings')).status).toBe(401);
  });
});

describe('PATCH /settings', () => {
  it('altera canais, cargos e limites, audita e avisa os admins', async () => {
    const ctx = buildRoomsApp();
    ctx.gateway.roles.add('610000000000000777');
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);

    const res = await patch(admin, ctx, {
      liveCategoryId: CATEGORY,
      liveTextChannelId: LIVE_TEXT,
      announceChannelId: ANNOUNCE,
      meetingAllowedRoleIds: ['610000000000000777'],
      maxParticipantsLive: 40,
      graceSeconds: 45,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      liveCategoryId: CATEGORY,
      announceChannelId: ANNOUNCE,
      meetingAllowedRoleIds: ['610000000000000777'],
      maxParticipantsLive: 40,
      graceSeconds: 45,
    });
    expect(ctx.settings.settings.maxParticipantsLive).toBe(40);

    const audit = ctx.auditRepo.of('SETTINGS_UPDATED');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: ADMIN_ID });
    expect(audit[0]!.meta).toMatchObject({
      changes: { maxParticipantsLive: { from: 25, to: 40 }, graceSeconds: { from: 30, to: 45 } },
    });

    const event = ctx.emitter.of('settings:updated');
    expect(event).toHaveLength(1);
    expect(event[0]).toMatchObject({ id: 'admins' });
    expect((event[0]!.payload as { keys: string[] }).keys).toContain('graceSeconds');
  });

  it('listas de cargos são substituídas por inteiro; null limpa um canal; o que não veio não muda', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    ctx.gateway.roles.add('610000000000000778');
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);

    const res = await patch(admin, ctx, {
      modRoleIds: ['610000000000000778'],
      announceChannelId: null,
    });
    expect(res.status).toBe(200);
    expect(ctx.settings.settings.modRoleIds).toEqual(['610000000000000778']);
    expect(ctx.settings.settings.announceChannelId).toBeNull();
    expect(ctx.settings.settings.liveCategoryId).toBe(CATEGORY);
    expect(ctx.settings.settings.adminRoleIds).toEqual([ADMIN_ROLE]);

    await patch(admin, ctx, { modRoleIds: [] });
    expect(ctx.settings.settings.modRoleIds).toEqual([]);
  });

  it('o novo mapeamento de cargos vale para o login (efeito em até 60 s)', async () => {
    const ctx = buildRoomsApp();
    ctx.gateway.roles.add('610000000000000779');
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const user = await loginAs(ctx, USER_ID, ['610000000000000779']);
    expect((await user.get('/api/v1/auth/me')).body.data.role).toBe('MEMBER');

    await patch(admin, ctx, { modRoleIds: ['610000000000000779'] });
    ctx.clock.advance(61_000);
    expect((await user.get('/api/v1/auth/me')).body.data.role).toBe('MOD');
  });

  it('referências que não existem no Discord são recusadas e nada é gravado', async () => {
    const ctx = buildRoomsApp();
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const before = structuredClone(ctx.settings.settings);

    const cases: [Record<string, unknown>, string, string][] = [
      [{ liveCategoryId: VOICE_1 }, 'liveCategoryId', VOICE_1], // canal de voz não é categoria
      [{ liveCategoryId: '510000000000000999' }, 'liveCategoryId', '510000000000000999'],
      [{ announceChannelId: CATEGORY }, 'announceChannelId', CATEGORY], // categoria não é canal de texto
      [{ liveTextChannelId: VOICE_1 }, 'liveTextChannelId', VOICE_1],
      [{ modRoleIds: ['610000000000000999'] }, 'modRoleIds', '610000000000000999'],
      [{ adminRoleIds: [ADMIN_ROLE, '610000000000000998'] }, 'adminRoleIds', '610000000000000998'],
    ];
    for (const [body, field, id] of cases) {
      const res = await patch(admin, ctx, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_DISCORD_REFERENCE',
        details: { field, id },
      });
    }
    expect(ctx.settings.settings).toEqual(before);
    expect(ctx.auditRepo.records).toHaveLength(0);
    expect(ctx.emitter.of('settings:updated')).toHaveLength(0);
  });

  it.each([
    [{}],
    [{ outraCoisa: 1 }],
    [{ liveCategoryId: 'abc' }],
    [{ maxParticipantsLive: 1 }],
    [{ maxParticipantsLive: 101 }],
    [{ maxParticipantsLive: 10.5 }],
    [{ graceSeconds: 4 }],
    [{ graceSeconds: 301 }],
    [{ modRoleIds: 'texto' }],
    [{ modRoleIds: ['abc'] }],
    [{ adminRoleIds: Array.from({ length: 26 }, (_, i) => `61000000000000${String(1000 + i)}`) }],
  ])('corpo inválido %j -> 400 VALIDATION_ERROR', async (body) => {
    const ctx = buildRoomsApp();
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const res = await patch(admin, ctx, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(ctx.auditRepo.records).toHaveLength(0);
  });

  it('MOD e membro não alteram; sem Origin é barrado', async () => {
    const ctx = buildRoomsApp();
    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);
    expect((await patch(mod, ctx, { graceSeconds: 60 })).status).toBe(403);
    expect(ctx.settings.settings.graceSeconds).toBe(30);

    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    expect((await admin.patch('/api/v1/settings').send({ graceSeconds: 60 })).status).toBe(403);
    expect(ctx.settings.settings.graceSeconds).toBe(30);
  });
});

describe('GET /audit', () => {
  /** Cria entradas com horários distintos. */
  async function seed(ctx: RoomsCtx, n: number) {
    const actions = ['PARTICIPANT_KICKED', 'PARTICIPANT_MUTED', 'ROOM_ENDED'] as const;
    for (let i = 0; i < n; i++) {
      await ctx.audit.record({
        actorId: i % 2 === 0 ? MOD_ID : ADMIN_ID,
        targetId: USER_ID,
        roomId: 'R'.repeat(22),
        action: actions[i % 3]!,
        reason: `motivo ${i}`,
        meta: { i },
      });
      ctx.clock.advance(1000);
    }
  }

  it('só ADMIN lê a auditoria', async () => {
    const ctx = buildRoomsApp();
    for (const roles of [[MOD_ROLE], []]) {
      const other = await loginAs(ctx, MOD_ID, roles);
      expect((await other.get('/api/v1/audit')).status).toBe(403);
    }
    expect((await request(ctx.app).get('/api/v1/audit')).status).toBe(401);
  });

  it('devolve do mais novo para o mais antigo, com o formato documentado', async () => {
    const ctx = buildRoomsApp();
    await seed(ctx, 3);
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const res = await admin.get('/api/v1/audit');
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { reason: string }) => a.reason)).toEqual([
      'motivo 2',
      'motivo 1',
      'motivo 0',
    ]);
    expect(res.body.data[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      at: '2026-11-08T15:00:02.000Z',
      actorId: MOD_ID,
      targetId: USER_ID,
      roomId: 'R'.repeat(22),
      action: 'ROOM_ENDED',
      reason: 'motivo 2',
      meta: { i: 2 },
    });
    expect(res.body.page).toEqual({ next: null, limit: 50 });
  });

  it('filtra por ator, alvo, ação, sala e período', async () => {
    const ctx = buildRoomsApp();
    await seed(ctx, 6);
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const q = async (query: Record<string, string>) =>
      (await admin.get('/api/v1/audit').query(query)).body.data as { reason: string }[];

    expect(await q({ actorId: ADMIN_ID })).toHaveLength(3);
    expect(await q({ targetId: USER_ID })).toHaveLength(6);
    expect(await q({ targetId: '950000000000000099' })).toHaveLength(0);
    expect(await q({ action: 'ROOM_ENDED' })).toHaveLength(2);
    expect(await q({ roomId: 'R'.repeat(22) })).toHaveLength(6);
    expect(await q({ roomId: 'X'.repeat(22) })).toHaveLength(0);
    const from = '2026-11-08T15:00:02.000Z';
    const to = '2026-11-08T15:00:03.000Z';
    expect((await q({ from, to })).map((a) => a.reason)).toEqual(['motivo 3', 'motivo 2']);
  });

  it('pagina por cursor sem repetir nem perder entradas', async () => {
    const ctx = buildRoomsApp();
    await seed(ctx, 7);
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await admin
        .get('/api/v1/audit')
        .query({ limit: 3, ...(cursor ? { cursor } : {}) });
      seen.push(...res.body.data.map((a: { reason: string }) => a.reason));
      cursor = res.body.page.next;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `motivo ${6 - i}`));
  });

  it('parâmetros inválidos -> 400', async () => {
    const ctx = buildRoomsApp();
    const admin = await loginAs(ctx, ADMIN_ID, [ADMIN_ROLE]);
    for (const query of [
      { action: 'INVENTADA' },
      { actorId: 'abc' },
      { roomId: 'curto' },
      { from: 'ontem' },
      { limit: '0' },
      { limit: '101' },
      { cursor: 'lixo' },
    ]) {
      const res = await admin.get('/api/v1/audit').query(query);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('auditoria dos comandos do bot e da API de salas', () => {
  it('/config registra cada alteração; /config ver não registra', async () => {
    const b = buildBot();
    await b.router.handle(ADMIN, call('config', 'ver'));
    expect(b.auditRepo.records).toHaveLength(0);

    await b.router.handle(ADMIN, call('config', 'canal-avisos', { canal: ANNOUNCE }));
    await b.router.handle(ADMIN, call('config', 'limite-live', { max: 30 }));
    const rows = b.auditRepo.of('SETTINGS_UPDATED');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actorId: ADMIN.userId,
      meta: { via: 'command', sub: 'canal-avisos' },
    });
  });

  it('comando recusado (sem permissão ou inválido) não gera auditoria', async () => {
    const b = buildBot();
    await b.router.handle(
      { userId: '1', memberRoleIds: [] },
      call('config', 'limite-live', { max: 30 }),
    );
    await b.router.handle(ADMIN, call('config', 'limite-live', { max: 1 }));
    expect(b.auditRepo.records).toHaveLength(0);
  });

  it('/reuniao criar, cancelar e encerrar são auditados', async () => {
    const b = buildBot();
    b.configureLives();
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Aberta agora' }));
    await b.router.handle(
      ADMIN,
      call('reuniao', 'agendar', { titulo: 'Futura', data: '05/12/2026', hora: '20:00' }),
    );
    const [open, scheduled] = [...b.rooms.rooms.values()];

    await b.router.handle(ADMIN, call('reuniao', 'cancelar', { reuniao: scheduled!.id }));
    await b.router.handle(ADMIN, call('reuniao', 'encerrar', { reuniao: open!.id }));

    expect(b.auditRepo.of('MEETING_CREATED')).toHaveLength(2);
    expect(b.auditRepo.of('MEETING_CREATED')[1]!.meta).toMatchObject({
      title: 'Futura',
      startsAt: '2026-12-05T23:00:00.000Z',
    });
    expect(b.auditRepo.of('MEETING_CANCELED')[0]).toMatchObject({
      actorId: ADMIN.userId,
      roomId: scheduled!.id,
    });
    expect(b.auditRepo.of('ROOM_ENDED')[0]).toMatchObject({
      roomId: open!.id,
      meta: { via: 'command' },
    });
  });

  it('encerrar sala pela API é auditado com o papel de quem encerrou', async () => {
    const ctx = buildRoomsApp();
    await ctx.live.handle({ userId: USER_ID, oldChannelId: null, newChannelId: VOICE_1 });
    const room = [...ctx.rooms.rooms.values()][0]!;
    const mod = await loginAs(ctx, MOD_ID, [MOD_ROLE]);
    await mod.post(`/api/v1/rooms/${room.id}/end`).set('Origin', ctx.origin);
    expect(ctx.auditRepo.of('ROOM_ENDED')).toMatchObject([
      { actorId: MOD_ID, roomId: room.id, meta: { via: 'api', role: 'MOD' } },
    ]);
  });
});
