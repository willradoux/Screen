import { pino } from 'pino';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { REDACT_PATHS } from '../../src/shared/logger.js';
import { ADMIN_ROLE } from '../fixtures/fakes.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildTestApp } from '../fixtures/fakes.js';
import { buildRoomsApp, connectSocket, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const ADMIN = '980000000000000001';
const USER = '980000000000000002';
const WEB = 'http://localhost:5173';

type Agent = ReturnType<typeof request.agent>;

async function loginAs(ctx: RoomsCtx, userId: string, roles: string[] = []) {
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
  return { agent, cookie: `screem_sid=${sid}` };
}

const post = (agent: Agent, ctx: RoomsCtx, path: string, body?: unknown) =>
  agent
    .post(`/api/v1${path}`)
    .set('Origin', ctx.origin)
    .send(body as object);

describe('logs', () => {
  function capturedApp() {
    const base = buildTestApp();
    const lines: string[] = [];
    const logger = pino(
      { level: 'info', redact: REDACT_PATHS },
      { write: (chunk: string) => void lines.push(chunk) },
    );
    const app = createApp(base.env, logger as never, { auth: base.auth });
    return { ...base, app, lines };
  }

  it('nunca registram a query: no retorno do Discord ela traz o code do OAuth', async () => {
    const { app, lines } = capturedApp();
    await request(app)
      .get('/api/v1/auth/discord/callback')
      .query({ code: 'SEGREDO-DO-OAUTH', state: 'ESTADO-123' });
    const all = lines.join('\n');
    expect(all).toContain('/api/v1/auth/discord/callback');
    expect(all).not.toContain('SEGREDO-DO-OAUTH');
    expect(all).not.toContain('ESTADO-123');
    expect(JSON.parse(lines.at(-1)!).req.url).toBe('/api/v1/auth/discord/callback');
  });

  it('nunca registram cookie de sessão (enviado ou recebido) nem o cabeçalho Authorization', async () => {
    const { app, lines, discord } = capturedApp();
    discord.addMember(USER);
    const agent = request.agent(app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const cb = await agent
      .get('/api/v1/auth/discord/callback')
      .query({ code: `code-${USER}`, state });
    const sid = /screem_sid=([^;]+)/.exec(
      (cb.headers['set-cookie'] as unknown as string[]).join(';'),
    )![1]!;
    await agent.get('/api/v1/auth/me').set('Authorization', 'Bearer TOKEN-SECRETO');
    await new Promise((r) => setTimeout(r, 50));

    const all = lines.join(String.fromCharCode(10));
    expect(all).not.toContain(sid); // nem o cookie novo (set-cookie) nem o enviado depois
    expect(all).not.toContain('TOKEN-SECRETO');
    expect(all).toContain('[Redacted]');
  });

  it('o caminho continua registrado (para investigar problemas)', async () => {
    const { app, lines } = capturedApp();
    await request(app).get('/api/v1/health?x=1');
    await new Promise((r) => setTimeout(r, 50));
    expect(JSON.parse(lines.at(-1)!).req).toMatchObject({ method: 'GET', url: '/api/v1/health' });
  });
});

describe('X-Request-Id', () => {
  const app = buildTestApp().app;

  it('aceita um id com cara de id e devolve o mesmo', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'req-123.ABC_def');
    expect(res.headers['x-request-id']).toBe('req-123.ABC_def');
  });

  it.each([
    ['com espaços e símbolos', 'oi <script>alert(1)</script>'],
    ['longo demais', 'a'.repeat(65)],
    ['com aspas', '"quebra"'],
    ['vazio', ''],
  ])('troca o id %s por um gerado', async (_nome, bad) => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', bad);
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8}$/);
    expect(res.headers['x-request-id']).not.toBe(bad);
  });
});

