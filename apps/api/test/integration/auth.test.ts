import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { decrypt } from '../../src/shared/crypto.js';
import { ADMIN_ROLE, MOD_ROLE, ORIGIN, buildTestApp } from '../fixtures/fakes.js';

const USER = '333333333333333333';

/** Faz o fluxo completo de login e devolve um agente já autenticado. */
async function login(
  ctx: ReturnType<typeof buildTestApp>,
  userId = USER,
  redirect: string | undefined = '/r/abc',
) {
  const agent = request.agent(ctx.app);
  const start = await agent.get('/api/v1/auth/discord').query(redirect ? { redirect } : {});
  expect(start.status).toBe(302);
  const state = new URL(start.headers.location as string).searchParams.get('state');
  const cb = await agent
    .get('/api/v1/auth/discord/callback')
    .query({ code: `code-${userId}`, state });
  return { agent, start, cb, state };
}

describe('GET /auth/discord (início)', () => {
  it('redireciona ao Discord com state e grava cookie assinado', async () => {
    const ctx = buildTestApp();
    const res = await request(ctx.app).get('/api/v1/auth/discord');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/discord\.test\/authorize\?state=/);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toContain('screem_oauth=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('gera um state diferente a cada chamada', async () => {
    const ctx = buildTestApp();
    const a = await request(ctx.app).get('/api/v1/auth/discord');
    const b = await request(ctx.app).get('/api/v1/auth/discord');
    expect(a.headers.location).not.toBe(b.headers.location);
  });
});

describe('login completo', () => {
  it('cria sessão, grava cookie HttpOnly e volta ao redirect pedido', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER, { nick: 'Fulano' });
    const { cb } = await login(ctx);

    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe('http://localhost:5173/r/abc');
    const cookies = (cb.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toMatch(/screem_sid=[\w-]{40,}/);
    expect(cookies).toContain('HttpOnly');
    expect(ctx.sessions.sessions.size).toBe(1);
  });

  it('guarda só o hash do id e os tokens do Discord criptografados', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { cb } = await login(ctx);
    const rawId = /screem_sid=([^;]+)/.exec(
      (cb.headers['set-cookie'] as unknown as string[]).join(';'),
    )?.[1];
    const stored = [...ctx.sessions.sessions.values()][0]!;

    expect(stored.id).not.toBe(rawId);
    expect(stored.id).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.discordAccessToken).not.toContain('at-');
    expect(decrypt(stored.discordAccessToken, ctx.env.encryptionKey)).toMatch(/^at-/);
  });

  it('GET /auth/me devolve usuário e papel MEMBER', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER, { nick: 'Fulano' });
    const { agent } = await login(ctx);
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: USER, displayName: 'Fulano', role: 'MEMBER' });
  });

  it('descarta redirect externo (open redirect)', async () => {
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)']) {
      const ctx = buildTestApp();
      ctx.discord.addMember(USER);
      const { cb } = await login(ctx, USER, evil);
      expect(cb.headers.location, evil).toBe('http://localhost:5173/');
    }
  });

  it('cada login cria uma sessão nova (sem fixation)', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    await login(ctx);
    await login(ctx);
    expect(ctx.sessions.sessions.size).toBe(2);
  });
});

