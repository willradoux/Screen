import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';
import {
  buildRoomsApp,
  connectSocket,
  type RoomsCtx,
  openMeeting,
} from '../fixtures/rooms-fakes.js';

const USER = '960000000000000001';
const OTHER = '960000000000000002';
const MOD = '960000000000000003';
const ADMIN = '960000000000000004';

const open: Socket[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) s.close();
  for (const c of closers.splice(0)) await c();
});

async function login(ctx: RoomsCtx, userId: string, roles: string[] = []) {
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

async function start() {
  const ctx = buildRoomsApp();
  const server = await ctx.listen();
  closers.push(server.close);
  const room = await openMeeting(ctx);
  return { ctx, server, room };
}

const join = (ctx: RoomsCtx, roomId: string, userId: string) =>
  ctx.participations.open({
    roomId,
    userId,
    displayName: userId,
    avatarUrl: null,
    role: 'MEMBER',
    at: ctx.clock.now(),
  });

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
const subscribe = (socket: Socket, roomId: string) =>
  new Promise((resolve) => socket.emit('room:subscribe', { roomId }, resolve));
const settle = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const post = (
  agent: ReturnType<typeof request.agent>,
  ctx: RoomsCtx,
  path: string,
  body?: object,
) => agent.post(`/api/v1${path}`).set('Origin', ctx.origin).send(body);

describe('moderação em tempo real', () => {
  it('o alvo recebe moderation:action; quem assinou a sala recebe participant:updated; o aviso pessoal não vaza', async () => {
    const { ctx, server, room } = await start();
    await join(ctx, room.id, USER);
    await join(ctx, room.id, OTHER);
    await ctx.live.handle({ userId: OTHER, oldChannelId: null, newChannelId: VOICE_1 });

    const targetCookie = (await login(ctx, USER)).cookie;
    const watcherCookie = (await login(ctx, OTHER)).cookie;
    const mod = await login(ctx, MOD, [MOD_ROLE]);
    const target = connect(server.url, targetCookie);
    const watcher = connect(server.url, watcherCookie);
    await Promise.all([connected(target), connected(watcher)]);
    await subscribe(watcher, room.id);

    const action = once<{ action: string; by: string; reason: string }>(
      target,
      'moderation:action',
    );
    const updated = once<{ userId: string; mutedByModeration: boolean }>(
      watcher,
      'participant:updated',
    );
    let leaked = false;
    watcher.on('moderation:action', () => (leaked = true));

    const res = await post(mod.agent, ctx, `/rooms/${room.id}/participants/${USER}/mute`, {
      reason: 'ruído',
    });
    expect(res.status).toBe(204);

    expect(await action).toMatchObject({ action: 'MUTED', by: MOD, reason: 'ruído' });
    expect(await updated).toMatchObject({ userId: USER, mutedByModeration: true });
    await settle();
    expect(leaked).toBe(false);
  });

  it('quem foi expulso recebe KICKED mesmo sem ter assinado a sala', async () => {
    const { ctx, server, room } = await start();
    await join(ctx, room.id, USER);
    const targetCookie = (await login(ctx, USER)).cookie;
    const mod = await login(ctx, MOD, [MOD_ROLE]);
    const target = connect(server.url, targetCookie);
    await connected(target);

    const action = once<{ action: string }>(target, 'moderation:action');
    await post(mod.agent, ctx, `/rooms/${room.id}/participants/${USER}/kick`);
    expect((await action).action).toBe('KICKED');
  });

  it('settings:updated chega só aos administradores conectados', async () => {
    const { ctx, server } = await start();
    const adminLogin = await login(ctx, ADMIN, [ADMIN_ROLE]);
    const userCookie = (await login(ctx, USER)).cookie;
    const adminSocket = connect(server.url, adminLogin.cookie);
    const userSocket = connect(server.url, userCookie);
    await Promise.all([connected(adminSocket), connected(userSocket)]);
    let leaked = false;
    userSocket.on('settings:updated', () => (leaked = true));

    const got = once<{ keys: string[] }>(adminSocket, 'settings:updated');
    const res = await adminLogin.agent
      .patch('/api/v1/settings')
      .set('Origin', ctx.origin)
      .send({ graceSeconds: 60 });
    expect(res.status).toBe(200);
    expect((await got).keys).toEqual(['graceSeconds']);
    await settle();
    expect(leaked).toBe(false);
  });

  it('room:updated chega a quem assinou a sala quando o modo palestra muda', async () => {
    const { ctx, server, room } = await start();
    await join(ctx, room.id, USER);
    const cookie = (await login(ctx, USER)).cookie;
    const mod = await login(ctx, MOD, [MOD_ROLE]);
    const socket = connect(server.url, cookie);
    await connected(socket);
    await subscribe(socket, room.id);

    const got = once<{ roomId: string; changes: { lectureMode: boolean } }>(socket, 'room:updated');
    await mod.agent
      .patch(`/api/v1/rooms/${room.id}`)
      .set('Origin', ctx.origin)
      .send({ lectureMode: true });
    expect(await got).toEqual({ roomId: room.id, changes: { lectureMode: true } });
  });
});
