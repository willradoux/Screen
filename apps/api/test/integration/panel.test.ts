import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { CATEGORY, VOICE_1, VOICE_2 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, openMeeting, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const ADMIN = '970000000000000001';
const MOD = '970000000000000002';
const MEMBER = '970000000000000003';
const WILL = '970000000000000004'; // colaborador sem cargo
const OUTSIDER = '970000000000000005'; // colaborador que nem está no servidor
const MEMBER2 = '970000000000000006';

type Agent = ReturnType<typeof request.agent>;

async function login(ctx: RoomsCtx, userId: string, roles: string[] = [], outsider = false) {
  if (outsider) ctx.discord.addOutsider(userId);
  else ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  const cb = await agent
    .get('/api/v1/auth/discord/callback')
    .query({ code: `code-${userId}`, state });
  return { agent, location: cb.headers.location as string };
}

const send = (
  agent: Agent,
  ctx: RoomsCtx,
  method: 'post' | 'patch' | 'delete',
  path: string,
  body?: object,
) =>
  agent[method](`/api/v1${path}`)
    .set('Origin', ctx.origin)
    .send(body as object);

describe('acesso ao painel por cargo', () => {
  it('quem tem cargo de admin ou mod vê o papel em /auth/me; membro comum é MEMBER', async () => {
    const ctx = buildRoomsApp();
    for (const [id, roles, role] of [
      [ADMIN, [ADMIN_ROLE], 'ADMIN'],
      [MOD, [MOD_ROLE], 'MOD'],
      [MEMBER, [], 'MEMBER'],
    ] as const) {
      const { agent } = await login(ctx, id, [...roles]);
      expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe(role);
    }
  });

  it('só ADMIN lê e altera a configuração; MOD e membro recebem 403', async () => {
    const ctx = buildRoomsApp();
    const mod = (await login(ctx, MOD, [MOD_ROLE])).agent;
    const member = (await login(ctx, MEMBER)).agent;
    for (const agent of [mod, member]) {
      expect((await agent.get('/api/v1/settings')).status).toBe(403);
      expect((await agent.get('/api/v1/guild')).status).toBe(403);
      expect((await agent.get('/api/v1/panel-users')).status).toBe(403);
      expect(
        (await send(agent, ctx, 'post', '/panel-users', { userId: WILL, role: 'ADMIN' })).status,
      ).toBe(403);
    }
  });
});

describe('pessoas do painel (sem precisar de cargo)', () => {
  it('o admin adiciona alguém sem cargo e a pessoa vira ADMIN na hora', async () => {
    const ctx = buildRoomsApp();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const will = (await login(ctx, WILL)).agent;
    expect((await will.get('/api/v1/auth/me')).body.data.role).toBe('MEMBER');
    expect((await will.get('/api/v1/settings')).status).toBe(403);

    const add = await send(admin, ctx, 'post', '/panel-users', {
      userId: WILL,
      role: 'ADMIN',
      note: 'Will, ajuda no projeto',
    });
    expect(add.status).toBe(201);

    expect((await will.get('/api/v1/auth/me')).body.data.role).toBe('ADMIN');
    expect((await will.get('/api/v1/settings')).status).toBe(200);
    expect(ctx.auditRepo.records.filter((r) => r.action === 'PANEL_USER_ADDED')).toMatchObject([
      { actorId: ADMIN, targetId: WILL, meta: { role: 'ADMIN' } },
    ]);
  });

  it('pode ser só MOD; trocar o nível mantém uma única linha; remover tira o acesso', async () => {
    const ctx = buildRoomsApp();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const will = (await login(ctx, WILL)).agent;

    await send(admin, ctx, 'post', '/panel-users', { userId: WILL, role: 'MOD' });
    expect((await will.get('/api/v1/auth/me')).body.data.role).toBe('MOD');
    expect((await will.get('/api/v1/settings')).status).toBe(403);

    await send(admin, ctx, 'post', '/panel-users', { userId: WILL, role: 'ADMIN' });
    const list = await admin.get('/api/v1/panel-users');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ userId: WILL, role: 'ADMIN' });

    expect((await send(admin, ctx, 'delete', `/panel-users/${WILL}`)).status).toBe(204);
    expect((await will.get('/api/v1/auth/me')).body.data.role).toBe('MEMBER');
    expect((await admin.get('/api/v1/panel-users')).body.data).toEqual([]);
    expect(ctx.auditRepo.records.map((r) => r.action)).toContain('PANEL_USER_REMOVED');
  });

  it('quem está fora do servidor só entra se foi adicionado ao painel', async () => {
    const ctx = buildRoomsApp();
    const denied = await login(ctx, OUTSIDER, [], true);
    expect(denied.location).toContain('error=NOT_IN_GUILD');

    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    await send(admin, ctx, 'post', '/panel-users', { userId: OUTSIDER, role: 'ADMIN' });

    const ok = await login(ctx, OUTSIDER, [], true);
    expect(ok.location).not.toContain('error=');
    const me = await ok.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('ADMIN');
    expect((await ok.agent.get('/api/v1/settings')).status).toBe(200);
  });

  it('removido do painel, quem está fora do servidor perde o acesso (sessão deixa de valer)', async () => {
    const ctx = buildRoomsApp();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    await send(admin, ctx, 'post', '/panel-users', { userId: OUTSIDER, role: 'ADMIN' });
    const out = await login(ctx, OUTSIDER, [], true);
    await send(admin, ctx, 'delete', `/panel-users/${OUTSIDER}`);
    ctx.clock.advance(61_000); // passa o cache de 60 s do membro

    const me = await out.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe('NOT_IN_GUILD');
  });

  it('validação: ID inválido, papel desconhecido e campos extras são recusados', async () => {
    const ctx = buildRoomsApp();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    for (const body of [
      { userId: 'abc', role: 'ADMIN' },
      { userId: WILL, role: 'DONO' },
      { userId: WILL, role: 'ADMIN', extra: 1 },
      { role: 'ADMIN' },
    ]) {
      expect((await send(admin, ctx, 'post', '/panel-users', body)).status).toBe(400);
    }
    expect((await send(admin, ctx, 'delete', '/panel-users/xx')).status).toBe(400);
  });

  it('quem foi adicionado como MOD pelo painel não adiciona outros', async () => {
    const ctx = buildRoomsApp();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const will = (await login(ctx, WILL)).agent;
    await send(admin, ctx, 'post', '/panel-users', { userId: WILL, role: 'MOD' });
    expect(
      (await send(will, ctx, 'post', '/panel-users', { userId: MEMBER, role: 'ADMIN' })).status,
    ).toBe(403);
  });
});

