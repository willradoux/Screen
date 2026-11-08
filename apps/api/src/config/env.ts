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
  /** Quantos proxies confiáveis há na frente (Caddy = 1). Sem isto, o limite de requisições enxerga só o IP do proxy. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Porta interna das métricas Prometheus. 0 = desligado. Nunca publique esta porta. */
  METRICS_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/screem'),

  // Discord OAuth2
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: snowflake,
  DISCORD_REDIRECT_URI: z.string().url(),
  BOOTSTRAP_ADMIN_IDS: z.string().optional(),
  /** IDs de cargos (separados por vírgula) que sempre são ADMIN, além dos de /config cargo-admin. */
  ADMIN_ROLE_IDS: z.string().optional(),
  /** Sem o token o bot não inicia (a API sobe normalmente). Obrigatório em produção. */
  DISCORD_BOT_TOKEN: optional(z.string().min(1)),
  /** Cargo marcado nos avisos de reunião. Vazio = @everyone. */
  MEETING_MENTION_ROLE_ID: optional(snowflake),

  // Regras de negócio
  EMPTY_LIVE_END_SECONDS: z.coerce.number().int().min(5).default(60),
  /** Reunião aberta e vazia por tanto tempo é encerrada. */
  EMPTY_MEETING_END_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /** De quanto em quanto tempo o agendador de reuniões verifica. */
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(300).default(15),

  // LiveKit (servidor de mídia)
  /** URL interna, usada pela API para falar com o LiveKit. */
  LIVEKIT_URL: z.string().url(),
  /** URL pública (wss://) que o navegador usa para conectar. */
  LIVEKIT_PUBLIC_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  JOIN_TOKEN_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),

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
  adminRoleIds: string[];
};

/** Valores fixos e inofensivos aplicados somente quando NODE_ENV=test. */
const TEST_DEFAULTS: Record<string, string> = {
  DISCORD_CLIENT_ID: '111111111111111111',
  DISCORD_CLIENT_SECRET: 'test-client-secret',
  DISCORD_GUILD_ID: '222222222222222222',
  DISCORD_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/discord/callback',
  LIVEKIT_URL: 'http://localhost:7880',
  LIVEKIT_PUBLIC_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'devsecret-devsecret-devsecret-0123',
  COOKIE_SECRET: 'test-cookie-secret-test-cookie-secret',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

/**
 * Painéis como o Coolify podem entregar o valor com espaços nas pontas ou entre aspas
 * (`FOO=" "`, `FOO=\"123\"`). Tira isso antes de validar; senão um campo "vazio" falha como inválido.
 */
function clean(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, raw] of Object.entries(source)) {
    if (raw === undefined) continue;
    let value = raw.trim();
    // Aspas iguais nas duas pontas ("x" ou 'x').
    const q = value[0];
    if (value.length >= 2 && (q === '"' || q === "'") && value.endsWith(q)) {
      value = value.slice(1, -1).trim();
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(rawSource: NodeJS.ProcessEnv = process.env): Env {
  const source = clean(rawSource);
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

  const adminRoleIds = list(env.ADMIN_ROLE_IDS);
  const badRole = adminRoleIds.find((id) => !snowflake.safeParse(id).success);
  if (badRole) {
    throw new Error(`Variáveis de ambiente inválidas:
ADMIN_ROLE_IDS: ID inválido "${badRole}"`);
  }

  return {
    ...env,
    corsOrigins: list(env.CORS_ORIGINS ?? env.WEB_URL),
    encryptionKey,
    bootstrapAdminIds,
    adminRoleIds,
  };
}
