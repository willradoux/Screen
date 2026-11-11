import { Room as LiveKitRoom, RoomEvent, VideoPresets, type RoomOptions } from 'livekit-client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api as realApi, ApiError } from '../lib/api';
import { SOCKET_URL } from '../lib/config';
import { describeError } from '../lib/errors';
import type {
  Caption,
  EndReason,
  JoinResult,
  ModerationAction,
  RaisedHand,
  Room,
} from '../lib/types';
import {
  initialSessionState,
  pollIntervalMs,
  sessionReducer,
  type SessionState,
} from './sessionReducer';

/** Tudo que o hook usa de fora, para poder trocar por dublês nos testes. */
export interface SessionDeps {
  api: Pick<typeof realApi, 'rooms'>;
  createLiveKitRoom: () => LiveKitRoom;
  createSocket: () => Socket;
}

/** Qualidade recomendada em docs/backend/livekit-webrtc.md. */
export const LIVEKIT_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: { simulcast: true, videoCodec: 'vp8', red: true, dtx: true },
  videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
};

export const defaultSessionDeps: SessionDeps = {
  api: realApi,
  createLiveKitRoom: () => new LiveKitRoom(LIVEKIT_OPTIONS),
  createSocket: () =>
    io(SOCKET_URL, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
    }),
};

export interface RoomSession {
  state: SessionState;
  /** Dados públicos da sala (título, tipo, capacidade...). */
  room: Room | null;
  /** Sala do LiveKit, depois de conectada. */
  media: LiveKitRoom | null;
  permissions: JoinResult['permissions'] | null;
  /** Muda a cada evento que altera quem está na sala (para atualizar a lista). */
  participantsVersion: number;
  /** Fila de quem pediu a palavra (reuniões). */
  hands: RaisedHand[];
  /** A sala está sendo gravada? Todos precisam saber. */
  recording: boolean;
  /** Legendas recentes de quem está falando (somem sozinhas). */
  captions: Caption[];
  /** Manda o que a pessoa acabou de falar para a sala. */
  sendCaption: (text: string, final: boolean) => void;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  retry: () => void;
}

/**
 * Orquestra a entrada na sala: checa o acesso (e continua checando enquanto o
 * bloqueio pode passar), entra, conecta no LiveKit e no Socket.IO, e traduz os
 * eventos do servidor em mudanças de estado.
 * Fluxo: docs/frontend/README.md.
 */
