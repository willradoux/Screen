import type { AccessResult, EndReason } from '../lib/types';

/**
 * Em que ponto da entrada na sala a pessoa está. É uma máquina de estados pura
 * (sem rede, sem LiveKit) para ser fácil de testar: o hook `useRoomSession` só
 * traduz o que acontece de fora em ações daqui.
 *
 *   checking ─▶ ready ─▶ joining ─▶ connected ─▶ disconnected
 *       │                                │             │
 *       └─▶ blocked (volta a checking)   └─▶ ended / removed (terminais)
 */
export type Phase =
  | { kind: 'checking' }
  | { kind: 'blocked'; access: AccessResult }
  | { kind: 'ready' }
  | { kind: 'joining' }
  | { kind: 'connected' }
  /** Perdeu a conexão de mídia (o LiveKit já tentou reconectar sozinho). */
  | { kind: 'disconnected' }
  | { kind: 'ended'; reason: EndReason }
  | {
      kind: 'removed';
      action: 'KICKED' | 'BANNED';
      reason: string | null;
      expiresAt: string | null;
    }
  | { kind: 'error'; code: string; message: string };

export interface SessionState {
  phase: Phase;
  /** Saiu da call de voz: segundos que faltam para ser removido da live. */
  voiceWarning: { secondsLeft: number; receivedAt: number } | null;
  /** Modo palestra ligado: só palestrantes publicam. */
  lectureMode: boolean;
  /** A moderação me promoveu a palestrante. */
  isSpeaker: boolean;
  /** A moderação me silenciou. */
  mutedByModeration: boolean;
}

export const initialSessionState: SessionState = {
  phase: { kind: 'checking' },
  voiceWarning: null,
  lectureMode: false,
  isSpeaker: false,
  mutedByModeration: false,
};

export type SessionAction =
  | { type: 'ACCESS_RESULT'; access: AccessResult; lectureMode: boolean }
  | { type: 'JOIN_STARTED' }
  | { type: 'CONNECTED'; lectureMode: boolean }
  | { type: 'DISCONNECTED' }
  | { type: 'ENDED'; reason: EndReason }
  | {
      type: 'REMOVED';
      action: 'KICKED' | 'BANNED';
      reason: string | null;
      expiresAt?: string | null;
    }
  | { type: 'FAILED'; code: string; message: string }
  | { type: 'RETRY' }
  | { type: 'VOICE_WARNING'; secondsLeft: number; at: number }
  | { type: 'VOICE_RESTORED' }
  | { type: 'ROOM_UPDATED'; lectureMode?: boolean }
  | { type: 'SELF_UPDATED'; isSpeaker: boolean; mutedByModeration: boolean };

const isTerminal = (p: Phase) => p.kind === 'ended' || p.kind === 'removed';
const isLive = (p: Phase) =>
  p.kind === 'joining' || p.kind === 'connected' || p.kind === 'disconnected';

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  const { phase } = state;

  switch (action.type) {
    case 'ACCESS_RESULT':
      // Só vale antes de entrar: uma checagem atrasada não pode derrubar quem já está dentro.
      if (phase.kind !== 'checking' && phase.kind !== 'blocked' && phase.kind !== 'ready')
        return state;
      return {
        ...state,
        lectureMode: action.lectureMode,
        phase: action.access.canJoin
          ? { kind: 'ready' }
          : { kind: 'blocked', access: action.access },
      };

    case 'JOIN_STARTED':
      if (
        phase.kind === 'ready' ||
        phase.kind === 'blocked' ||
        phase.kind === 'error' ||
        phase.kind === 'disconnected'
      ) {
        return { ...state, phase: { kind: 'joining' } };
      }
      return state;

    case 'CONNECTED':
      if (phase.kind !== 'joining') return state;
      return { ...state, lectureMode: action.lectureMode, phase: { kind: 'connected' } };

    case 'DISCONNECTED':
      return phase.kind === 'connected' ? { ...state, phase: { kind: 'disconnected' } } : state;

    case 'ENDED':
      // Quem foi removido continua vendo o motivo da remoção.
      if (phase.kind === 'removed') return state;
      return { ...state, voiceWarning: null, phase: { kind: 'ended', reason: action.reason } };

    case 'REMOVED':
      if (phase.kind === 'ended') return state;
      return {
        ...state,
        voiceWarning: null,
        phase: {
          kind: 'removed',
          action: action.action,
          reason: action.reason,
          expiresAt: action.expiresAt ?? null,
        },
      };

    case 'FAILED':
      if (isTerminal(phase)) return state;
      return {
        ...state,
        voiceWarning: null,
        phase: { kind: 'error', code: action.code, message: action.message },
      };

    case 'RETRY':
      return phase.kind === 'error' ? { ...state, phase: { kind: 'checking' } } : state;

    case 'VOICE_WARNING':
      if (!isLive(phase)) return state;
      return { ...state, voiceWarning: { secondsLeft: action.secondsLeft, receivedAt: action.at } };

    case 'VOICE_RESTORED':
      return state.voiceWarning ? { ...state, voiceWarning: null } : state;

    case 'ROOM_UPDATED':
      return action.lectureMode === undefined
        ? state
        : { ...state, lectureMode: action.lectureMode };

    case 'SELF_UPDATED':
      if (
        state.isSpeaker === action.isSpeaker &&
        state.mutedByModeration === action.mutedByModeration
      ) {
        return state;
      }
      return { ...state, isSpeaker: action.isSpeaker, mutedByModeration: action.mutedByModeration };
  }
}

/** Segundos que ainda faltam no aviso de "volte para a call". */
export function secondsLeft(warning: SessionState['voiceWarning'], now: number): number {
  if (!warning) return 0;
  return Math.max(0, warning.secondsLeft - Math.floor((now - warning.receivedAt) / 1000));
}

/** Motivos de bloqueio que mudam sozinhos: vale a pena continuar perguntando. */
export function pollIntervalMs(access: AccessResult): number | null {
  switch (access.reason) {
    case 'NOT_IN_VOICE':
      return 5_000;
    case 'ROOM_NOT_OPEN':
      // Sala encerrada ou cancelada não volta; agendada abre sozinha.
      return access.status === 'SCHEDULED' ? 10_000 : null;
    case 'ROOM_FULL':
      return 10_000;
    default:
      return null; // banido, sem cargo: não muda sem ação de alguém
  }
}
