import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { sanitizeRedirect } from '../../src/modules/auth/redirect.js';
import { resolveRole } from '../../src/modules/permissions/roles.js';
import { decrypt, encrypt, sha256, sign, unsign } from '../../src/shared/crypto.js';

describe('crypto', () => {
  const key = Buffer.alloc(32, 1);

  it('encrypt/decrypt fazem ida e volta, com IV diferente a cada vez', () => {
    const a = encrypt('segredo', key);
    const b = encrypt('segredo', key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe('segredo');
  });

  it('rejeita chave errada e payload adulterado', () => {
    const enc = encrypt('segredo', key);
    expect(() => decrypt(enc, Buffer.alloc(32, 2))).toThrow();
    const [iv, tag, data] = enc.split('.');
    expect(() => decrypt(`${iv}.${tag}.${data}A`, key)).toThrow();
    expect(() => decrypt('lixo', key)).toThrow();
  });

  it('sign/unsign validam a assinatura', () => {
    const s = sign('valor', 'segredo');
    expect(unsign(s, 'segredo')).toBe('valor');
    expect(unsign(s, 'outro')).toBeNull();
    expect(unsign(s + 'x', 'segredo')).toBeNull();
    expect(unsign('semponto', 'segredo')).toBeNull();
  });

  it('sha256 é determinístico', () => {
    expect(sha256('a')).toBe(sha256('a'));
    expect(sha256('a')).toHaveLength(64);
  });
});

describe('sanitizeRedirect', () => {
  it.each([
    ['/r/abc', '/r/abc'],
    ['/', '/'],
    ['/r/abc?x=1#y', '/r/abc?x=1#y'],
    [undefined, '/'],
    ['', '/'],
    ['//evil.com', '/'],
    ['///evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/ok\nSet-Cookie: x=1', '/'],
    ['/' + 'a'.repeat(600), '/'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeRedirect(input)).toBe(expected);
  });
});

describe('resolveRole', () => {
  const base = {
    userId: '1',
    config: { adminRoleIds: ['A'], modRoleIds: ['M'] },
    bootstrapAdminIds: [] as string[],
  };

  it('ADMIN > MOD > MEMBER', () => {
    expect(resolveRole({ ...base, memberRoleIds: ['A'] })).toBe('ADMIN');
    expect(resolveRole({ ...base, memberRoleIds: ['M'] })).toBe('MOD');
    expect(resolveRole({ ...base, memberRoleIds: ['M', 'A'] })).toBe('ADMIN');
    expect(resolveRole({ ...base, memberRoleIds: ['X'] })).toBe('MEMBER');
    expect(resolveRole({ ...base, memberRoleIds: [] })).toBe('MEMBER');
  });

  it('bootstrap e permissão do Discord viram ADMIN', () => {
    expect(resolveRole({ ...base, memberRoleIds: [], bootstrapAdminIds: ['1'] })).toBe('ADMIN');
    expect(resolveRole({ ...base, memberRoleIds: [], hasDiscordAdminPermission: true })).toBe(
      'ADMIN',
    );
  });

  it('sem configuração ninguém é mod/admin por engano', () => {
    const config = { adminRoleIds: [], modRoleIds: [] };
    expect(resolveRole({ ...base, config, memberRoleIds: ['A', 'M'] })).toBe('MEMBER');
  });
});

describe('loadEnv (auth)', () => {
  const valid = {
    DISCORD_CLIENT_ID: '111111111111111111',
    DISCORD_CLIENT_SECRET: 's',
    DISCORD_GUILD_ID: '222222222222222222',
    DISCORD_REDIRECT_URI: 'http://localhost:3000/cb',
    COOKIE_SECRET: 'x'.repeat(32),
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    DISCORD_BOT_TOKEN: 'token-do-bot',
    LIVEKIT_URL: 'http://livekit:7880',
    LIVEKIT_PUBLIC_URL: 'wss://live.exemplo.com',
    LIVEKIT_API_KEY: 'chave',
    LIVEKIT_API_SECRET: 'segredo',
  };

  it('fora de teste, exige as variáveis de login', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DISCORD_CLIENT_ID/);
  });

  it('aceita configuração completa', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      ...valid,
      BOOTSTRAP_ADMIN_IDS: '333333333333333333',
    });
    expect(env.encryptionKey).toHaveLength(32);
    expect(env.bootstrapAdminIds).toEqual(['333333333333333333']);
  });

  it('em produção o token do bot é obrigatório; fora dela, opcional (vazio vale ausente)', () => {
    const withoutToken: Record<string, string> = { ...valid };
    delete withoutToken.DISCORD_BOT_TOKEN;
    expect(() => loadEnv({ NODE_ENV: 'production', ...withoutToken })).toThrow(/DISCORD_BOT_TOKEN/);
    expect(() =>
      loadEnv({ NODE_ENV: 'production', ...withoutToken, DISCORD_BOT_TOKEN: '' }),
    ).toThrow(/DISCORD_BOT_TOKEN/);
    const dev = loadEnv({ NODE_ENV: 'development', ...withoutToken, DISCORD_BOT_TOKEN: '' });
    expect(dev.DISCORD_BOT_TOKEN).toBeUndefined();
  });

  it('MEETING_MENTION_ROLE_ID vazio vale ausente; inválido é recusado', () => {
    expect(
      loadEnv({ NODE_ENV: 'test', MEETING_MENTION_ROLE_ID: '' }).MEETING_MENTION_ROLE_ID,
    ).toBeUndefined();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // inválido não derruba a API: é ignorado (ninguém é marcado) e avisa nos logs
    expect(
      loadEnv({ NODE_ENV: 'test', MEETING_MENTION_ROLE_ID: 'abc' }).MEETING_MENTION_ROLE_ID,
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MEETING_MENTION_ROLE_ID ignorado'));
    warn.mockRestore();
  });

  it('LiveKit é obrigatório fora de teste e valida as URLs', () => {
    const noKey: Record<string, string> = { ...valid };
    delete noKey.LIVEKIT_API_KEY;
    expect(() => loadEnv({ NODE_ENV: 'production', ...noKey })).toThrow(/LIVEKIT_API_KEY/);
    expect(() =>
      loadEnv({ NODE_ENV: 'production', ...valid, LIVEKIT_PUBLIC_URL: 'nao-e-url' }),
    ).toThrow(/LIVEKIT_PUBLIC_URL/);
    const env = loadEnv({ NODE_ENV: 'production', ...valid });
    expect(env.JOIN_TOKEN_TTL_SECONDS).toBe(600);
    expect(
      loadEnv({ NODE_ENV: 'production', ...valid, JOIN_TOKEN_TTL_SECONDS: '120' })
        .JOIN_TOKEN_TTL_SECONDS,
    ).toBe(120);
    expect(() =>
      loadEnv({ NODE_ENV: 'production', ...valid, JOIN_TOKEN_TTL_SECONDS: '5' }),
    ).toThrow();
  });

  it('rejeita chave de criptografia com tamanho errado', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production', ...valid, TOKEN_ENCRYPTION_KEY: 'curta' }),
    ).toThrow(/32 bytes/);
  });

  it('rejeita COOKIE_SECRET curto e IDs de admin inválidos', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', ...valid, COOKIE_SECRET: 'curto' })).toThrow(
      /COOKIE_SECRET/,
    );
    expect(() => loadEnv({ NODE_ENV: 'test', BOOTSTRAP_ADMIN_IDS: 'abc' })).toThrow(
      /BOOTSTRAP_ADMIN_IDS/,
    );
    expect(() => loadEnv({ NODE_ENV: 'test', OWNER_IDS: '123' })).toThrow(/OWNER_IDS/);
  });

  it('admins gerais (OWNER_IDS) também são sempre admin', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      BOOTSTRAP_ADMIN_IDS: '333333333333333333',
      OWNER_IDS: '444444444444444444, 333333333333333333',
    });
    expect(env.ownerIds).toEqual(['444444444444444444', '333333333333333333']);
    expect(env.bootstrapAdminIds.sort()).toEqual(['333333333333333333', '444444444444444444']);
  });
});