export function useRoomSession(
  roomId: string,
  myId: string,
  deps: SessionDeps = defaultSessionDeps,
): RoomSession {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [room, setRoom] = useState<Room | null>(null);
  const [media, setMedia] = useState<LiveKitRoom | null>(null);
  const [permissions, setPermissions] = useState<JoinResult['permissions'] | null>(null);
  const [participantsVersion, setParticipantsVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [hands, setHands] = useState<RaisedHand[]>([]);
  const [recording, setRecording] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);

  const mediaRef = useRef<LiveKitRoom | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const bump = useCallback(() => setParticipantsVersion((v) => v + 1), []);

  const teardown = useCallback(() => {
    socketRef.current?.removeAllListeners();
    socketRef.current?.disconnect();
    socketRef.current = null;
    void mediaRef.current?.disconnect();
    mediaRef.current = null;
    setMedia(null);
  }, []);

  // ---- 1. Acesso: checa ao entrar na página e a cada nova tentativa ----
  const checkAccess = useCallback(async () => {
    try {
      const [roomData, access] = await Promise.all([
        depsRef.current.api.rooms.get(roomId),
        depsRef.current.api.rooms.access(roomId),
      ]);
      setRoom(roomData);
      dispatch({ type: 'ACCESS_RESULT', access, lectureMode: roomData.lectureMode });
    } catch (err) {
      dispatch({
        type: 'FAILED',
        code: err instanceof ApiError ? err.code : 'UNKNOWN_ERROR',
        message: describeError(err),
      });
    }
  }, [roomId]);

  useEffect(() => {
    if (state.phase.kind !== 'checking') return;
    void checkAccess();
  }, [state.phase.kind, checkAccess, attempt]);

  // ---- 2. Bloqueio que pode passar sozinho: pergunta de novo de tempos em tempos ----
  const blockedAccess = state.phase.kind === 'blocked' ? state.phase.access : null;
  useEffect(() => {
    if (!blockedAccess) return;
    const interval = pollIntervalMs(blockedAccess);
    if (interval === null) return;
    const id = setTimeout(() => void checkAccess(), interval);
    return () => clearTimeout(id);
  }, [blockedAccess, checkAccess]);

  // ---- 3. Eventos do servidor ----
  const wireSocket = useCallback(
    (socket: Socket) => {
      const subscribe = () => {
        socket.emit(
          'room:subscribe',
          { roomId },
          (res: { ok: boolean; error?: { code: string; message: string } }) => {
            if (!res?.ok) {
              dispatch({
                type: 'FAILED',
                code: res?.error?.code ?? 'UNKNOWN_ERROR',
                message: res?.error?.message ?? 'Não foi possível acompanhar a sala.',
              });
            } else {
              bump();
            }
          },
        );
      };
      // Também ao reconectar: a resposta traz o estado atual (docs/backend/eventos-socketio.md).
      socket.on('connect', subscribe);

      socket.on('room:ended', (p: { reason: EndReason }) => {
        dispatch({ type: 'ENDED', reason: p.reason });
        teardown();
      });
      socket.on('moderation:action', (p: ModerationAction) => {
        if (p.action === 'KICKED' || p.action === 'BANNED') {
          dispatch({
            type: 'REMOVED',
            action: p.action,
            reason: p.reason,
            expiresAt: p.expiresAt ?? null,
          });
          teardown();
        }
      });
      // A sessão de vídeo ficou em espera: derruba a conexão e mostra a tela de reativar.
      socket.on('session:idle', (p: { reason?: 'NOBODY_CONNECTED' | 'NOBODY_STREAMING' }) => {
        joinedRef.current = false;
        dispatch({ type: 'SESSION_IDLE', reason: p?.reason ?? null });
        teardown();
        setRoom((r) => (r ? { ...r, mediaState: 'IDLE' } : r));
      });
      socket.on('caption', (p: Omit<Caption, 'at'>) => {
        const at = Date.now();
        setCaptions((list) => [
          ...list.filter((c) => c.userId !== p.userId && at - c.at < 8000),
          { ...p, at },
        ]);
      });
      socket.on('recording:state', (p: { recording: boolean }) =>
        setRecording(Boolean(p.recording)),
      );
      socket.on('hand:updated', (p: { hands: RaisedHand[] }) => setHands(p.hands ?? []));
      socket.on('voice:warning', (p: { secondsLeft: number }) =>
        dispatch({ type: 'VOICE_WARNING', secondsLeft: p.secondsLeft, at: Date.now() }),
      );
      socket.on('voice:restored', () => dispatch({ type: 'VOICE_RESTORED' }));
      socket.on(
        'room:updated',
        (p: {
          changes?: {
            lectureMode?: boolean;
            screenLock?: boolean;
            spotlightId?: string | null;
            mediaState?: 'ACTIVE' | 'IDLE';
          };
        }) => {
          dispatch({
            type: 'ROOM_UPDATED',
            ...(p.changes?.lectureMode !== undefined ? { lectureMode: p.changes.lectureMode } : {}),
          });
          setRoom((r) =>
            r
              ? {
                  ...r,
                  ...(p.changes?.lectureMode !== undefined
                    ? { lectureMode: p.changes.lectureMode }
                    : {}),
                  ...(p.changes?.screenLock !== undefined
                    ? { screenLock: p.changes.screenLock }
                    : {}),
                  ...(p.changes?.spotlightId !== undefined
                    ? { spotlightId: p.changes.spotlightId }
                    : {}),
                  ...(p.changes?.mediaState !== undefined
                    ? { mediaState: p.changes.mediaState }
                    : {}),
                }
              : r,
          );
        },
      );
      socket.on(
        'participant:updated',
        (p: { userId: string; isSpeaker: boolean; mutedByModeration: boolean }) => {
          if (p.userId === myId) {
            dispatch({
              type: 'SELF_UPDATED',
              isSpeaker: p.isSpeaker,
              mutedByModeration: p.mutedByModeration,
            });
          }
          bump();
        },
      );
      socket.on('participant:joined', bump);
      socket.on('participant:left', bump);
      socket.on('session:revoked', () => {
        dispatch({
          type: 'FAILED',
          code: 'UNAUTHENTICATED',
          message: 'Sua sessão terminou. Entre de novo.',
        });
        teardown();
      });
      socket.on('connect_error', (e: Error) => {
        // Só é fatal antes de entrar; depois, o Socket.IO reconecta sozinho.
        if (e.message === 'UNAUTHENTICATED') {
          dispatch({
            type: 'FAILED',
            code: 'UNAUTHENTICATED',
            message: 'Faça login para continuar.',
          });
        }
      });

      if (socket.connected) subscribe();
    },
    [roomId, myId, bump, teardown],
  );

  // ---- 4. Entrar ----
  const join = useCallback(async () => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    teardown(); // reconexão: começa limpo
    dispatch({ type: 'JOIN_STARTED' });
    try {
      const result = await depsRef.current.api.rooms.join(roomId);
      setPermissions(result.permissions);

      const lk = depsRef.current.createLiveKitRoom();
      lk.on(RoomEvent.Disconnected, () => {
        joinedRef.current = false; // permite "Reconectar"
        dispatch({ type: 'DISCONNECTED' });
      });
      // Guarda já: se a conexão falhar no meio, o teardown ainda consegue derrubá-la.
      mediaRef.current = lk;
      await lk.connect(result.livekit.url, result.livekit.token);
      // Navegadores só tocam áudio depois de um gesto: o clique em "Entrar" conta.
      await lk.startAudio().catch(() => undefined);
      setMedia(lk);

      const socket = depsRef.current.createSocket();
      socketRef.current = socket;
      wireSocket(socket);

      dispatch({ type: 'CONNECTED', lectureMode: result.room.lectureMode });
      // Fila atual de quem pediu a palavra (só reuniões).
      void depsRef.current.api.rooms
        .hands?.(roomId)
        .then(setHands)
        .catch(() => undefined);
    } catch (err) {
      joinedRef.current = false;
      teardown();
      dispatch({
        type: 'FAILED',
        code: err instanceof ApiError ? err.code : 'CONNECTION_FAILED',
        message:
          err instanceof ApiError
            ? describeError(err)
            : 'Não foi possível conectar à sala de vídeo.',
      });
    }
  }, [roomId, wireSocket, teardown]);

  // ---- 5. Sair ----
  const leave = useCallback(async () => {
    teardown();
    joinedRef.current = false;
    try {
      await depsRef.current.api.rooms.leave(roomId);
    } catch {
      // Sair nunca deve travar: o servidor também percebe a desconexão.
    }
  }, [roomId, teardown]);

  const sendCaption = useCallback(
    (text: string, final: boolean) => {
      socketRef.current?.emit('caption:send', { roomId, text, final });
    },
    [roomId],
  );

  const retry = useCallback(() => {
    joinedRef.current = false;
    dispatch({ type: 'RETRY' });
    setAttempt((n) => n + 1);
  }, []);

  // Ao fechar a página ou trocar de sala, derruba as conexões.
  useEffect(
    () => () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      void mediaRef.current?.disconnect();
    },
    [],
  );

  return {
    state,
    room,
    media,
    permissions,
    participantsVersion,
    hands,
    recording,
    captions,
    sendCaption,
    join,
    leave,
    retry,
  };
}
