import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  metrics,
  refreshGauges,
  registry,
  routeLabel,
  startMetricsServer,
} from '../../src/observability/metrics.js';
import { createLogger } from '../../src/shared/logger.js';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import { buildRoomsApp, connectSocket, type RoomsCtx } from '../fixtures/rooms-fakes.js';

/** Valor atual de uma série (0 se ainda não existe). */
async function value(name: string, labels: Record<string, string> = {}): Promise<number> {
  const text = await registry.metrics();
  const wanted = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  for (const line of text.split(String.fromCharCode(10))) {
    if (!line.startsWith(`${name}{`) && !line.startsWith(`${name} `)) continue;
    if (wanted.every((w) => line.includes(w))) return Number(line.split(' ').at(-1));
  }
  return 0;
}

async function loginAs(ctx: RoomsCtx, userId: string, roles: string[] = []) {
  ctx.discord.addMember(userId, { roles });
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord');
  const state = new URL(start.headers.location as string).searchParams.get('state');
  await agent.get('/api/v1/auth/discord/callback').query({ code: `code-${userId}`, state });
  return agent;
}

const logger = createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'test' });
const servers: { close: () => void }[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

describe('métricas HTTP', () => {
  it('conta por método, rota (padrão, não o caminho real) e status', async () => {
    const ctx = buildRoomsApp();
    const before = await value('screem_http_requests_total', {
      route: '/api/v1/health',
      status: '200',
    });
    await request(ctx.app).get('/api/v1/health');
    await request(ctx.app).get('/api/v1/health');
    expect(
      await value('screem_http_requests_total', { route: '/api/v1/health', status: '200' }),
    ).toBe(before + 2);
  });

  it('rotas com parâmetro viram o padrão: nenhum id entra nos rótulos', async () => {
    const ctx = buildRoomsApp();
    const agent = await loginAs(ctx, '990000000000000001');
    await agent.get('/api/v1/rooms/AAAAAAAAAAAAAAAAAAAAAA');
    await agent.get('/api/v1/rooms/BBBBBBBBBBBBBBBBBBBBBB');
    const text = await registry.metrics();
    expect(text).toContain('route="/api/v1/rooms/:id"');
    expect(text).not.toContain('AAAAAAAAAAAAAAAAAAAAAA');
    expect(text).not.toContain('BBBBBBBBBBBBBBBBBBBBBB');
  });

  it('rota inexistente vira "unmatched" (um atacante não cria séries novas variando o caminho)', async () => {
    const ctx = buildRoomsApp();
    for (const p of ['/a', '/b', '/api/v1/x/y/z']) await request(ctx.app).get(p);
    const text = await registry.metrics();
    expect(text).toContain('route="unmatched"');
    expect(text).not.toContain('route="/api/v1/x/y/z"');
    expect(text).not.toContain('route="/a"');
  });

  it('registra a duração e os erros (4xx e 5xx)', async () => {
    const ctx = buildRoomsApp();
    const b401 = await value('screem_http_requests_total', {
      route: '/api/v1/auth/me',
      status: '401',
    });
    await request(ctx.app).get('/api/v1/auth/me');
    expect(
      await value('screem_http_requests_total', { route: '/api/v1/auth/me', status: '401' }),
    ).toBe(b401 + 1);
    expect(await registry.metrics()).toContain('screem_http_request_duration_seconds_bucket');
  });

  it('routeLabel', () => {
    expect(routeLabel({ baseUrl: '/api/v1', route: { path: '/rooms/:id' } })).toBe(
      '/api/v1/rooms/:id',
    );
    expect(routeLabel({ baseUrl: '/api/v1' })).toBe('unmatched');
    expect(routeLabel({ baseUrl: '/api/v1', route: { path: /regex/ } })).toBe('unmatched');
  });
});

describe('métricas de negócio', () => {
  it('logins: ok e o código de cada falha', async () => {
    const ctx = buildRoomsApp();
    const ok = await value('screem_logins_total', { result: 'ok' });
    const denied = await value('screem_logins_total', { result: 'NOT_IN_GUILD' });
    await loginAs(ctx, '990000000000000002');

    ctx.discord.members.set('990000000000000003', null);
    const agent = request.agent(ctx.app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    await agent
      .get('/api/v1/auth/discord/callback')
      .query({ code: 'code-990000000000000003', state });

    expect(await value('screem_logins_total', { result: 'ok' })).toBe(ok + 1);
    expect(await value('screem_logins_total', { result: 'NOT_IN_GUILD' })).toBe(denied + 1);
  });

  it('ações auditadas (moderação, reuniões, configurações) viram um contador por ação', async () => {
    const ctx = buildRoomsApp();
    await ctx.audit.record({ actorId: 'a', action: 'PARTICIPANT_KICKED' });
    const before = await value('screem_audit_actions_total', { action: 'PARTICIPANT_KICKED' });
    await ctx.audit.record({ actorId: 'a', action: 'PARTICIPANT_KICKED' });
    await ctx.audit.record({ actorId: 'a', action: 'SETTINGS_UPDATED' });
    expect(await value('screem_audit_actions_total', { action: 'PARTICIPANT_KICKED' })).toBe(
      before + 1,
    );
    expect(
      await value('screem_audit_actions_total', { action: 'SETTINGS_UPDATED' }),
    ).toBeGreaterThan(0);
  });

  it('eventos do LiveKit, por tipo (só os com assinatura válida)', async () => {
    const ctx = buildRoomsApp();
    const before = await value('screem_livekit_webhook_events_total', {
      event: 'participant_joined',
    });
    const good = ctx.sendWebhook({
      event: 'participant_joined',
      roomName: 'x'.repeat(22),
      participant: null,
    });
    await request(ctx.app)
      .post('/api/v1/livekit/webhook')
      .set('Authorization', good.auth)
      .send(good.body);
    const forged = ctx.sendWebhook(
      { event: 'participant_joined', roomName: 'x'.repeat(22), participant: null },
      false,
    );
    await request(ctx.app)
      .post('/api/v1/livekit/webhook')
      .set('Authorization', forged.auth)
      .send(forged.body);
    expect(
      await value('screem_livekit_webhook_events_total', { event: 'participant_joined' }),
    ).toBe(before + 1);
  });

  it('o agendador conta o que fez', async () => {
    const ctx = buildRoomsApp();
    ctx.configureLives();
    const actor = { id: '990000000000000009', via: 'api' as const, role: 'ADMIN' as const };
    const { room } = await ctx.meetings.create(actor, {
      title: 'Reunião mensal',
      description: null,
      startsAt: new Date(ctx.clock.now().getTime() + 10 * 60_000),
      announce: true,
    });
    const before = await value('screem_scheduler_actions_total', { kind: 'opened' });
    ctx.clock.advance(11 * 60_000);
    await ctx.meetingScheduler.tick();
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('OPEN');
    expect(await value('screem_scheduler_actions_total', { kind: 'opened' })).toBe(before + 1);
  });

  it('conexões de Socket.IO sobem e descem', async () => {
    const ctx = buildRoomsApp();
    const server = await ctx.listen();
    servers.push({ close: () => void server.close() });
    const userId = '990000000000000004';
    ctx.discord.addMember(userId);
    const agent = request.agent(ctx.app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const cb = await agent
      .get('/api/v1/auth/discord/callback')
      .query({ code: `code-${userId}`, state });
    const sid = /screem_sid=([^;]+)/.exec(
      (cb.headers['set-cookie'] as unknown as string[]).join(';'),
    )![1]!;

    const before = await value('screem_socket_connections');
    const socket = connectSocket(server.url, `screem_sid=${sid}`);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    expect(await value('screem_socket_connections')).toBe(before + 1);

    const closed = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    socket.close();
    await closed;
    await new Promise((r) => setTimeout(r, 50));
    expect(await value('screem_socket_connections')).toBe(before);
  });

  it('gauges do banco: salas abertas por tipo e pessoas conectadas', async () => {
    await refreshGauges({
      openLiveCount: async () => 3,
      openMeetingCount: async () => 1,
      connectedParticipants: async () => 17,
    });
    expect(await value('screem_rooms_open', { type: 'LIVE' })).toBe(3);
    expect(await value('screem_rooms_open', { type: 'MEETING' })).toBe(1);
    expect(await value('screem_participants_connected')).toBe(17);
  });

  it('bot conectado ou não', async () => {
    metrics.botReady.set(1);
    expect(await value('screem_bot_ready')).toBe(1);
    metrics.botReady.set(0);
    expect(await value('screem_bot_ready')).toBe(0);
  });

  it('inclui as métricas do processo (memória, CPU, event loop)', async () => {
    const text = await registry.metrics();
    expect(text).toContain('screem_process_cpu_user_seconds_total');
    expect(text).toContain('screem_nodejs_eventloop_lag_seconds');
    expect(text).toContain('screem_process_resident_memory_bytes');
  });
});

describe('servidor de métricas', () => {
  function start(refresh: () => Promise<void> = async () => undefined) {
    const server = startMetricsServer(0, refresh, logger);
    servers.push(server);
    return new Promise<string>((resolve) =>
      server.once('listening', () =>
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
      ),
    );
  }

  it('GET /metrics devolve o formato do Prometheus', async () => {
    const url = await start();
    const res = await fetch(`${url}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toContain('# HELP screem_http_requests_total');
  });

  it('atualiza os gauges do banco a cada leitura', async () => {
    let calls = 0;
    const url = await start(async () => {
      calls++;
      metrics.participants.set(calls * 10);
    });
    await fetch(`${url}/metrics`);
    const second = await (await fetch(`${url}/metrics`)).text();
    expect(calls).toBe(2);
    expect(second).toContain('screem_participants_connected 20');
  });

  it('se o banco falhar, ainda responde com o resto das métricas', async () => {
    const url = await start(async () => {
      throw new Error('banco indisponível');
    });
    const res = await fetch(`${url}/metrics`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('screem_process_cpu');
  });

  it('qualquer outro caminho ou método dá 404 (não expõe nada além do /metrics)', async () => {
    let calls = 0;
    const url = await start(async () => void calls++);
    for (const [method, path] of [
      ['GET', '/'],
      ['GET', '/metrics/extra'],
      ['GET', '/api/v1/auth/me'],
      ['POST', '/metrics'],
    ]) {
      const res = await fetch(`${url}${path}`, { method });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect(calls).toBe(0); // não consulta o banco por requisições inválidas
  });

  it('as métricas não aparecem na API pública', async () => {
    const ctx = buildRoomsApp();
    for (const p of ['/metrics', '/api/v1/metrics']) {
      expect((await request(ctx.app).get(p)).status).toBe(404);
    }
  });

  it('nenhuma métrica carrega dados pessoais (ids de usuário, e-mails, tokens)', async () => {
    const ctx = buildRoomsApp();
    const agent = await loginAs(ctx, '990000000000000077', [ADMIN_ROLE, MOD_ROLE]);
    await agent.get('/api/v1/auth/me');
    const text = await registry.metrics();
    expect(text).not.toContain('990000000000000077');
    expect(text).not.toMatch(/screem_sid|access_token|@/);
  });
});