describe('cabeçalhos e CORS', () => {
  const app = buildTestApp().app;

  it('cabeçalhos de segurança presentes e sem x-powered-by', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('origem permitida recebe CORS com credenciais; outra origem não recebe nada', async () => {
    const ok = await request(app).get('/api/v1/health').set('Origin', WEB);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const evil = await request(app).get('/api/v1/health').set('Origin', 'https://evil.com');
    // Sem `Access-Control-Allow-Origin` o navegador descarta a resposta, qualquer que seja o resto.
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight de origem estranha não libera nada', async () => {
    const res = await request(app)
      .options('/api/v1/auth/logout')
      .set('Origin', 'https://evil.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('o CSRF vale mesmo com CORS: POST de outro site é barrado', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, USER);
    const res = await agent.post('/api/v1/auth/logout').set('Origin', 'https://evil.com');
    expect(res.status).toBe(403);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200); // a sessão continua
  });
});

describe('limite de requisições atrás do proxy (TRUST_PROXY)', () => {
  const hammer = async (app: ReturnType<typeof buildTestApp>['app'], ip: string, times: number) => {
    let last = 0;
    for (let i = 0; i < times; i++) {
      last = (await request(app).get('/api/v1/auth/discord').set('X-Forwarded-For', ip)).status;
    }
    return last;
  };

  it('com TRUST_PROXY=1 cada cliente tem o seu limite (o IP real vem do proxy)', async () => {
    const { app } = buildTestApp({ TRUST_PROXY: '1' });
    expect(await hammer(app, '203.0.113.1', 21)).toBe(429);
    expect(await hammer(app, '203.0.113.2', 1)).toBe(302); // outro cliente não é afetado
  });

  it('sem TRUST_PROXY o X-Forwarded-For é ignorado (não dá para fugir do limite trocando o cabeçalho)', async () => {
    const { app } = buildTestApp({ TRUST_PROXY: '0' });
    await hammer(app, '203.0.113.1', 20);
    expect(await hammer(app, '203.0.113.99', 1)).toBe(429);
  });
});

describe('entradas maliciosas', () => {
  it('operadores do MongoDB em corpos e queries não passam', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    const patch = (body: unknown) =>
      agent
        .patch('/api/v1/settings')
        .set('Origin', ctx.origin)
        .send(body as object);

    for (const body of [
      { adminRoleIds: [{ $ne: null }] },
      { liveCategoryId: { $gt: '' } },
      { maxParticipantsLive: { $gt: 0 } },
      { 'adminRoleIds.0': '1' },
    ]) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(ctx.settings.settings.adminRoleIds).toEqual([ADMIN_ROLE]);

    const list = await agent.get('/api/v1/rooms').query('status[$ne]=OPEN&type[$regex]=.*');
    expect(list.status).toBeLessThan(500);
    const audit = await agent.get('/api/v1/audit').query('actorId[$ne]=1');
    expect(audit.status).toBeLessThan(500);
  });

  it('__proto__ e campos que não existem são recusados (sem poluir nada)', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    const evil =
      '{"title":"Reunião mensal","__proto__":{"isAdmin":true},"constructor":{"prototype":{"x":1}}}';

    const res = await agent
      .post('/api/v1/meetings')
      .set('Origin', ctx.origin)
      .set('Content-Type', 'application/json')
      .send(evil);
    expect(res.status).toBe(400);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('atribuição em massa: não dá para escolher estado, dono ou id ao criar', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    for (const extra of [
      { status: 'ENDED' },
      { createdBy: '1' },
      { id: 'x'.repeat(22) },
      { guildId: 'outra' },
    ]) {
      const res = await post(agent, ctx, '/meetings', { title: 'Reunião mensal', ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect(ctx.rooms.rooms.size).toBe(0);
  });

  it('IDs de sala com caracteres de caminho ou injeção dão 404 (nunca chegam ao banco)', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, USER);
    for (const id of [
      '../../etc/passwd',
      '%2e%2e%2f',
      "' OR 1=1 --",
      '{"$ne":1}',
      'a'.repeat(300),
    ]) {
      const res = await agent.get(`/api/v1/rooms/${encodeURIComponent(id)}`);
      expect(res.status, id).toBe(404);
    }
  });

  it('JSON malformado e payload gigante não derrubam', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, ADMIN, [ADMIN_ROLE]);
    const bad = await agent
      .post('/api/v1/meetings')
      .set('Origin', ctx.origin)
      .set('Content-Type', 'application/json')
      .send('{');
    expect(bad.status).toBe(400);
    const huge = await agent
      .post('/api/v1/meetings')
      .set('Origin', ctx.origin)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ title: 'x'.repeat(200_000) }));
    expect(huge.status).toBe(413);
  });
});

