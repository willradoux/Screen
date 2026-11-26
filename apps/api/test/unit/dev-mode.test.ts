import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { createDevDiscordApi, DevGateway } from '../../src/dev/dev-discord.js';
import { DEV_PERSONAS, DEV_VOICE_CHANNEL } from '../../src/dev/personas.js';
import { DiscordAuthError } from '../../src/modules/discord/discord-api.js';

const secrets = {
  COOKIE_SECRET: 'x'.repeat(32),
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  LIVEKIT_URL: 'http://localhost:7880',
  LIVEKIT_PUBLIC_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'secret',
};

describe('modo dev (Discord de mentira)', () => {
  it('liga só em desenvolvimento, e o .env pode deixar os dados do Discord vazios', () => {
    const env = loadEnv({
      ...secrets,
      NODE_ENV: 'development',
      DEV_FAKE_DISCORD: 'true',
      DISCORD_CLIENT_ID: '',
    });
    expect(env.devFakeDiscord).toBe(true);
    expect(env.DISCORD_GUILD_ID).toBe('900000000000000000');
    expect(() =>
      loadEnv({
        ...secrets,
        NODE_ENV: 'production',
        DEV_FAKE_DISCORD: 'true',
        DISCORD_BOT_TOKEN: 'x',
      }),
    ).toThrow(/DEV_FAKE_DISCORD/);
  });

  it('o login de mentira leva à página de escolha e devolve a pessoa escolhida', async () => {
    const api = createDevDiscordApi({ PUBLIC_API_URL: 'http://localhost:3000' });
    expect(api.buildAuthorizeUrl('abc')).toBe('http://localhost:3000/api/v1/dev/login?state=abc');
    const will = DEV_PERSONAS[0]!;
    const tokens = await api.exchangeCode(`dev:${will.id}`);
    const member = await api.fetchGuildMember(tokens.accessToken);
    expect(member?.user.username).toBe('will');
    expect(member?.roles).toEqual(will.roles);
    await expect(api.exchangeCode('dev:999')).rejects.toBeInstanceOf(DiscordAuthError);
  });

  it('o bot de mentira guarda as mensagens em vez de mandar para o Discord', async () => {
    const logs: unknown[] = [];
    const gateway = new DevGateway({ info: (o: unknown) => logs.push(o) } as never);
    const id = await gateway.sendMessage(DEV_VOICE_CHANNEL, {
      embeds: [{ title: 'oi' }],
      components: [],
    });
    expect(await gateway.editMessage(DEV_VOICE_CHANNEL, id, { embeds: [], components: [] })).toBe(
      'ok',
    );
    expect(gateway.messages[0]).toMatchObject({ channelId: DEV_VOICE_CHANNEL, edited: true });
    expect(logs).toHaveLength(1);
    expect((await gateway.getMemberPermissions(DEV_PERSONAS[0]!.id)).isOwner).toBe(true);
  });
});