describe('catálogo e configurações novas', () => {
  it('GET /guild lista canais e cargos para o painel escolher', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const res = await admin.get('/api/v1/guild');
    expect(res.status).toBe(200);
    const ids = res.body.data.channels.map((c: { id: string }) => c.id);
    expect(ids).toContain(VOICE_1);
    expect(ids).toContain(CATEGORY);
    expect(res.body.data.roles.map((r: { id: string }) => r.id)).toContain(ADMIN_ROLE);
  });

  it('o admin escolhe quais calls têm live, e o canal precisa ser de voz e existir', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;

    const ok = await send(admin, ctx, 'patch', '/settings', { liveChannelIds: [VOICE_1, VOICE_2] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.liveChannelIds).toEqual([VOICE_1, VOICE_2]);

    const text = await send(admin, ctx, 'patch', '/settings', {
      liveChannelIds: ['500000000000000077'],
    });
    expect(text.status).toBe(400);
    expect(text.body.error.code).toBe('INVALID_DISCORD_REFERENCE');
    const notVoice = await send(admin, ctx, 'patch', '/settings', { liveChannelIds: [CATEGORY] });
    expect(notVoice.status).toBe(400);
  });

  it('canal de logs, cargo de menção e tempos têm limites', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const ok = await send(admin, ctx, 'patch', '/settings', {
      mentionRoleId: MOD_ROLE,
      idleSessionMinutes: 15,
      activationGraceMinutes: 5,
      emptyLiveEndSeconds: 120,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      mentionRoleId: MOD_ROLE,
      idleSessionMinutes: 15,
      activationGraceMinutes: 5,
      emptyLiveEndSeconds: 120,
    });
    for (const bad of [
      { idleSessionMinutes: 0 },
      { activationGraceMinutes: 999 },
      { emptyLiveEndSeconds: 1 },
      { mentionRoleId: '500000000000000098' }, // cargo inexistente
      { logChannelId: VOICE_1 }, // log tem que ser canal de texto
    ]) {
      expect((await send(admin, ctx, 'patch', '/settings', bad)).status, JSON.stringify(bad)).toBe(
        400,
      );
    }
    // limpar o cargo = ninguém é marcado
    const cleared = await send(admin, ctx, 'patch', '/settings', { mentionRoleId: null });
    expect(cleared.body.data.mentionRoleId).toBeNull();
  });
});

