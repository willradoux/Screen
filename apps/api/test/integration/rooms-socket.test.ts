import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { MOD_ROLE } from '../fixtures/fakes.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, connectSocket, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const USER = '930000000000000001';
const OTHER = '930000000000000002';
const MOD = '930000000000000003';

const open: Socket[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) s.close();
  for (const c of closers.splice(0)) await c();
});

/** Faz login e devolve o cookie de sessão para o handshake do socket. */
async function sessionCookie(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  const cb = await agent
    .get('/api/v1/auth/discord/callback')
    .query({ code: `code-${userId}`, state });
  const sid = /screem_sid=([^;]+)/.exec(
    (cb.headers['set-cookie'] as unknown as string[]).join(';'),
  )![1]!;
  return { cookie: `screem_sid=${sid}`, agent };
}

async function start(roles: Record<string, string[]> = {}) {
  const ctx = buildRoomsApp();
  const server = await ctx.listen();
  closers.push(server.close);
  await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
  const room = [...ctx.rooms.rooms.values()][0]!;
  void roles;
  return { ctx, server, room };
}

const connect = (url: string, cookie: string) => {
  const socket = connectSocket(url, cookie);
  open.push(socket);
  return socket;
};

const once = <T = unknown>(socket: Socket, event: string) =>
  new Promise<T>((resolve) => socket.once(event, (data: T) => resolve(data)));

const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (e) => reject(e));
  });

const emitAck = <T = { ok: boolean; data?: unknown; error?: { code: string } }>(
  socket: Socket,
  event: string,
  payload: unknown,
) => new Promise<T>((resolve) => socket.emit(event, payload, resolve));

describe('conexão e autenticação', () => {
  it('conecta com o cookie de sessão', async () => {
    const { ctx, server } = await start();
    const { cookie } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await expect(connected(socket)).resolves.toBeUndefined();
  });

  it('sem cookie, ou com cookie inválido -> UNAUTHENTICATED', async () => {
    const { server } = await start();
    for (const cookie of ['', 'screem_sid=naoexiste']) {
      const socket = connect(server.url, cookie);
      await expect(connected(socket)).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
    }
  });

  it('no máximo 3 conexões por usuário', async () => {
    const { ctx, server } = await start();
    const { cookie } = await sessionCookie(ctx, USER);
    for (let i = 0; i < 3; i++) await connected(connect(server.url, cookie));
    const fourth = connect(server.url, cookie);
    await expect(connected(fourth)).rejects.toMatchObject({ message: 'TOO_MANY_CONNECTIONS' });

    // Fechar uma abre vaga.
    open[0]!.close();
    await new Promise((r) => setTimeout(r, 100));
    const again = connect(server.url, cookie);
    await expect(connected(again)).resolves.toBeUndefined();
  });
});

