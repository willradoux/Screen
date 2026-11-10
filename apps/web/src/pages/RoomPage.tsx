import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { ToastViewport, useToasts } from '../components/Toasts';
import { Alert, Badge, Button } from '../components/ui';
import { StatusBadge } from '../components/RoomCard';
import { publishRestriction } from '../room/publish-rules';
import { CaptionsOverlay, useSpeechCaptions } from '../room/captions';
import { Controls } from '../room/Controls';
import { useNow } from './MeetingsPage';
import { ParticipantsPanel } from '../room/ParticipantsPanel';
import {
  BlockedScreen,
  CheckingScreen,
  EndedScreen,
  ErrorScreen,
  IdleScreen,
  JoiningScreen,
  ReadyScreen,
  RemovedScreen,
} from '../room/Screens';
import { RemoteAudio, Stage } from '../room/Stage';
import { secondsLeft } from '../room/sessionReducer';
import { defaultSessionDeps, useRoomSession, type SessionDeps } from '../room/useRoomSession';
import { useAudienceSubscriptions } from '../room/useAudienceSubscriptions';
import { useParticipants } from '../room/useParticipants';
import { isBigRoom, profileFor, wantedVideo } from '../lib/bigRoom';

/** Avisa que a pessoa saiu da call e será removida da live em instantes. */
function VoiceWarning({ warning }: { warning: { secondsLeft: number; receivedAt: number } }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = secondsLeft(warning, now);
  return (
    <Alert tone="warning" title="Você saiu do canal de voz">
      Volte para a call em {left}s ou você será removido(a) da live.
    </Alert>
  );
}

/** Sala conectada: palco com os vídeos, controles e painel de pessoas. */
function ConnectedRoom({
  session,
  me,
  onLeave,
  toast,
}: {
  session: ReturnType<typeof useRoomSession>;
  me: { id: string; role: 'MEMBER' | 'MOD' | 'ADMIN' };
  onLeave: () => void;
  toast: ReturnType<typeof useToasts>;
}) {
  const { media, room, state, permissions, participantsVersion } = session;
  const { tiles, remote, local } = useParticipants(media);
  // Quem só assiste começa com a lista fechada: em salas grandes são centenas de recargas à toa.
  const [panelOpen, setPanelOpen] = useState(me.role !== 'MEMBER');
  const [handBusy, setHandBusy] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const now = useNow(1000);
  // Transcreve a própria fala só com legendas ligadas e microfone aberto.
  useSpeechCaptions(
    captionsOn && local?.isMicrophoneEnabled === true,
    session.sendCaption,
    toast.error,
  );
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // Sala grande e eu só assistindo: recebo um único vídeo (o fixado, a tela, ou quem falou por último).
  const lastSpeaker = useRef<string | null>(null);
  const speaking = tiles.find((t) => t.canPublish && t.isSpeaking && !t.isLocal);
  if (speaking) lastSpeaker.current = speaking.identity;
  const audienceOfBigRoom =
    Boolean(room && isBigRoom(room.maxParticipants)) && local?.permissions?.canPublish !== true;
  useAudienceSubscriptions(
    media,
    audienceOfBigRoom,
    audienceOfBigRoom ? wantedVideo(tiles, pinnedId, lastSpeaker.current) : null,
  );
  const raised = session.hands.some((h) => h.userId === me.id);

  async function toggleHand() {
    if (!room) return;
    setHandBusy(true);
    try {
      if (raised) await api.rooms.lowerHand(room.id);
      else await api.rooms.raiseHand(room.id);
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setHandBusy(false);
    }
  }

  async function stageSelf() {
    if (!room) return;
    try {
      await api.moderation.promote(room.id, me.id);
    } catch (err) {
      toast.error(describeError(err));
    }
  }

  if (!media || !local || !room) return <JoiningScreen />;

  const restriction = publishRestriction(state, me.role, permissions?.canPublishSources);

  return (
    <div className="space-y-4">
      {session.recording && (
        <Alert tone="error" title="Esta reunião está sendo gravada">
          Sua imagem e sua voz podem aparecer na gravação enquanto você estiver com câmera ou
          microfone ligados.
        </Alert>
      )}
      {state.voiceWarning && <VoiceWarning warning={state.voiceWarning} />}
      {state.phase.kind === 'disconnected' && (
        <Alert tone="warning" title="Conexão perdida">
          <div className="flex flex-wrap items-center gap-3">
            <span>Sua conexão de vídeo caiu.</span>
            <Button size="sm" variant="primary" onClick={() => void session.join()}>
              Reconectar
            </Button>
          </div>
        </Alert>
      )}

      <div className={`grid gap-4 ${panelOpen ? 'lg:grid-cols-[1fr_20rem]' : ''}`}>
        <div className="min-w-0 space-y-4">
          <Stage
            tiles={tiles}
            pinnedId={pinnedId}
            onPinnedChange={setPinnedId}
            lectureMode={state.lectureMode}
            {...(me.role === 'ADMIN' && room.type === 'MEETING'
              ? { onStageSelf: () => void stageSelf() }
              : {})}
          />
          {captionsOn && <CaptionsOverlay captions={session.captions} now={now} />}
          <Controls
            hand={
              room.type === 'MEETING'
                ? {
                    raised: session.hands.some((h) => h.userId === me.id),
                    busy: handBusy,
                    onToggle: () => void toggleHand(),
                  }
                : undefined
            }
            captions={{ on: captionsOn, onToggle: () => setCaptionsOn((v) => !v) }}
            local={local}
            profile={profileFor(room.maxParticipants)}
            allowedSources={permissions?.canPublishSources}
            restriction={restriction}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((v) => !v)}
            onLeave={onLeave}
            onError={toast.error}
          />
        </div>
        {panelOpen && (
          <ParticipantsPanel
            room={room}
            me={me}
            version={participantsVersion}
            lectureMode={state.lectureMode}
            hands={session.hands}
            recording={session.recording}
            onInfo={toast.info}
            onError={toast.error}
          />
        )}
      </div>
      <RemoteAudio participants={remote} />
    </div>
  );
}