describe('autenticação', () => {
  it('o token de sessão não é aceito fora do cookie (cabeçalho, query ou corpo)', async () => {
    const ctx = buildRoomsApp();
    const { cookie } = await loginAs(ctx, USER);
    const sid = cookie.split('=')[1]!;
    const bare = request(ctx.app);
    expect((await bare.get('/api/v1/auth/me').set('Authorization', `Bearer ${sid}`)).status).toBe(
      401,
    );
    expect((await bare.get('/api/v1/auth/me').query({ screem_sid: sid })).status).toBe(401);
    expect((await bare.get('/api/v1/auth/me').set('X-Session', sid)).status).toBe(401);
  });

  it('/auth/me não devolve tokens nem dados internos', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, USER);
    const body = JSON.stringify((await agent.get('/api/v1/auth/me')).body);
    for (const forbidden of [
      'token',
      'secret',
      'refresh',
      'access_token',
      'blocked',
      'lastLoginAt',
    ]) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('erros internos não vazam detalhes', async () => {
    const ctx = buildRoomsApp();
    const { agent } = await loginAs(ctx, USER);
    ctx.rooms.findById = async () => {
      throw new Error('connection string mongodb://usuario:SENHA@host/db');
    };
    const res = await agent.get('/api/v1/rooms/kF3x9QzP2mT7vB1nLw0aYc');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SENHA');
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('a documentação pública não expõe segredos', async () => {
    const res = await request(buildTestApp().app).get('/api/v1/openapi.json');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/client_secret|BOT_TOKEN|apiSecret/i);
  });
});

describe('Socket.IO', () => {
  const open: Socket[] = [];
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const s of open.splice(0)) s.close();
    for (const c of closers.splice(0)) await c();
  });

  const connected = (socket: Socket) =>
    new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (e) => reject(e));
    });

  async function start() {
    const ctx = buildRoomsApp();
    const server = await ctx.listen();
    closers.push(server.close);
    await ctx.live.handle({ userId: USER, oldChannelId: null, newChannelId: VOICE_1 });
    const room = [...ctx.rooms.rooms.values()][0]!;
    const { cookie } = await loginAs(ctx, USER);
    return { ctx, server, room, cookie };
  }

  const connect = (url: string, cookie: string, headers?: Record<string, string>) => {
    const s = connectSocket(url, cookie, headers);
    open.push(s);
    return s;
  };

  it('site de outra origem não consegue abrir o WebSocket (nem com o cookie da vítima)', async () => {
    const { server, cookie } = await start();
    await expect(
      connected(connect(server.url, cookie, { Origin: 'https://evil.com' })),
    ).rejects.toBeTruthy();
  });

  it('origem do próprio frontend conecta; cliente sem Origin (não é navegador) também', async () => {
    const { server, cookie } = await start();
    await expect(connected(connect(server.url, cookie, { Origin: WEB }))).resolves.toBeUndefined();
    await expect(connected(connect(server.url, cookie))).resolves.toBeUndefined();
  });

  it('origem estranha sem cookie também é barrada antes de qualquer coisa', async () => {
    const { server } = await start();
    await expect(
      connected(connect(server.url, '', { Origin: 'https://evil.com' })),
    ).rejects.toBeTruthy();
  });

  it('assinar salas em excesso é limitado (cada assinatura consulta o banco)', async () => {
    const { server, room, cookie } = await start();
    const socket = connect(server.url, cookie);
    await connected(socket);
    const subscribe = () =>
      new Promise<{ ok: boolean; error?: { code: string } }>((resolve) =>
        socket.emit('room:subscribe', { roomId: room.id }, resolve),
      );

    let last: { ok: boolean; error?: { code: string } } = { ok: true };
    for (let i = 0; i < 31; i++) last = await subscribe();
    expect(last).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('payload gigante derruba a conexão (limite de 16 KB)', async () => {
    const { server, cookie } = await start();
    const socket = connect(server.url, cookie);
    await connected(socket);
    const closed = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    socket.emit('room:subscribe', { roomId: 'x'.repeat(100_000) });
    await closed;
    expect(socket.connected).toBe(false);
  });
});

describe('Node2Shell (CVE-2026-111497): corpos comprimidos', () => {
  it('a API recusa corpo com Content-Encoding br ou gzip, sem tentar descomprimir', async () => {
    const ctx = buildTestApp();
    for (const enc of ['br', 'gzip', 'deflate']) {
      const res = await request(ctx.app)
        .post('/api/v1/auth/logout')
        .set('Origin', WEB)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', enc)
        .send(Buffer.from('{"a":1}'));
      expect(res.status, enc).toBeGreaterThanOrEqual(400);
      expect(res.status, enc).toBeLessThan(500);
    }
  });
});