describe('room:subscribe', () => {
  it('quem está na call recebe o snapshot da sala', async () => {
    const { ctx, server, room } = await start();
    await ctx.participations.open({
      roomId: room.id,
      userId: USER,
      displayName: 'Fulano',
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });
    const { cookie } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await connected(socket);

    const res = await emitAck<{
      ok: true;
      data: {
        room: { id: string; participantCount: number };
        participants: { userId: string; displayName: string }[];
      };
    }>(socket, 'room:subscribe', { roomId: room.id });
    expect(res.ok).toBe(true);
    expect(res.data.room).toMatchObject({ id: room.id, participantCount: 1 });
    expect(res.data.participants).toEqual([
      expect.objectContaining({
        userId: USER,
        displayName: 'Fulano',
        role: 'MEMBER',
        isSpeaker: false,
      }),
    ]);
  });

  it('quem não está na call recebe FORBIDDEN; MOD pode assinar mesmo fora dela', async () => {
    const { ctx, server, room } = await start();
    const outsider = await sessionCookie(ctx, OTHER);
    const s1 = connect(server.url, outsider.cookie);
    await connected(s1);
    const denied = await emitAck(s1, 'room:subscribe', { roomId: room.id });
    expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    const mod = await sessionCookie(ctx, MOD, [MOD_ROLE]);
    const s2 = connect(server.url, mod.cookie);
    await connected(s2);
    expect((await emitAck(s2, 'room:subscribe', { roomId: room.id })).ok).toBe(true);
  });

  it('valida a entrada e a existência da sala', async () => {
    const { ctx, server } = await start();
    const { cookie } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await connected(socket);

    expect(await emitAck(socket, 'room:subscribe', { roomId: 'curto' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await emitAck(socket, 'room:subscribe', null)).toMatchObject({ ok: false });
    expect(await emitAck(socket, 'room:subscribe', { roomId: 'x'.repeat(22) })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
  });
});

describe('eventos entregues em tempo real', () => {
  it('participant:joined e room:ended chegam a quem assinou a sala', async () => {
    const { ctx, server, room } = await start();
    const { cookie } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await connected(socket);
    await emitAck(socket, 'room:subscribe', { roomId: room.id });

    const joined = once<{ participant: { userId: string } }>(socket, 'participant:joined');
    const { body, auth } = ctx.sendWebhook({
      event: 'participant_joined',
      roomName: room.id,
      participant: {
        identity: USER,
        name: 'Fulano',
        metadata: JSON.stringify({ role: 'MEMBER', avatarUrl: null }),
        leaveCause: 'other',
      },
    });
    await request(ctx.app).post('/api/v1/livekit/webhook').set('Authorization', auth).send(body);
    expect((await joined).participant.userId).toBe(USER);

    const ended = once<{ roomId: string; reason: string }>(socket, 'room:ended');
    await ctx.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    expect(await ended).toEqual({ roomId: room.id, reason: 'ENDED_BY_MOD' });
  });

  it('quem NÃO assinou a sala não recebe os eventos dela', async () => {
    const { ctx, server, room } = await start();
    const { cookie } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await connected(socket);
    let received = false;
    socket.on('room:ended', () => (received = true));

    await ctx.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    await new Promise((r) => setTimeout(r, 150));
    expect(received).toBe(false);
  });

  it('room:unsubscribe para de receber', async () => {
    const { ctx, server, room } = await start();
    const { cookie } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await connected(socket);
    await emitAck(socket, 'room:subscribe', { roomId: room.id });
    await emitAck(socket, 'room:unsubscribe', { roomId: room.id });

    let received = false;
    socket.on('room:ended', () => (received = true));
    await ctx.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    await new Promise((r) => setTimeout(r, 150));
    expect(received).toBe(false);
  });

  it('avisos pessoais (voice:warning) chegam só ao próprio usuário', async () => {
    const { ctx, server, room } = await start();
    await ctx.live.handle({ userId: OTHER, oldChannelId: null, newChannelId: VOICE_1 });
    await ctx.participations.open({
      roomId: room.id,
      userId: USER,
      displayName: 'x',
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });

    // Primeiro os dois logins; só então abre os sockets (conectam rápido demais para esperar login no meio).
    const mineCookie = (await sessionCookie(ctx, USER)).cookie;
    const theirsCookie = (await sessionCookie(ctx, OTHER)).cookie;
    const mine = connect(server.url, mineCookie);
    const theirs = connect(server.url, theirsCookie);
    await Promise.all([connected(mine), connected(theirs)]);
    let leaked = false;
    theirs.on('voice:warning', () => (leaked = true));

    const warning = once<{ roomId: string; secondsLeft: number }>(mine, 'voice:warning');
    await ctx.live.handle({ userId: USER, oldChannelId: VOICE_1, newChannelId: null });
    expect(await warning).toEqual({ roomId: room.id, secondsLeft: 30 });
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);
  });
});

describe('sessão revogada', () => {
  it('logout derruba os sockets daquela sessão com session:revoked', async () => {
    const { ctx, server } = await start();
    const { cookie, agent } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await connected(socket);

    const revoked = once(socket, 'session:revoked');
    const disconnected = once(socket, 'disconnect');
    await agent.post('/api/v1/auth/logout').set('Origin', ctx.origin);
    await revoked;
    await disconnected;
    expect(socket.connected).toBe(false);
  });

  it('bloqueio do usuário derruba todos os sockets dele', async () => {
    const { ctx, server } = await start();
    const { cookie, agent } = await sessionCookie(ctx, USER);
    const socket = connect(server.url, cookie);
    await connected(socket);

    const disconnected = once(socket, 'disconnect');
    ctx.users.users.get(USER)!.blocked = true;
    await agent.get('/api/v1/auth/me'); // detecta o bloqueio e revoga as sessões
    await disconnected;
    expect(socket.connected).toBe(false);
  });
});