describe('lives nas calls escolhidas', () => {
  it('só as calls escolhidas viram live, mesmo fora da categoria', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    ctx.settings.settings.liveCategoryId = null; // sem categoria: só as escolhidas
    ctx.settings.settings.liveChannelIds = [VOICE_2];

    await ctx.live.handle({ userId: MEMBER, oldChannelId: null, newChannelId: VOICE_1 });
    expect(ctx.rooms.rooms.size).toBe(0);

    await ctx.live.handle({ userId: MEMBER, oldChannelId: VOICE_1, newChannelId: VOICE_2 });
    expect([...ctx.rooms.rooms.values()]).toMatchObject([
      { voiceChannelId: VOICE_2, type: 'LIVE' },
    ]);
    // o link vai para o chat da call escolhida
    expect(ctx.gateway.sent.at(-1)!.channelId).toBe(VOICE_2);
  });

  it('o tempo de call vazia vem do painel', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    ctx.settings.settings.emptyLiveEndSeconds = 300;
    await ctx.live.handle({ userId: MEMBER, oldChannelId: null, newChannelId: VOICE_1 });
    const room = [...ctx.rooms.rooms.values()][0]!;
    await ctx.live.handle({ userId: MEMBER, oldChannelId: VOICE_1, newChannelId: null });

    await ctx.scheduler.advance(299_000);
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('OPEN');
    await ctx.scheduler.advance(2_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('ENDED');
  });
});

describe('só reuniões têm moderação', () => {
  it('na live: silenciar, expulsar, banir, palestrante e editar são recusados com explicação', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    await ctx.live.handle({ userId: MEMBER, oldChannelId: null, newChannelId: VOICE_1 });
    await ctx.live.handle({ userId: MEMBER2, oldChannelId: null, newChannelId: VOICE_1 });
    const room = [...ctx.rooms.rooms.values()][0]!;
    for (const id of [MEMBER, MEMBER2]) {
      await ctx.participations.open({
        roomId: room.id,
        userId: id,
        displayName: id,
        avatarUrl: null,
        role: 'MEMBER',
        at: ctx.clock.now(),
      });
    }
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;

    const calls: ['post' | 'patch', string, object?][] = [
      ['post', `/rooms/${room.id}/participants/${MEMBER}/mute`],
      ['post', `/rooms/${room.id}/participants/${MEMBER}/kick`],
      ['post', `/rooms/${room.id}/participants/${MEMBER}/ban`, { durationMinutes: 5 }],
      ['post', `/rooms/${room.id}/participants/${MEMBER}/promote`],
      ['post', `/rooms/${room.id}/mute-all`],
      ['post', `/rooms/${room.id}/cameras-off`],
      ['post', `/rooms/${room.id}/end`],
      ['patch', `/rooms/${room.id}`, { lectureMode: true }],
    ];
    for (const [method, path, body] of calls) {
      const res = await send(admin, ctx, method, path, body);
      expect(res.status, path).toBe(409);
      expect(res.body.error.code, path).toBe('MODERATION_ONLY_IN_MEETINGS');
      expect(res.body.error.message).toMatch(/reuniões/);
    }
    expect(ctx.livekit.muted).toHaveLength(0);
    expect(ctx.auditRepo.records).toHaveLength(0);
  });
});

