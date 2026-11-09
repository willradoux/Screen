import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { ANNOUNCE, WEB_URL } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const ADMIN = '970000000000000001';
const MOD = '970000000000000002';
const MEMBER = '970000000000000003';
const MIN = 60_000;
const H = 60 * MIN;

type Agent = ReturnType<typeof request.agent>;

async function loginAs(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

const send = (
  agent: Agent,
  ctx: RoomsCtx,
  method: 'post' | 'patch',
  path: string,
  body?: unknown,
) =>
  agent[method](`/api/v1${path}`)
    .set('Origin', ctx.origin)
    // Hoje a API não divulga sozinha; estes testes querem o aviso junto da criação.
    .send(
      (method === 'post' && path === '/meetings'
        ? { announce: true, ...(body as object) }
        : body) as object,
    );

const iso = (ctx: RoomsCtx, ms: number) => new Date(ctx.clock.now().getTime() + ms).toISOString();

async function setup() {
  const ctx = buildRoomsApp();
  const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
  return { ctx, admin };
}

/** Cria uma reunião agendada para daqui a 26 h e devolve o id. */
async function scheduled(ctx: RoomsCtx, admin: Agent, body: Record<string, unknown> = {}) {
  const res = await send(admin, ctx, 'post', '/meetings', {
    title: 'Reunião mensal',
    startsAt: iso(ctx, 26 * H),
    ...body,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  ctx.gateway.sent.length = 0;
  ctx.gateway.edits.length = 0;
  return res.body.data as { id: string };
}

describe('POST /meetings', () => {
  it('cria e abre agora: 201, aviso no canal e auditoria', async () => {
    const { ctx, admin } = await setup();
    const res = await send(admin, ctx, 'post', '/meetings', {
      title: 'Reunião mensal',
      description: 'Pauta',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: 'MEETING',
      status: 'OPEN',
      title: 'Reunião mensal',
      description: 'Pauta',
      startsAt: null,
      maxParticipants: 100,
      reminders: [],
      allowedRoleIds: [],
      url: `${WEB_URL}/r/${res.body.data.id}`,
    });
    expect(ctx.gateway.sent).toHaveLength(1);
    expect(ctx.gateway.sent[0]!.channelId).toBe(ANNOUNCE);
    expect(ctx.auditRepo.of('MEETING_CREATED')).toMatchObject([
      { actorId: ADMIN, meta: { title: 'Reunião mensal', announced: true, via: 'api' } },
    ]);
  });

  it('agenda: lembretes padrão (24 h, 1 h, 5 min), pendentes, e aviso com o horário', async () => {
    const { ctx, admin } = await setup();
    const startsAt = iso(ctx, 26 * H);
    const res = await send(admin, ctx, 'post', '/meetings', {
      title: 'Reunião de dezembro',
      startsAt,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'SCHEDULED', startsAt });
    expect(res.body.data.reminders).toEqual([
      { minutesBefore: 1440, sent: false },
      { minutesBefore: 60, sent: false },
      { minutesBefore: 5, sent: false },
    ]);
    expect(ctx.gateway.sent[0]!.payload.embeds[0]!.title).toBe('Reunião: Reunião de dezembro');
  });

  it('lembretes personalizados: sem repetição, do maior para o menor, e só os que ainda fazem sentido', async () => {
    const { ctx, admin } = await setup();
    const res = await send(admin, ctx, 'post', '/meetings', {
      title: 'Reunião curta',
      startsAt: iso(ctx, 30 * MIN),
      reminders: [10, 120, 10, 20],
    });
    expect(res.body.data.reminders.map((r: { minutesBefore: number }) => r.minutesBefore)).toEqual([
      20, 10,
    ]);

    const none = await send(admin, ctx, 'post', '/meetings', {
      title: 'Sem lembretes',
      startsAt: iso(ctx, 5 * H),
      reminders: [],
    });
    expect(none.body.data.reminders).toEqual([]);
  });

  it('cargos de acesso: usa o /config cargo-reuniao por padrão, ou os informados', async () => {
    const { ctx, admin } = await setup();
    ctx.settings.settings.meetingAllowedRoleIds = ['610000000000000001'];
    const byDefault = await send(admin, ctx, 'post', '/meetings', { title: 'Reunião A' });
    expect(byDefault.body.data.allowedRoleIds).toEqual(['610000000000000001']);

    ctx.gateway.roles.add('610000000000000002');
    const explicit = await send(admin, ctx, 'post', '/meetings', {
      title: 'Reunião B',
      allowedRoleIds: ['610000000000000002'],
    });
    expect(explicit.body.data.allowedRoleIds).toEqual(['610000000000000002']);

    const ghost = await send(admin, ctx, 'post', '/meetings', {
      title: 'Reunião C',
      allowedRoleIds: ['610000000000000999'],
    });
    expect(ghost.status).toBe(400);
    expect(ghost.body.error).toMatchObject({
      code: 'INVALID_DISCORD_REFERENCE',
      details: { field: 'allowedRoleIds', id: '610000000000000999' },
    });
  });

  it('horário no passado ou a menos de 2 minutos -> 400 STARTS_AT_IN_PAST, e nada é criado', async () => {
    const { ctx, admin } = await setup();
    for (const ms of [-H, 0, MIN]) {
      const res = await send(admin, ctx, 'post', '/meetings', {
        title: 'Reunião',
        startsAt: iso(ctx, ms),
      });
      expect(res.status, String(ms)).toBe(400);
      expect(res.body.error.code).toBe('STARTS_AT_IN_PAST');
    }
    expect(ctx.rooms.rooms.size).toBe(0);
  });

  it('sem canal de avisos: 409 ANNOUNCE_CHANNEL_NOT_SET; com announce:false cria sem aviso', async () => {
    const { ctx, admin } = await setup();
    ctx.settings.settings.announceChannelId = null;
    const refused = await send(admin, ctx, 'post', '/meetings', { title: 'Reunião mensal' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ANNOUNCE_CHANNEL_NOT_SET');
    expect(ctx.rooms.rooms.size).toBe(0);

    const silent = await send(admin, ctx, 'post', '/meetings', {
      title: 'Reunião mensal',
      announce: false,
    });
    expect(silent.status).toBe(201);
    expect(ctx.gateway.sent).toHaveLength(0);
  });

  it.each([
    [{}],
    [{ title: 'ab' }],
    [{ title: 'x'.repeat(101) }],
    [{ title: 'Reunião', description: 'x'.repeat(1001) }],
    [{ title: 'Reunião', startsAt: 'amanhã' }],
    [{ title: 'Reunião', maxParticipants: 1 }],
    [{ title: 'Reunião', maxParticipants: 301 }],
    [{ title: 'Reunião', reminders: [0] }],
    [{ title: 'Reunião', reminders: [-5] }],
    [{ title: 'Reunião', reminders: [1.5] }],
    [{ title: 'Reunião', reminders: [43_201] }],
    [{ title: 'Reunião', reminders: [1, 2, 3, 4, 5, 6] }],
    [{ title: 'Reunião', allowedRoleIds: ['abc'] }],
    [{ title: 'Reunião', announce: 'sim' }],
    [{ title: 'Reunião', outro: 1 }],
  ])('corpo inválido %j -> 400 VALIDATION_ERROR', async (body) => {
    const { ctx, admin } = await setup();
    const res = await send(admin, ctx, 'post', '/meetings', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(ctx.rooms.rooms.size).toBe(0);
  });

  it('só ADMIN cria; exige login e Origin', async () => {
    const { ctx } = await setup();
    for (const roles of [[MOD_ROLE], []]) {
      const other = await loginAs(ctx, MOD, roles);
      expect(
        (await send(other, ctx, 'post', '/meetings', { title: 'Reunião mensal' })).status,
      ).toBe(403);
    }
    expect(
      (
        await request(ctx.app)
          .post('/api/v1/meetings')
          .set('Origin', ctx.origin)
          .send({ title: 'Reunião' })
      ).status,
    ).toBe(401);
    const admin = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    expect((await admin.post('/api/v1/meetings').send({ title: 'Reunião mensal' })).status).toBe(
      403,
    );
    expect(ctx.rooms.rooms.size).toBe(0);
  });
});

describe('GET /meetings', () => {
  it('qualquer membro vê as abertas e agendadas, da mais próxima para a mais distante', async () => {
    const { ctx, admin } = await setup();
    await scheduled(ctx, admin, { title: 'Depois', startsAt: iso(ctx, 50 * H) });
    await scheduled(ctx, admin, { title: 'Antes', startsAt: iso(ctx, 10 * H) });
    await send(admin, ctx, 'post', '/meetings', { title: 'Já encerrada' }).then((r) =>
      ctx.roomService.endRoom(r.body.data.id, 'ENDED_BY_ADMIN'),
    );

    const member = await loginAs(ctx, MEMBER);
    const res = await member.get('/api/v1/meetings');
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: { title: string }) => m.title)).toEqual(['Antes', 'Depois']);
  });

  it('filtra por estado e por período, e limita', async () => {
    const { ctx, admin } = await setup();
    await scheduled(ctx, admin, { title: 'Reunião A', startsAt: iso(ctx, 10 * H) });
    await scheduled(ctx, admin, { title: 'Reunião B', startsAt: iso(ctx, 30 * H) });
    await scheduled(ctx, admin, { title: 'Reunião C', startsAt: iso(ctx, 60 * H) });
    const ended = await send(admin, ctx, 'post', '/meetings', { title: 'Reunião D' });
    await ctx.roomService.endRoom(ended.body.data.id, 'ENDED_BY_ADMIN');

    const titles = async (query: Record<string, string>) =>
      (await admin.get('/api/v1/meetings').query(query)).body.data.map(
        (m: { title: string }) => m.title,
      );

    expect(await titles({ status: 'ENDED' })).toEqual(['Reunião D']);
    expect(await titles({ from: iso(ctx, 20 * H), to: iso(ctx, 40 * H) })).toEqual(['Reunião B']);
    expect(await titles({ limit: '2' })).toHaveLength(2);
    expect((await admin.get('/api/v1/meetings').query({ limit: '0' })).status).toBe(400);
    expect((await admin.get('/api/v1/meetings').query({ status: 'XYZ' })).status).toBe(400);
  });

  it('GET /meetings/:id devolve a reunião; lives e ids inexistentes são 404', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const member = await loginAs(ctx, MEMBER);
    expect((await member.get(`/api/v1/meetings/${m.id}`)).body.data.id).toBe(m.id);

    await ctx.live.handle({
      userId: MEMBER,
      oldChannelId: null,
      newChannelId: '500000000000000011',
    });
    const live = [...ctx.rooms.rooms.values()].find((r) => r.type === 'LIVE')!;
    for (const id of [live.id, 'x'.repeat(22), 'curto']) {
      const res = await member.get(`/api/v1/meetings/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
    }
    expect((await request(ctx.app).get(`/api/v1/meetings/${m.id}`)).status).toBe(401);
  });
});

describe('PATCH /meetings/:id', () => {
  it('edita título, descrição, capacidade e cargos; o aviso é atualizado', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    ctx.gateway.roles.add('610000000000000003');

    const res = await send(admin, ctx, 'patch', `/meetings/${m.id}`, {
      title: 'Mensal de dezembro',
      description: 'Nova pauta',
      maxParticipants: 50,
      allowedRoleIds: ['610000000000000003'],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: 'Mensal de dezembro',
      description: 'Nova pauta',
      maxParticipants: 50,
      allowedRoleIds: ['610000000000000003'],
    });
    expect(ctx.gateway.edits.at(-1)!.payload.embeds[0]!.title).toBe('Reunião: Mensal de dezembro');
    expect(ctx.gateway.sent).toHaveLength(0); // sem mudança de horário não há novo aviso
    expect(ctx.auditRepo.of('MEETING_UPDATED')[0]).toMatchObject({
      actorId: ADMIN,
      meta: { via: 'api', changes: { title: 'Mensal de dezembro', maxParticipants: 50 } },
    });
  });

  it('mudar o horário reagenda: lembretes zerados, novo aviso no canal e embed atualizado', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const startsAt = iso(ctx, 72 * H);
    const res = await send(admin, ctx, 'patch', `/meetings/${m.id}`, { startsAt });

    expect(res.status).toBe(200);
    expect(res.body.data.startsAt).toBe(startsAt);
    expect(res.body.data.reminders).toEqual([
      { minutesBefore: 1440, sent: false },
      { minutesBefore: 60, sent: false },
      { minutesBefore: 5, sent: false },
    ]);
    expect(ctx.gateway.sent.map((s) => s.payload.embeds[0]!.title)).toEqual([
      'Reunião reagendada: Reunião mensal',
    ]);
    expect(ctx.gateway.sent[0]!.payload.content).toBeUndefined();
    expect(ctx.gateway.sent[0]!.payload.allowed_mentions).toEqual({ parse: [] });
  });

  it('trocar só os lembretes não manda aviso novo', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const res = await send(admin, ctx, 'patch', `/meetings/${m.id}`, { reminders: [30, 10] });
    expect(res.body.data.reminders.map((r: { minutesBefore: number }) => r.minutesBefore)).toEqual([
      30, 10,
    ]);
    expect(ctx.gateway.sent).toHaveLength(0);
  });

  it('só reuniões agendadas: aberta, encerrada e cancelada -> 409 MEETING_NOT_EDITABLE', async () => {
    const { ctx, admin } = await setup();
    const open = (await send(admin, ctx, 'post', '/meetings', { title: 'Aberta agora' })).body.data;
    const canceled = await scheduled(ctx, admin);
    await send(admin, ctx, 'post', `/meetings/${canceled.id}/cancel`);

    for (const id of [open.id, canceled.id]) {
      const res = await send(admin, ctx, 'patch', `/meetings/${id}`, { title: 'Outro título' });
      expect(res.status, id).toBe(409);
      expect(res.body.error.code).toBe('MEETING_NOT_EDITABLE');
    }
  });

  it('valida: horário passado, campos desconhecidos, corpo vazio, cargo inexistente', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const code = async (body: unknown) =>
      (await send(admin, ctx, 'patch', `/meetings/${m.id}`, body)).body.error?.code;

    expect(await code({ startsAt: iso(ctx, -H) })).toBe('STARTS_AT_IN_PAST');
    expect(await code({ startsAt: iso(ctx, MIN) })).toBe('STARTS_AT_IN_PAST');
    expect(await code({})).toBe('VALIDATION_ERROR');
    expect(await code({ outro: 1 })).toBe('VALIDATION_ERROR');
    expect(await code({ title: 'ab' })).toBe('VALIDATION_ERROR');
    expect(await code({ allowedRoleIds: ['610000000000000999'] })).toBe(
      'INVALID_DISCORD_REFERENCE',
    );
    expect(ctx.rooms.rooms.get(m.id)!.title).toBe('Reunião mensal');
  });

  it('só ADMIN edita; id inexistente -> 404', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    expect(
      (await send(mod, ctx, 'patch', `/meetings/${m.id}`, { title: 'Outro título' })).status,
    ).toBe(403);
    const missing = await send(admin, ctx, 'patch', `/meetings/${'x'.repeat(22)}`, {
      title: 'Outro título',
    });
    expect(missing.status).toBe(404);
  });
});

describe('POST /meetings/:id/open e /cancel', () => {
  it('open: abre antes da hora, atualiza o embed, audita, e o join passa a funcionar', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const member = await loginAs(ctx, MEMBER);
    expect((await send(member, ctx, 'post', `/rooms/${m.id}/join`)).body.error.code).toBe(
      'ROOM_NOT_OPEN',
    );

    const res = await send(admin, ctx, 'post', `/meetings/${m.id}/open`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'OPEN' });
    expect(res.body.data.startsAt).not.toBeNull();
    expect(ctx.gateway.edits.at(-1)!.payload.embeds[0]!.title).toBe(
      'Reunião aberta agora: Reunião mensal',
    );
    expect(ctx.auditRepo.of('MEETING_OPENED')).toMatchObject([
      { actorId: ADMIN, meta: { via: 'api' } },
    ]);

    expect((await send(member, ctx, 'post', `/rooms/${m.id}/join`)).status).toBe(200);
    expect((await send(admin, ctx, 'post', `/meetings/${m.id}/open`)).body.error.code).toBe(
      'MEETING_NOT_EDITABLE',
    );
  });

  it('cancel: 204, embed cancelado, aviso silencioso no canal, e ninguém mais entra', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const res = await send(admin, ctx, 'post', `/meetings/${m.id}/cancel`);
    expect(res.status).toBe(204);
    expect(ctx.rooms.rooms.get(m.id)!.status).toBe('CANCELED');
    expect(ctx.gateway.edits.at(-1)!.payload.embeds[0]!.title).toBe(
      'Reunião cancelada: Reunião mensal',
    );
    const notice = ctx.gateway.sent.at(-1)!.payload;
    expect(notice.embeds[0]!.title).toBe('Reunião cancelada: Reunião mensal');
    expect(notice.content).toBeUndefined(); // sem @everyone
    expect(notice.components).toEqual([]);
    expect(ctx.auditRepo.of('MEETING_CANCELED')).toHaveLength(1);

    const member = await loginAs(ctx, MEMBER);
    expect((await send(member, ctx, 'post', `/rooms/${m.id}/join`)).body.error.code).toBe(
      'ROOM_NOT_OPEN',
    );
  });

  it('cancel de reunião aberta -> 409 (use encerrar); cancelar de novo -> 409', async () => {
    const { ctx, admin } = await setup();
    const open = (await send(admin, ctx, 'post', '/meetings', { title: 'Aberta agora' })).body.data;
    expect((await send(admin, ctx, 'post', `/meetings/${open.id}/cancel`)).status).toBe(409);

    const m = await scheduled(ctx, admin);
    await send(admin, ctx, 'post', `/meetings/${m.id}/cancel`);
    expect((await send(admin, ctx, 'post', `/meetings/${m.id}/cancel`)).body.error.code).toBe(
      'MEETING_NOT_EDITABLE',
    );
  });

  it('MOD e membro não abrem nem cancelam', async () => {
    const { ctx, admin } = await setup();
    const m = await scheduled(ctx, admin);
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    expect((await send(mod, ctx, 'post', `/meetings/${m.id}/open`)).status).toBe(403);
    expect((await send(mod, ctx, 'post', `/meetings/${m.id}/cancel`)).status).toBe(403);
    expect(ctx.rooms.rooms.get(m.id)!.status).toBe('SCHEDULED');
  });
});

describe('GET /meetings/:id/report', () => {
  it('antes de terminar -> 409 REPORT_NOT_AVAILABLE', async () => {
    const { ctx, admin } = await setup();
    const open = (await send(admin, ctx, 'post', '/meetings', { title: 'Aberta agora' })).body.data;
    const res = await admin.get(`/api/v1/meetings/${open.id}/report`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REPORT_NOT_AVAILABLE');
  });

  it('depois de terminar: duração, pico e lista de presença', async () => {
    const { ctx, admin } = await setup();
    const open = (await send(admin, ctx, 'post', '/meetings', { title: 'Reunião mensal' })).body
      .data;
    const t0 = ctx.clock.now();
    const join = (userId: string, name: string, plusMin: number) =>
      ctx.participations.open({
        roomId: open.id,
        userId,
        displayName: name,
        avatarUrl: null,
        role: 'MEMBER',
        at: new Date(t0.getTime() + plusMin * MIN),
      });
    await join('u1', 'Ana', 0);
    await join('u2', 'Beto', 10);

    ctx.clock.advance(20 * MIN);
    await ctx.participations.close(open.id, 'u1', 'LEFT', ctx.clock.now());
    await join('u1', 'Ana', 25); // voltou
    ctx.clock.advance(40 * MIN); // t = 60 min
    await ctx.roomService.endRoom(open.id, 'ENDED_BY_ADMIN');

    const res = await admin.get(`/api/v1/meetings/${open.id}/report`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      durationMinutes: 60,
      peakParticipants: 2,
      attendees: [
        {
          userId: 'u1',
          displayName: 'Ana',
          joinedAt: t0.toISOString(),
          leftAt: ctx.clock.now().toISOString(),
          minutes: 55,
        }, // 20 + 35
        {
          userId: 'u2',
          displayName: 'Beto',
          joinedAt: new Date(t0.getTime() + 10 * MIN).toISOString(),
          leftAt: ctx.clock.now().toISOString(),
          minutes: 50,
        },
      ],
    });
  });

  it('só ADMIN lê; 404 para lives e ids inexistentes', async () => {
    const { ctx, admin } = await setup();
    const m = (await send(admin, ctx, 'post', '/meetings', { title: 'Reunião mensal' })).body.data;
    await ctx.roomService.endRoom(m.id, 'ENDED_BY_ADMIN');
    const mod = await loginAs(ctx, MOD, [MOD_ROLE]);
    expect((await mod.get(`/api/v1/meetings/${m.id}/report`)).status).toBe(403);
    expect((await admin.get(`/api/v1/meetings/${'x'.repeat(22)}/report`)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/v1/meetings/${m.id}/report`)).status).toBe(401);
  });
});
