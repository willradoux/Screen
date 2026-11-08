import { z } from 'zod';

/** ID do Discord (snowflake). Sempre string, nunca número. */
export const snowflake = z.string().regex(/^\d{17,20}$/);

export const roleSchema = z.enum(['MEMBER', 'MOD', 'ADMIN']);
export type Role = z.infer<typeof roleSchema>;

export const roomTypeSchema = z.enum(['LIVE', 'MEETING']);
export type RoomType = z.infer<typeof roomTypeSchema>;

export const roomStatusSchema = z.enum(['SCHEDULED', 'OPEN', 'ENDED', 'CANCELED']);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

/** Hierarquia: maior número = mais poder. Ver docs/backend/permissoes.md */
export const ROLE_RANK: Record<Role, number> = { MEMBER: 0, MOD: 1, ADMIN: 2 };

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}
