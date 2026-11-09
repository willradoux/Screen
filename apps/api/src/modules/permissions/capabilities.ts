import type { RequestHandler } from 'express';
import { ROLE_RANK, type Role } from '@screem/shared';
import { forbidden, unauthenticated } from '../../shared/errors.js';

/**
 * Capacidades e o papel mínimo de cada uma. É a matriz de
 * docs/backend/permissoes.md: mudou aqui, mude lá (e em `capabilities.test.ts`).
 */
export const CAPABILITY_MIN_ROLE = {
  /** Abrir o painel de administração (ver sessões, reuniões; ADMIN altera configurações). */
  'panel.access': 'MOD',
  'room.end': 'MOD',
  'room.lecture': 'MOD',
  'room.edit': 'ADMIN',
  'moderation.mute': 'MOD',
  'moderation.kick': 'MOD',
  'moderation.ban': 'MOD',
  'moderation.speaker': 'MOD',
  'meeting.manage': 'ADMIN',
  'settings.manage': 'ADMIN',
  /** Adicionar/remover pessoas com acesso ao painel e ver canais e cargos do servidor. */
  'panel.users': 'ADMIN',
  'audit.read': 'ADMIN',
} as const satisfies Record<string, Role>;

export type Capability = keyof typeof CAPABILITY_MIN_ROLE;

export const can = (role: Role, capability: Capability): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[CAPABILITY_MIN_ROLE[capability]];

/** Lança 403 se o papel não tiver a capacidade. */
export function assertCan(role: Role, capability: Capability): void {
  if (!can(role, capability)) throw forbidden();
}

/** Rota que exige uma capacidade. Precisa vir depois de `requireAuth`. */
export function requireCapability(capability: Capability): RequestHandler {
  return (req, _res, next) => {
    const identity = req.auth?.identity;
    if (!identity) throw unauthenticated();
    assertCan(identity.role, capability);
    next();
  };
}
