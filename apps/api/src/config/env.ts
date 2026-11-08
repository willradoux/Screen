import { z } from 'zod';
import { snowflake } from '@screem/shared';

/** Variáveis de ambiente. Ver docs/backend/variaveis-de-ambiente.md */
/** Variável vazia no .env (`FOO=`) vale como ausente. */
const optional = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), inner.optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TIMEZONE: z.string().default('America/Sao_Paulo'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/screem'),

  // Discord OAuth2
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: snowflake,
  DISCORD_REDIRECT_URI: z.string().url(),
  BOOTSTRAP_ADMIN_IDS: z.string().optional(),
  /** Sem o token o bot não inicia (a API sobe normalmente). Obrigatório em produção. */
  DISCORD_BOT_TOKEN: optional(z.string().min(1)),
  /** Cargo marcado nos avisos de reunião. Vazio = @everyone. */
  MEETING_MENTION_ROLE_ID: optional(snowflake),

  // Regras de negócio
  EMPTY_LIVE_END_SECONDS: z.coerce.number().int().min(5).default(60),

  // Sessão e criptografia
  COOKIE_SECRET: z.string().min(32, 'use 32 ou mais caracteres'),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
});

export type Env = z.infer<typeof schema> & {
  corsOrigins: string[];
  /** Chave AES-256 já decodificada (32 bytes). */
  encryptionKey: Buffer;
  bootstrapAdminIds: string[];
};

/** Valores fixos e inofensivos aplicados somente quando NODE_ENV=test. */
const TEST_DEFAULTS: Record<string, string> = {
  DISCORD_CLIENT_ID: '111111111111111111',
  DISCORD_CLIENT_SECRET: 'test-client-secret',
  DISCORD_GUILD_ID: '222222222222222222',
  DISCORD_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/discord/callback',
  COOKIE_SECRET: 'test-cookie-secret-test-cookie-secret',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const input = source.NODE_ENV === 'test' ? { ...TEST_DEFAULTS, ...source } : source;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${problems}`);
  }
  const env = parsed.data;

  const encryptionKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64');
  if (encryptionKey.length !== 32) {
    throw new Error(
      'Variáveis de ambiente inválidas:\nTOKEN_ENCRYPTION_KEY: deve ser 32 bytes em base64 (openssl rand -base64 32)',
    );
  }

  const list = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  if (env.NODE_ENV === 'production' && !env.DISCORD_BOT_TOKEN) {
    throw new Error('Variáveis de ambiente inválidas:\nDISCORD_BOT_TOKEN: obrigatório em produção');
  }

  const bootstrapAdminIds = list(env.BOOTSTRAP_ADMIN_IDS);
  const badId = bootstrapAdminIds.find((id) => !snowflake.safeParse(id).success);
  if (badId) {
    throw new Error(
      `Variáveis de ambiente inválidas:\nBOOTSTRAP_ADMIN_IDS: ID inválido "${badId}"`,
    );
  }

  return {
    ...env,
    corsOrigins: list(env.CORS_ORIGINS ?? env.WEB_URL),
    encryptionKey,
    bootstrapAdminIds,
  };
}