describe('ADMIN_ROLE_IDS (cargos fixos de admin)', () => {
  const base = {
    userId: '9',
    memberRoleIds: ['r2'],
    config: { adminRoleIds: [] as string[], modRoleIds: [] as string[] },
    bootstrapAdminIds: [] as string[],
  };
  it('quem tem qualquer um dos cargos fixos é ADMIN', () => {
    expect(resolveRole({ ...base, fixedAdminRoleIds: ['r1', 'r2', 'r3'] })).toBe('ADMIN');
  });
  it('quem não tem nenhum continua MEMBER', () => {
    expect(resolveRole({ ...base, fixedAdminRoleIds: ['r1', 'r3'] })).toBe('MEMBER');
    expect(resolveRole(base)).toBe('MEMBER');
  });
  it('soma com os cargos configurados em /config', () => {
    const config = { adminRoleIds: ['r2'], modRoleIds: [] };
    expect(resolveRole({ ...base, config })).toBe('ADMIN');
  });
  it('a variável é lida e valida cada ID', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      ADMIN_ROLE_IDS: '111111111111111111, 222222222222222222',
    });
    expect(env.adminRoleIds).toEqual(['111111111111111111', '222222222222222222']);
    expect(() => loadEnv({ NODE_ENV: 'test', ADMIN_ROLE_IDS: 'abc' })).toThrow(/ADMIN_ROLE_IDS/);
    expect(loadEnv({ NODE_ENV: 'test' }).adminRoleIds).toEqual([]);
  });
});

