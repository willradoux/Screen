import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildRoomsApp,
  connectSocket,
  openMeeting,
  type RoomsCtx,
} from '../fixtures/rooms-fakes.js';

const ANA = '996000000000000001';
const BETO = '996000000000000002';

const open: Socket[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) s.close();
  for (const c of closers.splice(0)) await c();
});

async function cookieOf(ctx: RoomsCtx, id: string) {
  ctx.discord.addMember(id);
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  const cb = await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${id}`, state });
  return `screem_sid=${/screem_sid=([^;]+)/.exec((cb.headers['set-cookie'] as unknown as string[]).join(';'))![1]!}`;
}
const connect = async (url: string, cookie: string) => {
  const s = connectSocket(url, cookie);
  open.push(s);
  await new Promise<void>((res, rej) => {
    s.once('connect', () => res());
    s.once('connect_error', rej);
  });
  return s;
};
const emitAck = (s: Socket, event: string, payload: unknown) =>
  new Promise<{ ok: boolean; error?: { code: string } }>((res) => s.emit(event, payload, res));

async function setup() {
  const ctx = buildRoomsApp();
  const server = await ctx.listen();
  closers.push(server.close);
  const room = await openMeeting(ctx);
  for (const id of [ANA, BETO]) {
    await ctx.participations.open({
      roomId: room.id,
      userId: id,
      displayName: `Nome ${id.slice(-1)}`,
      avatarUrl: null,
      role: 'MEMBER',
      at: ctx.clock.now(),
    });
  }
  const a = await connect(server.url, await cookieOf(ctx, ANA));
  const b = await connect(server.url, await cookieOf(ctx, BETO));
  await emitAck(a, 'room:subscribe', { roomId: room.id });
  await emitAck(b, 'room:subscribe', { roomId: room.id });
  return { ctx, room, a, b };
}

describe('legenda ao vivo (caption:send)', () => {
  it('quem fala manda o texto e a sala toda recebe com o nome', async () => {
    const { room, a, b } = await setup();
    const got = new Promise<Record<string, unknown>>((res) => b.once('caption', res));
    expect(
      (await emitAck(a, 'caption:send', { roomId: room.id, text: ' Olá, pessoal ', final: true }))
        .ok,
    ).toBe(true);
    expect(await got).toMatchObject({
      roomId: room.id,
      userId: ANA,
      displayName: 'Nome 1',
      text: 'Olá, pessoal',
      final: true,
    });
  });

  it('exige acompanhar a sala e estar conectado nela', async () => {
    const { ctx, room, a } = await setup();
    const outsider = await connect(
      ctx.env.WEB_URL && (await ctx.listen()).url,
      await cookieOf(ctx, '996000000000000009'),
    );
    expect(await emitAck(outsider, 'caption:send', { roomId: room.id, text: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    await ctx.participations.close(room.id, ANA, 'LEFT', ctx.clock.now());
    expect(await emitAck(a, 'caption:send', { roomId: room.id, text: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'PARTICIPANT_NOT_IN_ROOM' },
    });
  });

  it('recusa texto vazio, enorme ou formato errado', async () => {
    const { room, a } = await setup();
    for (const bad of [
      { roomId: room.id, text: '   ' },
      { roomId: room.id, text: 'x'.repeat(301) },
      { roomId: 'curto', text: 'oi' },
      null,
    ]) {
      expect((await emitAck(a, 'caption:send', bad)).ok).toBe(false);
    }
  });

  it('limite de 30 legendas a cada 10 segundos', async () => {
    const { room, a } = await setup();
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      const r = await emitAck(a, 'caption:send', { roomId: room.id, text: `fala ${i}` });
      if (r.error?.code === 'RATE_LIMITED') limited++;
    }
    expect(limited).toBe(10);
  });
});