describe('falhas de login (redirecionam para /login?error=)', () => {
  const errorOf = (location: string) => new URL(location).searchParams.get('error');

  it('state diferente do cookie -> INVALID_STATE', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const agent = request.agent(ctx.app);
    await agent.get('/api/v1/auth/discord');
    const cb = await agent
      .get('/api/v1/auth/discord/callback')
      .query({ code: `code-${USER}`, state: 'forjado' });
    expect(cb.status).toBe(302);
    expect(errorOf(cb.headers.location as string)).toBe('INVALID_STATE');
    expect(ctx.sessions.sessions.size).toBe(0);
  });

  it('sem cookie de state -> INVALID_STATE', async () => {
    const ctx = buildTestApp();
    const cb = await request(ctx.app)
      .get('/api/v1/auth/discord/callback')
      .query({ code: `code-${USER}`, state: 'x' });
    expect(errorOf(cb.headers.location as string)).toBe('INVALID_STATE');
  });

  it('cookie de state adulterado -> INVALID_STATE', async () => {
    const ctx = buildTestApp();
    const cb = await request(ctx.app)
      .get('/api/v1/auth/discord/callback')
      .set('Cookie', 'screem_oauth=eyJzIjoieCIsInIiOiIvIn0.assinaturafalsa')
      .query({ code: `code-${USER}`, state: 'x' });
    expect(errorOf(cb.headers.location as string)).toBe('INVALID_STATE');
  });

  it('usuário fora da guilda -> NOT_IN_GUILD', async () => {
    const ctx = buildTestApp();
    ctx.discord.members.set(USER, null);
    const { cb } = await login(ctx);
    expect(errorOf(cb.headers.location as string)).toBe('NOT_IN_GUILD');
    expect(ctx.sessions.sessions.size).toBe(0);
  });

  it('conta bloqueada -> ACCOUNT_BLOCKED', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    await ctx.users.upsertOnLogin({ id: USER, username: 'x', globalName: null, avatarHash: null });
    ctx.users.users.get(USER)!.blocked = true;
    const { cb } = await login(ctx);
    expect(errorOf(cb.headers.location as string)).toBe('ACCOUNT_BLOCKED');
    expect(ctx.sessions.sessions.size).toBe(0);
  });

  it('code recusado pelo Discord -> DISCORD_OAUTH_FAILED', async () => {
    const ctx = buildTestApp();
    const agent = request.agent(ctx.app);
    const start = await agent.get('/api/v1/auth/discord');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const cb = await agent.get('/api/v1/auth/discord/callback').query({ code: 'lixo', state });
    expect(errorOf(cb.headers.location as string)).toBe('DISCORD_OAUTH_FAILED');
  });

  it('Discord fora do ar -> DISCORD_UNAVAILABLE', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    ctx.discord.unavailable = true;
    const { cb } = await login(ctx);
    expect(errorOf(cb.headers.location as string)).toBe('DISCORD_UNAVAILABLE');
  });

  it('usuário negou a autorização -> ACCESS_DENIED', async () => {
    const ctx = buildTestApp();
    const cb = await request(ctx.app)
      .get('/api/v1/auth/discord/callback')
      .query({ error: 'access_denied' });
    expect(errorOf(cb.headers.location as string)).toBe('ACCESS_DENIED');
  });

  it('o state só vale uma vez (cookie é apagado no callback)', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent, state } = await login(ctx);
    const again = await agent
      .get('/api/v1/auth/discord/callback')
      .query({ code: `code-${USER}`, state });
    expect(errorOf(again.headers.location as string)).toBe('INVALID_STATE');
  });
});

describe('papéis', () => {
  const roleFor = async (setup: (ctx: ReturnType<typeof buildTestApp>) => void) => {
    const ctx = buildTestApp({ BOOTSTRAP_ADMIN_IDS: '444444444444444444' });
    setup(ctx);
    const { agent } = await login(ctx);
    return (await agent.get('/api/v1/auth/me')).body.data.role;
  };

  it('cargo de admin -> ADMIN', async () => {
    expect(await roleFor((c) => c.discord.addMember(USER, { roles: [ADMIN_ROLE] }))).toBe('ADMIN');
  });
  it('cargo de mod -> MOD', async () => {
    expect(await roleFor((c) => c.discord.addMember(USER, { roles: [MOD_ROLE] }))).toBe('MOD');
  });
  it('admin e mod juntos -> ADMIN (o mais alto vence)', async () => {
    expect(await roleFor((c) => c.discord.addMember(USER, { roles: [MOD_ROLE, ADMIN_ROLE] }))).toBe(
      'ADMIN',
    );
  });
  it('sem cargos -> MEMBER', async () => {
    expect(await roleFor((c) => c.discord.addMember(USER, { roles: ['1'] }))).toBe('MEMBER');
  });
  it('BOOTSTRAP_ADMIN_IDS -> ADMIN mesmo sem cargo', async () => {
    const ctx = buildTestApp({ BOOTSTRAP_ADMIN_IDS: USER });
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe('ADMIN');
  });

  it('remover o cargo no Discord vale em até 60 s', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER, { roles: [ADMIN_ROLE] });
    const { agent } = await login(ctx);
    expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe('ADMIN');

    ctx.discord.addMember(USER, { roles: [] });
    // dentro do cache: ainda ADMIN
    ctx.clock.advance(30_000);
    expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe('ADMIN');
    // depois do cache: recalcula
    ctx.clock.advance(31_000);
    expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe('MEMBER');
  });
});

describe('papéis pelas permissões do Discord (bot)', () => {
  const roleWith = async (perms: { isOwner: boolean; isAdmin: boolean; isMod: boolean }) => {
    const ctx = buildTestApp({}, { guildPermissions: { getMemberPermissions: async () => perms } });
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    return (await agent.get('/api/v1/auth/me')).body.data.role;
  };

  it('dono do servidor e Administrator/ManageGuild -> ADMIN', async () => {
    expect(await roleWith({ isOwner: true, isAdmin: false, isMod: false })).toBe('ADMIN');
    expect(await roleWith({ isOwner: false, isAdmin: true, isMod: false })).toBe('ADMIN');
  });
  it('MuteMembers/ModerateMembers -> MOD', async () => {
    expect(await roleWith({ isOwner: false, isAdmin: false, isMod: true })).toBe('MOD');
  });
  it('sem permissões -> MEMBER', async () => {
    expect(await roleWith({ isOwner: false, isAdmin: false, isMod: false })).toBe('MEMBER');
  });
  it('falha ao consultar o bot não derruba nem eleva: cai para os cargos', async () => {
    const ctx = buildTestApp(
      {},
      {
        guildPermissions: {
          getMemberPermissions: async () => {
            throw new Error('Unknown Member');
          },
        },
      },
    );
    ctx.discord.addMember(USER, { roles: [MOD_ROLE] });
    const { agent } = await login(ctx);
    expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe('MOD');
  });
});

