import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, openMeeting, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const USER = '980000000000000001';
const OTHER = '980000000000000002';
const MIN = 60_000;

async function login(ctx: RoomsCtx, userId: string) {
  ctx.discord.addMember(userId);
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

const join = (agent: ReturnType<typeof request.agent>, ctx: RoomsCtx, roomId: string) =>
  agent.post(`/api/v1/rooms/${roomId}/join`).set('Origin', ctx.origin).send();

/** Live aberta com alguém na call. */
async function liveRoom(ctx: RoomsCtx) {
  ctx.configureLives();
  await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
  return [...ctx.rooms.rooms.values()][0]!;
}

const publishing = (
  ctx: RoomsCtx,
  roomId: string,
  userId: string,
  source: 'camera' | 'screen_share' | 'microphone' = 'camera',
  muted = false,
) =>
  ctx.livekit.people.set(roomId, [
    ...(ctx.livekit.people.get(roomId) ?? []),
    { identity: userId, tracks: [{ source, muted }] },
  ]);

const sessionField = (payload: { embeds: Record<string, unknown>[] }) =>
  (payload.embeds[0]!.fields as { name: string; value: string }[]).find((f) => f.name === 'Sessão')
    ?.value;

describe('sessão de mídia: ativação', () => {
  it('a live nasce em espera e o primeiro join ativa (ativando sessão)', async () => {
    const ctx = buildRoomsApp();
    const room = await liveRoom(ctx);
    expect(ctx.rooms.rooms.get(room.id)!.mediaState).toBe('IDLE');

    const agent = await login(ctx, USER);
    const res = await join(agent, ctx, room.id);
    expect(res.status).toBe(200);
    expect(res.body.data.sessionActivated).toBe(true);
    expect(ctx.rooms.rooms.get(room.id)!.mediaState).toBe('ACTIVE');
    expect(ctx.emitter.of('room:updated').at(-1)!.payload).toMatchObject({
      changes: { mediaState: 'ACTIVE' },
    });
    expect(ctx.auditRepo.records.map((r) => r.action)).toContain('SESSION_ACTIVATED');

    // O segundo join não ativa de novo.
    await ctx.live.handle({ userId: OTHER, oldChannelId: null, newChannelId: VOICE_1 });
    const second = await join(await login(ctx, OTHER), ctx, room.id);
    expect(second.body.data.sessionActivated).toBe(false);
    expect(ctx.auditRepo.records.filter((r) => r.action === 'SESSION_ACTIVATED')).toHaveLength(1);
  });

  it('o embed mostra se a sessão está em uso ou em espera', async () => {
    const ctx = buildRoomsApp();
    const room = await liveRoom(ctx);
    expect(sessionField(ctx.gateway.sent[0]!.payload)).toContain('Em espera');

    await join(await login(ctx, USER), ctx, room.id);
    await ctx.scheduler.advance(15_000); // o intervalo mínimo entre edições do embed
    expect(sessionField(ctx.gateway.edits.at(-1)!.payload)).toContain('Em uso');
  });

  it('reunião não tem modo de espera', async () => {
    const ctx = buildRoomsApp();
    const room = await openMeeting(ctx);
    expect(room.mediaState).toBe('ACTIVE');
    const res = await join(await login(ctx, USER), ctx, room.id);
    expect(res.body.data.sessionActivated).toBe(false);
  });
});

describe('sessão de mídia: ociosidade', () => {
  async function active() {
    const ctx = buildRoomsApp();
    const room = await liveRoom(ctx);
    await join(await login(ctx, USER), ctx, room.id);
    await ctx.participations.open({
      roomId: room.id,
      userId: USER,
      displayName: 'x',
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });
    return { ctx, room };
  }

  it('ativou mas ninguém transmite: em espera depois da tolerância (3 min)', async () => {
    const { ctx, room } = await active();
    publishing(ctx, room.id, USER, 'microphone');

    ctx.clock.advance(2 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);
    expect(ctx.rooms.rooms.get(room.id)!.mediaState).toBe('ACTIVE');

    ctx.clock.advance(1.5 * MIN);
    expect((await ctx.media.tick()).idled).toBe(1);
    expect(ctx.rooms.rooms.get(room.id)!.mediaState).toBe('IDLE');
  });

  it('só microfone não conta como transmitir; câmera ou tela contam', async () => {
    const { ctx, room } = await active();
    publishing(ctx, room.id, USER, 'camera');
    ctx.clock.advance(30 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);

    ctx.livekit.people.set(room.id, []);
    publishing(ctx, room.id, USER, 'screen_share');
    ctx.clock.advance(30 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);
  });

  it('câmera desligada (faixa muda) não conta como transmitir', async () => {
    const { ctx, room } = await active();
    publishing(ctx, room.id, USER, 'camera', true);
    ctx.clock.advance(4 * MIN);
    expect((await ctx.media.tick()).idled).toBe(1);
  });

  it('depois que alguém transmitiu vale a ociosidade (10 min), contada do último momento transmitindo', async () => {
    const { ctx, room } = await active();
    publishing(ctx, room.id, USER, 'camera');
    ctx.clock.advance(5 * MIN);
    await ctx.media.tick(); // viu transmitindo
    ctx.livekit.people.set(room.id, [{ identity: USER, tracks: [] }]); // parou

    ctx.clock.advance(9 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);
    ctx.clock.advance(2 * MIN);
    expect((await ctx.media.tick()).idled).toBe(1);
  });

  it('ninguém conectado ao site: em espera em ~1 minuto, mesmo com a tolerância maior', async () => {
    const { ctx, room } = await active();
    ctx.livekit.people.set(room.id, []);
    ctx.clock.advance(30_000);
    expect((await ctx.media.tick()).idled).toBe(0);
    ctx.clock.advance(40_000);
    expect((await ctx.media.tick()).idled).toBe(1);
  });

  it('ao entrar em espera: avisa a sala, derruba o LiveKit, fecha participações e audita', async () => {
    const { ctx, room } = await active();
    ctx.livekit.people.set(room.id, [{ identity: USER, tracks: [] }]);
    ctx.emitter.events.length = 0;
    ctx.clock.advance(4 * MIN);
    await ctx.media.tick();

    expect(ctx.emitter.of('session:idle')[0]).toMatchObject({
      target: 'room',
      id: room.id,
      payload: { roomId: room.id, reason: 'NOBODY_STREAMING' },
    });
    expect(ctx.emitter.of('participant:left')[0]!.payload).toMatchObject({
      userId: USER,
      reason: 'SESSION_IDLE',
    });
    expect(ctx.livekit.deleted).toContain(room.id);
    expect(await ctx.participations.countOpen(room.id)).toBe(0);
    expect(ctx.auditRepo.records.map((r) => r.action)).toContain('SESSION_IDLE');
    // A live em si continua aberta: o link no chat da call segue valendo.
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('OPEN');
  });

  it('quem volta pelo link ativa de novo, sem criar outra live nem outra mensagem', async () => {
    const { ctx, room } = await active();
    ctx.livekit.people.set(room.id, []);
    ctx.clock.advance(2 * MIN);
    await ctx.media.tick();
    expect(ctx.rooms.rooms.get(room.id)!.mediaState).toBe('IDLE');

    const res = await join(await login(ctx, USER), ctx, room.id);
    expect(res.body.data.sessionActivated).toBe(true);
    expect(ctx.rooms.rooms.size).toBe(1);
    expect(ctx.gateway.sent).toHaveLength(1);
    expect(ctx.auditRepo.records.filter((r) => r.action === 'SESSION_ACTIVATED')).toHaveLength(2);
  });

  it('LiveKit fora do ar: não derruba ninguém por falta de informação', async () => {
    const { ctx, room } = await active();
    ctx.livekit.down = true;
    ctx.clock.advance(60 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);
    expect(ctx.rooms.rooms.get(room.id)!.mediaState).toBe('ACTIVE');
  });

  it('live encerrada para de ser acompanhada; reunião nunca entra em espera', async () => {
    const { ctx, room } = await active();
    await ctx.roomService.endRoom(room.id, 'VOICE_EMPTY');
    ctx.clock.advance(60 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);

    const meeting = await openMeeting(ctx);
    ctx.clock.advance(60 * MIN);
    await ctx.media.tick();
    expect(ctx.rooms.rooms.get(meeting.id)!.mediaState).toBe('ACTIVE');
  });

  it('os tempos vêm do painel', async () => {
    const { ctx, room } = await active();
    ctx.settings.settings.activationGraceMinutes = 10;
    ctx.livekit.people.set(room.id, [{ identity: USER, tracks: [] }]);
    ctx.clock.advance(9 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);
    ctx.clock.advance(2 * MIN);
    expect((await ctx.media.tick()).idled).toBe(1);
  });

  it('reiniciar a API retoma o acompanhamento das lives ativas com um prazo novo', async () => {
    const { ctx, room } = await active();
    // Simula reinício: perde a memória, mas o banco diz que está ativa.
    (ctx.media as unknown as { tracking: Map<string, unknown> }).tracking.clear();
    await ctx.media.reconcile();
    ctx.livekit.people.set(room.id, [{ identity: USER, tracks: [] }]);
    ctx.clock.advance(2 * MIN);
    expect((await ctx.media.tick()).idled).toBe(0);
    ctx.clock.advance(2 * MIN);
    expect((await ctx.media.tick()).idled).toBe(1);
  });
});
