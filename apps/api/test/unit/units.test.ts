import { describe, expect, it } from 'vitest';
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
    expect(() => loadEnv({ NODE_ENV: 'test', MEETING_MENTION_ROLE_ID: 'abc' })).toThrow(
      /MEETING_MENTION_ROLE_ID/,
    );
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
  });
});
