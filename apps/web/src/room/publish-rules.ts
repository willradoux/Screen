import type { Role } from '@screem/shared';
import { isAdmin, isStaff } from '../lib/moderation-rules';
import type { MediaSource } from '../lib/types';
import type { SessionState } from './sessionReducer';

export interface PublishState {
  /** Por que não dá para publicar agora (texto para a pessoa), ou `null` se dá. */
  blockedReason: string | null;
}

/**
 * Se a pessoa pode ligar câmera, microfone e tela agora. O LiveKit é quem impede de
 * verdade (as permissões do token e as mudanças da moderação); isto só evita botões
 * que não funcionariam e explica o motivo.
 */
export function publishRestriction(
  state: Pick<SessionState, 'lectureMode' | 'isSpeaker' | 'mutedByModeration'>,
  role: Role,
  allowedSources: MediaSource[] | undefined,
): string | null {
  // Palco ligado: ninguém transmite por padrão, nem a moderação, até um admin subir a pessoa.
  if (state.lectureMode && !state.isSpeaker) {
    return isAdmin(role)
      ? 'Palco ligado: suba você mesmo ao palco (em Pessoas) para transmitir.'
      : 'Palco ligado: só quem está no palco pode transmitir.';
  }
  if (isStaff(role)) return null; // moderação publica fora do palco
  if (state.mutedByModeration) return 'A moderação silenciou você.';
  if (allowedSources && allowedSources.length === 0)
    return 'Você não tem permissão para transmitir.';
  return null;
}

/** Cada botão depende de fontes diferentes. Tela precisa de `screen_share`. */
export function canUseSource(
  allowedSources: MediaSource[] | undefined,
  source: MediaSource,
): boolean {
  return !allowedSources || allowedSources.includes(source);
}