describe('ações em massa na reunião', () => {
  async function meetingWith(
    people: { id: string; role: 'MEMBER' | 'MOD' | 'ADMIN'; roles?: string[] }[],
  ) {
    const ctx = buildRoomsApp();
    const room = await openMeeting(ctx);
    for (const p of people) {
      ctx.discord.addMember(p.id, { roles: p.roles ?? [] });
      await ctx.participations.open({
        roomId: room.id,
        userId: p.id,
        displayName: p.id,
        avatarUrl: null,
        role: p.role,
        at: ctx.clock.now(),
      });
    }
    ctx.emitter.events.length = 0;
    ctx.auditRepo.records.length = 0;
    return { ctx, room };
  }

  it('silenciar todos desliga o microfone de quem está abaixo do admin, sem travar a pessoa', async () => {
    const { ctx, room } = await meetingWith([
      { id: MEMBER, role: 'MEMBER' },
      { id: MEMBER2, role: 'MEMBER' },
      { id: MOD, role: 'MOD', roles: [MOD_ROLE] },
    ]);
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const res = await send(admin, ctx, 'post', `/rooms/${room.id}/mute-all`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ affected: 3 });

    expect(ctx.livekit.muted.map((m) => [m.identity, m.sources])).toEqual([
      [MEMBER, ['microphone']],
      [MEMBER2, ['microphone']],
      [MOD, ['microphone']],
    ]);
    // não bloqueia: cada pessoa pode ligar de novo
    expect(await ctx.participations.getMutedSources(room.id, MEMBER)).toEqual([]);
    expect(ctx.emitter.of('moderation:action')).toHaveLength(3);
    expect(ctx.auditRepo.records).toMatchObject([
      { actorId: ADMIN, roomId: room.id, action: 'MEETING_MUTE_ALL', meta: { affected: 3 } },
    ]);
  });

  it('desligar todas as câmeras atinge câmera e tela, e não o microfone', async () => {
    const { ctx, room } = await meetingWith([{ id: MEMBER, role: 'MEMBER' }]);
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const res = await send(admin, ctx, 'post', `/rooms/${room.id}/cameras-off`);
    expect(res.body.data).toEqual({ affected: 1 });
    expect(ctx.livekit.muted[0]!.sources).toEqual(['camera', 'screen_share', 'screen_share_audio']);
    expect(ctx.auditRepo.records[0]!.action).toBe('MEETING_CAMERAS_OFF');
  });

  it('um MOD não atinge admins nem outros mods; ninguém atinge a si mesmo', async () => {
    const { ctx, room } = await meetingWith([
      { id: MEMBER, role: 'MEMBER' },
      { id: ADMIN, role: 'ADMIN', roles: [ADMIN_ROLE] },
      { id: MOD, role: 'MOD', roles: [MOD_ROLE] },
    ]);
    const mod = (await login(ctx, MOD, [MOD_ROLE])).agent;
    const res = await send(mod, ctx, 'post', `/rooms/${room.id}/mute-all`);
    expect(res.body.data).toEqual({ affected: 1 });
    expect(ctx.livekit.muted.map((m) => m.identity)).toEqual([MEMBER]);
  });

  it('membro comum não pode; reunião encerrada dá ROOM_NOT_OPEN', async () => {
    const { ctx, room } = await meetingWith([{ id: MEMBER, role: 'MEMBER' }]);
    const member = (await login(ctx, MEMBER)).agent;
    expect((await send(member, ctx, 'post', `/rooms/${room.id}/mute-all`)).status).toBe(403);

    await ctx.roomService.endRoom(room.id, 'ENDED_BY_ADMIN');
    const admin = (await login(ctx, ADMIN, [ADMIN_ROLE])).agent;
    const ended = await send(admin, ctx, 'post', `/rooms/${room.id}/mute-all`);
    expect(ended.status).toBe(409);
    expect(ended.body.error.code).toBe('ROOM_NOT_OPEN');
  });
});
