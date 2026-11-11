import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { MOD_ROLE } from '../fixtures/fakes.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, connectSocket, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const USER = '930000000000000001';
const OTHER = '930000000000000002';
const MOD = '930000000000000003';
const LATE = '930000000000000009';

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
  return `screem_sid=${sid}`;
}

async function start(ownerIds: string[] = []) {
  const ctx = buildRoomsApp({ ownerIds });
  const server = await ctx.listen();
  closers.push(server.close);
  await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
  const room = [...ctx.rooms.rooms.values()][0]!;
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

interface SubscribeReply {
  ok: boolean;
  data: { poll: unknown; pendingPolls?: unknown[]; chatMode?: string };
}

/** Pessoa conectada na sala (participação aberta) e com o socket assinando a sala. */
async function joinRoom(
  ctx: RoomsCtx,
  url: string,
  roomId: string,
  userId: string,
  name: string,
  roles: string[] = [],
) {
  await ctx.participations.open({
    roomId,
    userId,
    displayName: name,
    avatarUrl: null,
    role: roles.length ? 'MOD' : 'MEMBER',
    at: ctx.clock.now(),
  });
  const socket = connect(url, await sessionCookie(ctx, userId, roles));
  await connected(socket);
  const sub = await emitAck<SubscribeReply>(socket, 'room:subscribe', { roomId });
  return { socket, sub };
}

describe('chat da sala', () => {
  it('admin geral desliga o chat, deixa só para admins e liga de novo; ninguém mais muda', async () => {
    const OWNER = '930000000000000007';
    const { ctx, server, room } = await start([OWNER]);
    const owner = await joinRoom(ctx, server.url, room.id, OWNER, 'Dono');
    const member = await joinRoom(ctx, server.url, room.id, OTHER, 'Ciclano');
    const mod = await joinRoom(ctx, server.url, room.id, MOD, 'Mod', [MOD_ROLE]);
    expect(member.sub.data.chatMode).toBe('open');

    // Só o admin geral muda o modo.
    const denied = await emitAck(mod.socket, 'chat:mode', { roomId: room.id, mode: 'off' });
    expect(denied.error?.code).toBe('FORBIDDEN');

    // Desligado: todo mundo é avisado e ninguém escreve (o dono ainda pode avisar a sala).
    const told = once<{ mode: string }>(member.socket, 'chat:mode');
    expect((await emitAck(owner.socket, 'chat:mode', { roomId: room.id, mode: 'off' })).ok).toBe(
      true,
    );
    expect((await told).mode).toBe('off');
    const off = await emitAck(member.socket, 'chat:send', { roomId: room.id, text: 'oi' });
    expect(off.error?.code).toBe('CHAT_CLOSED');
    expect((await emitAck(owner.socket, 'chat:send', { roomId: room.id, text: 'pausa' })).ok).toBe(
      true,
    );

    // Quem entra depois já sabe o modo.
    const late = await joinRoom(ctx, server.url, room.id, LATE, 'Atrasado');
    expect(late.sub.data.chatMode).toBe('off');

    // Só admins: MOD e membro não escrevem.
    await emitAck(owner.socket, 'chat:mode', { roomId: room.id, mode: 'admins' });
    const modTry = await emitAck(mod.socket, 'chat:send', { roomId: room.id, text: 'oi' });
    expect(modTry.error?.code).toBe('CHAT_CLOSED');

    // Ligado de novo: volta ao normal.
    await emitAck(owner.socket, 'chat:mode', { roomId: room.id, mode: 'open' });
    expect(
      (await emitAck(member.socket, 'chat:send', { roomId: room.id, text: 'voltou' })).ok,
    ).toBe(true);
  });

  it('"digitando" sai como resumo da sala (1 por segundo), com quem está digitando', async () => {
    const { ctx, server, room } = await start();
    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    const b = await joinRoom(ctx, server.url, room.id, OTHER, 'Ciclano');
    let summaries = 0;
    b.socket.on('chat:typing', () => summaries++);
    const got = once<{ people: { userId: string; name: string }[]; count: number }>(
      b.socket,
      'chat:typing',
    );
    a.socket.emit('chat:typing', { roomId: room.id });
    a.socket.emit('chat:typing', { roomId: room.id });
    b.socket.emit('chat:typing', { roomId: room.id });
    const summary = await got;
    expect(summary.count).toBe(2);
    expect(summary.people.map((p) => p.name).sort()).toEqual(['Ciclano', 'Fulano']);
    await new Promise((r) => setTimeout(r, 200));
    expect(summaries).toBe(1);
  });

  it('a mensagem chega a todos da sala, com nome; o texto vem aparado', async () => {
    const { ctx, server, room } = await start();
    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    const b = await joinRoom(ctx, server.url, room.id, OTHER, 'Ciclano');
    const got = once<{ text: string; displayName: string; userId: string }>(
      b.socket,
      'chat:message',
    );
    const res = await emitAck(a.socket, 'chat:send', { roomId: room.id, text: '  oi galera  ' });
    expect(res.ok).toBe(true);
    expect(await got).toMatchObject({ text: 'oi galera', displayName: 'Fulano', userId: USER });
  });

  it('uma mensagem a cada 3 s por pessoa (contra spam)', async () => {
    const { ctx, server, room } = await start();
    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    expect((await emitAck(a.socket, 'chat:send', { roomId: room.id, text: '1' })).ok).toBe(true);
    expect(await emitAck(a.socket, 'chat:send', { roomId: room.id, text: '2' })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('no modo live a plateia espera 5 s; quem está no palco, 3 s', async () => {
    const { ctx, server, room } = await start();
    const r = ctx.rooms.rooms.get(room.id)!;
    r.lectureMode = true;
    r.speakerIds = [OTHER];
    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    const b = await joinRoom(ctx, server.url, room.id, OTHER, 'Ciclano');
    const audience = await emitAck<{ ok: boolean; data: { cooldownMs: number } }>(
      a.socket,
      'chat:send',
      { roomId: room.id, text: 'oi' },
    );
    expect(audience.data.cooldownMs).toBe(5_000);
    const speaker = await emitAck<{ ok: boolean; data: { cooldownMs: number } }>(
      b.socket,
      'chat:send',
      { roomId: room.id, text: 'oi' },
    );
    expect(speaker.data.cooldownMs).toBe(3_000);
    const again = await emitAck<{ ok: boolean; retryInMs: number }>(a.socket, 'chat:send', {
      roomId: room.id,
      text: 'de novo',
    });
    expect(again.ok).toBe(false);
    expect(again.retryInMs).toBeGreaterThan(3_000);
  });

  it('quem não está na sala não escreve; silenciado pela moderação também não', async () => {
    const { ctx, server, room } = await start();
    const outsider = connect(server.url, await sessionCookie(ctx, OTHER));
    await connected(outsider);
    expect(await emitAck(outsider, 'chat:send', { roomId: room.id, text: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    await ctx.participations.setMutedSources(room.id, USER, ['microphone']);
    expect(await emitAck(a.socket, 'chat:send', { roomId: room.id, text: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'MUTED' },
    });
  });

  it('valida o texto (1 a 500 caracteres)', async () => {
    const { ctx, server, room } = await start();
    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    for (const text of ['   ', 'x'.repeat(501)]) {
      expect(await emitAck(a.socket, 'chat:send', { roomId: room.id, text })).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    }
  });

  it('só a moderação apaga mensagem (some para todos)', async () => {
    const { ctx, server, room } = await start();
    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    const mod = await joinRoom(ctx, server.url, room.id, MOD, 'Mod', [MOD_ROLE]);
    expect(await emitAck(a.socket, 'chat:delete', { roomId: room.id, id: 'm1' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    const gone = once<{ id: string }>(a.socket, 'chat:deleted');
    expect((await emitAck(mod.socket, 'chat:delete', { roomId: room.id, id: 'm1' })).ok).toBe(true);
    expect((await gone).id).toBe('m1');
  });
});

/** Liga o palco (modo live), onde a enquete existe. */
const liveMode = (ctx: RoomsCtx, roomId: string) => {
  ctx.rooms.rooms.get(roomId)!.lectureMode = true;
};

describe('enquete', () => {
  it('só existe no modo live (palco ligado); na sala comum o servidor recusa', async () => {
    const { ctx, server, room } = await start();
    const mod = await joinRoom(ctx, server.url, room.id, MOD, 'Mod', [MOD_ROLE]);
    expect(
      await emitAck(mod.socket, 'poll:propose', {
        roomId: room.id,
        question: 'Pausa?',
        options: ['Sim', 'Não'],
      }),
    ).toMatchObject({ ok: false, error: { code: 'POLLS_DISABLED' } });
  });

  it('membro sugere, a moderação aceita, todos veem no topo e votam uma vez', async () => {
    const { ctx, server, room } = await start();
    liveMode(ctx, room.id);
    const a = await joinRoom(ctx, server.url, room.id, USER, 'Fulano');
    const mod = await joinRoom(ctx, server.url, room.id, MOD, 'Mod', [MOD_ROLE]);
    expect(mod.sub.data.pendingPolls).toEqual([]);
    expect(a.sub.data.pendingPolls).toBeUndefined();

    const pending = once<{ polls: { id: string; question: string }[] }>(mod.socket, 'poll:pending');
    const sent = await emitAck<{ ok: boolean; data: { id: string; status: string } }>(
      a.socket,
      'poll:propose',
      { roomId: room.id, question: 'Próximo tema?', options: ['React', 'Node'] },
    );
    expect(sent).toMatchObject({ ok: true, data: { status: 'pending' } });
    expect((await pending).polls).toEqual([expect.objectContaining({ question: 'Próximo tema?' })]);

    // Membro não aprova.
    expect(
      await emitAck(a.socket, 'poll:approve', { roomId: room.id, pollId: sent.data.id }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    const opened = once<{ poll: { id: string; status: string } }>(a.socket, 'poll:state');
    const approved = await emitAck(mod.socket, 'poll:approve', {
      roomId: room.id,
      pollId: sent.data.id,
    });
    expect(approved.ok).toBe(true);
    expect((await opened).poll).toMatchObject({ id: sent.data.id, status: 'open' });

    const counted = once<{ poll: { total: number; options: { votes: number }[] } }>(
      mod.socket,
      'poll:state',
    );
    const vote = (option: number) =>
      emitAck(a.socket, 'poll:vote', { roomId: room.id, pollId: sent.data.id, option });
    expect((await vote(1)).ok).toBe(true);
    expect(await vote(0)).toMatchObject({ ok: false, error: { code: 'ALREADY_VOTED' } });
    const state = (await counted).poll;
    expect(state.total).toBe(1);
    expect(state.options.map((o) => o.votes)).toEqual([0, 1]);

    // Quem entra depois já vê a enquete do topo.
    const late = await joinRoom(ctx, server.url, room.id, LATE, 'Beltrano');
    expect(late.sub.data.poll).toMatchObject({ id: sent.data.id, total: 1 });
  });

  it('enquete da moderação já abre; encerrar mostra o resultado e tirar remove do topo', async () => {
    const { ctx, server, room } = await start();
    liveMode(ctx, room.id);
    const mod = await joinRoom(ctx, server.url, room.id, MOD, 'Mod', [MOD_ROLE]);
    const opened = once<{ poll: { status: string } }>(mod.socket, 'poll:state');
    const sent = await emitAck<{ ok: boolean; data: { id: string; status: string } }>(
      mod.socket,
      'poll:propose',
      { roomId: room.id, question: 'Pausa?', options: ['Sim', 'Não'] },
    );
    expect(sent.data.status).toBe('open');
    expect((await opened).poll.status).toBe('open');

    const closed = once<{ poll: { status: string } }>(mod.socket, 'poll:state');
    await emitAck(mod.socket, 'poll:close', { roomId: room.id, pollId: sent.data.id });
    expect((await closed).poll.status).toBe('closed');

    const cleared = once<{ poll: unknown }>(mod.socket, 'poll:state');
    await emitAck(mod.socket, 'poll:clear', { roomId: room.id, pollId: sent.data.id });
    expect((await cleared).poll).toBeNull();
  });
});
