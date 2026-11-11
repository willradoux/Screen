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

/** Códigos do LiveKit (TrackSource) para os nomes que o resto do app usa. */
const SOURCE_BY_CODE: Record<number, MediaSource> = {
  1: 'camera',
  2: 'microphone',
  3: 'screen_share',
  4: 'screen_share_audio',
};

/**
 * Fontes que a pessoa pode ligar AGORA. O LiveKit avisa quando o servidor muda as permissões
 * no meio da reunião (tela travada, subir ao palco, silenciar), então os botões acompanham
 * sem precisar entrar de novo. Sem permissões ainda, vale o que veio do `join`.
 */
export function liveSources(
  live: { canPublish: boolean; canPublishSources: number[] } | undefined,
  fromJoin: MediaSource[] | undefined,
): MediaSource[] | undefined {
  if (!live) return fromJoin;
  if (!live.canPublish) return [];
  // Lista vazia no LiveKit significa "todas as fontes".
  if (live.canPublishSources.length === 0) return undefined;
  return live.canPublishSources.flatMap((code) => SOURCE_BY_CODE[code] ?? []);
}