describe('loadEnv tolera espaços e aspas vindos de painéis (Coolify)', () => {
  it('valor só com espaços ou aspas vazias vale como ausente', () => {
    for (const v of [' ', '  ', '""', "''", '" "']) {
      expect(
        loadEnv({ NODE_ENV: 'test', MEETING_MENTION_ROLE_ID: v }).MEETING_MENTION_ROLE_ID,
      ).toBeUndefined();
    }
  });
  it('ID entre aspas ou com espaços é aceito', () => {
    expect(
      loadEnv({ NODE_ENV: 'test', MEETING_MENTION_ROLE_ID: ' "123456789012345678" ' })
        .MEETING_MENTION_ROLE_ID,
    ).toBe('123456789012345678');
    expect(
      loadEnv({ NODE_ENV: 'test', ADMIN_ROLE_IDS: '"111111111111111111, 222222222222222222"' })
        .adminRoleIds,
    ).toHaveLength(2);
  });
  it('valor inválido é ignorado com aviso (não derruba a API), mas só nesta variável', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      loadEnv({ NODE_ENV: 'test', MEETING_MENTION_ROLE_ID: '@everyone' }).MEETING_MENTION_ROLE_ID,
    ).toBeUndefined();
    expect(warn.mock.calls[0]![0]).toContain('"@everyone"');
    warn.mockRestore();
    expect(() => loadEnv({ NODE_ENV: 'test', DISCORD_GUILD_ID: 'abc' })).toThrow(
      /DISCORD_GUILD_ID/,
    );
  });
});

describe('CORS_ORIGINS', () => {
  it('vazia (como o compose entrega) usa a WEB_URL; barra final é removida', () => {
    expect(
      loadEnv({ NODE_ENV: 'test', WEB_URL: 'https://app.exemplo.com/', CORS_ORIGINS: '' })
        .corsOrigins,
    ).toEqual(['https://app.exemplo.com']);
    expect(loadEnv({ NODE_ENV: 'test', WEB_URL: 'https://app.exemplo.com' }).corsOrigins).toEqual([
      'https://app.exemplo.com',
    ]);
  });
  it('lista explícita vale', () => {
    expect(
      loadEnv({
        NODE_ENV: 'test',
        WEB_URL: 'https://a.com',
        CORS_ORIGINS: 'https://b.com, https://c.com/',
      }).corsOrigins,
    ).toEqual(['https://b.com', 'https://c.com']);
  });
});
