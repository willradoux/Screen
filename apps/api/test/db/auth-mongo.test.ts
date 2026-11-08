import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { GuildSettingsModel, SessionModel, UserModel } from '../../src/db/models.js';
import { createSessionRepo, createUserRepo } from '../../src/modules/auth/auth.repositories.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { createSettingsRepo } from '../../src/modules/settings/settings.repository.js';
import { sha256 } from '../../src/shared/crypto.js';
import { createLogger } from '../../src/shared/logger.js';
import { ADMIN_ROLE, FakeDiscord } from '../fixtures/fakes.js';
import { useTestDb } from './helpers.js';

useTestDb('auth-mongo', [UserModel, SessionModel, GuildSettingsModel]);

const USER = '333333333333333333';

/** Fluxo de login ponta a ponta com os repositórios REAIS (MongoDB) e Discord falso. */
describe('login com MongoDB real', () => {
  const env = loadEnv({ NODE_ENV: 'test' });
  const discord = new FakeDiscord();
  const settings = createSettingsRepo();
  const sessions = createSessionRepo();
  const auth = new AuthService({ env, discord, users: createUserRepo(), sessions, settings });
  const app = createApp(env, createLogger(env), { auth });

  it('login, /me com papel vindo da configuração no banco, logout', async () => {
    discord.addMember(USER, { roles: [ADMIN_ROLE], nick: 'Fulano' });
    await settings.modifyList(env.DISCORD_GUILD_ID, 'adminRoleIds', 'add', ADMIN_ROLE, 'setup');

    const agent = request.agent(app);
    const start = await agent.get('/api/v1/auth/discord').query({ redirect: '/r/abc' });
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const cb = await agent
      .get('/api/v1/auth/discord/callback')
      .query({ code: `code-${USER}`, state });
    expect(cb.headers.location).toBe('http://localhost:5173/r/abc');

    // Sessão e usuário gravados de verdade; só o hash do id e tokens criptografados.
    const rawId = /screem_sid=([^;]+)/.exec(
      (cb.headers['set-cookie'] as unknown as string[]).join(';'),
    )![1]!;
    const stored = await SessionModel.findById(sha256(rawId)).lean();
    expect(stored?.userId).toBe(USER);
    expect(stored?.discordAccessToken).not.toMatch(/^at-/);
    expect(await UserModel.findById(USER).lean()).toMatchObject({ username: expect.any(String) });

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data).toMatchObject({ id: USER, displayName: 'Fulano', role: 'ADMIN' });

    const out = await agent.post('/api/v1/auth/logout').set('Origin', 'http://localhost:5173');
    expect(out.status).toBe(204);
    expect(await SessionModel.countDocuments()).toBe(0);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});