/**
 * Tela de `/r/:roomId` (o link que o bot manda no Discord). O fluxo completo está em
 * docs/frontend/README.md: checa o acesso, mostra o motivo de qualquer bloqueio e só
 * então conecta.
 */
export function RoomPage({ deps = defaultSessionDeps }: { deps?: SessionDeps }) {
  const { roomId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToasts();

  if (!user) return null; // RequireAuth garante o login
  return (
    <RoomPageInner roomId={roomId} user={user} deps={deps} navigate={navigate} toast={toast} />
  );
}

function RoomPageInner({
  roomId,
  user,
  deps,
  navigate,
  toast,
}: {
  roomId: string;
  user: { id: string; role: 'MEMBER' | 'MOD' | 'ADMIN' };
  deps: SessionDeps;
  navigate: ReturnType<typeof useNavigate>;
  toast: ReturnType<typeof useToasts>;
}) {
  const session = useRoomSession(roomId, user.id, deps);
  const { state, room } = session;
  const phase = state.phase;

  async function leave() {
    await session.leave();
    navigate('/');
  }

  let body;
  switch (phase.kind) {
    case 'checking':
      body = <CheckingScreen />;
      break;
    case 'blocked':
      body = <BlockedScreen access={phase.access} room={room} />;
      break;
    case 'ready':
      body = room ? (
        <ReadyScreen room={room} onJoin={() => void session.join()} />
      ) : (
        <CheckingScreen />
      );
      break;
    case 'joining':
      body = <JoiningScreen activating={room?.type === 'LIVE' && room.mediaState === 'IDLE'} />;
      break;
    case 'idle':
      body = <IdleScreen reason={phase.reason} onActivate={() => void session.join()} />;
      break;
    case 'connected':
    case 'disconnected':
      body = (
        <ConnectedRoom session={session} me={user} onLeave={() => void leave()} toast={toast} />
      );
      break;
    case 'ended':
      body = <EndedScreen reason={phase.reason} />;
      break;
    case 'removed':
      body = (
        <RemovedScreen action={phase.action} reason={phase.reason} expiresAt={phase.expiresAt} />
      );
      break;
    case 'error':
      body = <ErrorScreen code={phase.code} message={phase.message} onRetry={session.retry} />;
      break;
  }

  const inRoom = phase.kind === 'connected' || phase.kind === 'disconnected';

  return (
    <>
      {room && inRoom && (
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-50">{room.title}</h1>
          <StatusBadge room={room} />
          {state.lectureMode && <Badge tone="warn">Palco ligado</Badge>}
        </header>
      )}
      {body}
      <ToastViewport toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
