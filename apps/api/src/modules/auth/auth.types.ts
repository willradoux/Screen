import type { Role } from '@screem/shared';

export interface UserRecord {
  id: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  blocked: boolean;
  lastLoginAt: Date;
}

export interface SessionRecord {
  /** SHA-256 do id que vai no cookie. O id em si nunca é guardado. */
  id: string;
  userId: string;
  /** Criptografados (AES-256-GCM). */
  discordAccessToken: string;
  discordRefreshToken: string;
  discordExpiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface UserRepo {
  upsertOnLogin(user: {
    id: string;
    username: string;
    globalName: string | null;
    avatarHash: string | null;
  }): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
}

export interface SessionRepo {
  create(session: SessionRecord): Promise<void>;
  findById(id: string): Promise<SessionRecord | null>;
  updateExpiry(id: string, expiresAt: Date): Promise<void>;
  updateTokens(
    id: string,
    tokens: { discordAccessToken: string; discordRefreshToken: string; discordExpiresAt: Date },
  ): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}

export interface RoleConfig {
  adminRoleIds: string[];
  modRoleIds: string[];
}

export interface SettingsRepo {
  getRoleConfig(guildId: string): Promise<RoleConfig>;
}

/** Quem é o usuário logado, já com papel calculado. */
export interface Identity {
  user: UserRecord;
  role: Role;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthContext {
  session: SessionRecord;
  identity?: Identity;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