describe('sessão', () => {
  it('sem cookie -> 401 UNAUTHENTICATED', async () => {
    const ctx = buildTestApp();
    const res = await request(ctx.app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('cookie com id inexistente -> 401', async () => {
    const ctx = buildTestApp();
    const res = await request(ctx.app).get('/api/v1/auth/me').set('Cookie', 'screem_sid=naoexiste');
    expect(res.status).toBe(401);
  });

  it('sessão expirada -> 401 e removida', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    ctx.clock.advance(8 * 86_400_000);
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(ctx.sessions.sessions.size).toBe(0);
  });

  it('janela deslizante: uso estende a sessão, mas respeita o limite absoluto de 30 dias', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    const stored = [...ctx.sessions.sessions.values()][0]!;

    // usa a cada 5 dias: nunca expira pela janela de 7 dias
    for (let i = 0; i < 5; i++) {
      ctx.clock.advance(5 * 86_400_000);
      expect((await agent.get('/api/v1/auth/me')).status, `dia ${(i + 1) * 5}`).toBe(200);
    }
    expect(stored.expiresAt.getTime()).toBeGreaterThan(ctx.clock.now().getTime());

    // passou de 30 dias desde o login: acabou, mesmo usando sempre
    ctx.clock.advance(6 * 86_400_000);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('renova o access token com o refresh token quando expira', async () => {
    const ctx = buildTestApp();
    ctx.discord.tokenLifetimeSec = 3600;
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);

    ctx.clock.advance(2 * 3600_000); // token vencido e cache de membro vencido
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(ctx.discord.refreshCalls).toBe(1);
  });

  it('refresh recusado -> 401 e sessão encerrada', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    for (const rt of ['rt-1']) ctx.discord.revoked.add(rt);
    ctx.clock.advance(2 * 3600_000);
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(ctx.sessions.sessions.size).toBe(0);
  });

  it('quem saiu do servidor perde o acesso (403 NOT_IN_GUILD) e as sessões', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    ctx.discord.members.set(USER, null);
    ctx.clock.advance(61_000);
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_IN_GUILD');
    expect(ctx.sessions.sessions.size).toBe(0);
  });

  it('Discord indisponível ao validar o papel -> 502, sessão mantida', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    ctx.clock.advance(61_000);
    ctx.discord.unavailable = true;
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DISCORD_UNAVAILABLE');
    expect(ctx.sessions.sessions.size).toBe(1);
  });

  it('usuário bloqueado depois do login perde o acesso na hora', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    ctx.users.users.get(USER)!.blocked = true;
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
    expect(ctx.sessions.sessions.size).toBe(0);
  });
});

describe('logout e CSRF', () => {
  it('logout com Origin válida -> 204, apaga a sessão e o cookie', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    const out = await agent.post('/api/v1/auth/logout').set('Origin', ORIGIN);
    expect(out.status).toBe(204);
    expect(ctx.sessions.sessions.size).toBe(0);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('POST sem Origin -> 403 e a sessão continua', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    const out = await agent.post('/api/v1/auth/logout');
    expect(out.status).toBe(403);
    expect(ctx.sessions.sessions.size).toBe(1);
  });

  it('POST com Origin de outro site -> 403', async () => {
    const ctx = buildTestApp();
    ctx.discord.addMember(USER);
    const { agent } = await login(ctx);
    const out = await agent.post('/api/v1/auth/logout').set('Origin', 'https://evil.com');
    expect(out.status).toBe(403);
    expect(out.body.error.code).toBe('FORBIDDEN');
  });

  it('logout sem estar logado -> 401', async () => {
    const ctx = buildTestApp();
    const out = await request(ctx.app).post('/api/v1/auth/logout').set('Origin', ORIGIN);
    expect(out.status).toBe(401);
  });
});

describe('cookie em produção', () => {
  it('Secure e Domain são aplicados', async () => {
    const ctx = buildTestApp({ NODE_ENV: 'production', SESSION_COOKIE_DOMAIN: '.exemplo.com' });
    ctx.discord.addMember(USER);

    // Em produção os cookies são Secure; o agente do supertest (http) não os reenviaria,
    // então repassamos o cookie de state manualmente.
    const start = await request(ctx.app).get('/api/v1/auth/discord');
    const stateCookie = (start.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const cb = await request(ctx.app)
      .get('/api/v1/auth/discord/callback')
      .set('Cookie', stateCookie)
      .query({ code: `code-${USER}`, state });

    const cookie = (cb.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('screem_sid='),
    )!;
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Domain=.exemplo.com');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
});
