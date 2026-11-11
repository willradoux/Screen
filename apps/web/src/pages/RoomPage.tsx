import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { ToastViewport, useToasts } from '../components/Toasts';
import { useImmersive } from '../components/immersive';
import { Alert, Avatar, Badge, Button } from '../components/ui';
import { ROLE_LABEL } from '../lib/moderation-rules';
import { liveSources, publishRestriction } from '../room/publish-rules';
import { Controls } from '../room/Controls';
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
import { RemoteAudio, STAGE_LAYOUTS, Stage, type StageLayout } from '../room/Stage';
import { useIdle } from '../room/useIdle';
import { useVoiceLevels } from '../room/useVoiceLevels';
import { withPinTransition } from '../room/pin';
import { PersonAudio } from '../room/PersonAudio';
import { ChatPanel } from '../room/ChatPanel';
import { useSheetDrag } from '../room/useSheetDrag';
import { useAudioPrefs } from '../lib/audioPrefs';
import { playSound } from '../lib/sounds';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/RoomCard';
import { secondsLeft } from '../room/sessionReducer';
import { defaultSessionDeps, useRoomSession, type SessionDeps } from '../room/useRoomSession';
import { useAudienceSubscriptions } from '../room/useAudienceSubscriptions';
import { useParticipants } from '../room/useParticipants';
import { countVideos, isBigRoom, profileFor, wantedVideo } from '../lib/bigRoom';

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

const LAYOUT_KEY = 'screem-stage-layout';

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
}

/**
 * Dentro da chamada: a moldura preta, a tela transparente com desfoque (palco, avisos e
 * pessoas) e a barra preta embaixo com você e os controles.
 */
function ConnectedRoom({
  session,
  me,
  onLeave,
  toast,
}: {
  session: ReturnType<typeof useRoomSession>;
  me: {
    id: string;
    role: 'MEMBER' | 'MOD' | 'ADMIN';
    displayName: string;
    avatarUrl: string | null;
  };
  onLeave: () => void;
  toast: ReturnType<typeof useToasts>;
}) {
  const { media, room, state, permissions, participantsVersion } = session;
  const { tiles, remote, local } = useParticipants(media);
  // Sons: você entrou; alguém entrou ou saiu (um som só para várias pessoas juntas).
  const remoteCount = remote.length;
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (!media) return;
    const before = lastCount.current;
    if (before === null) playSound('join');
    else if (remoteCount > before) playSound('join');
    else if (remoteCount < before) playSound('leave');
    lastCount.current = remoteCount;
  }, [remoteCount, media]);
  // Painel de pessoas: fechado por padrão, para o palco ficar limpo.
  const [side, setSide] = useState<'people' | 'chat' | null>(null);
  // Sempre começa minimizada (só o essencial, flutuando).
  const [expanded, setExpanded] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1100px)').matches === true,
  );
  const [layout, setLayout] = useState<StageLayout>(() => {
    const saved = readPref(LAYOUT_KEY);
    return STAGE_LAYOUTS.some((l) => l.value === saved) ? (saved as StageLayout) : 'auto';
  });
  const [handBusy, setHandBusy] = useState(false);
  // Controles minimizados (padrão): flutuam sobre a tela e somem com o mouse parado por 30 s.
  // "Mais opções" abre a barra preta completa embaixo, que fica até a pessoa minimizar.
  // Com o ponteiro ou o foco nos controles (ou um painel aberto), eles não somem.
  const [holdBar, setHoldBar] = useState(false);
  const idle = useIdle(IDLE_MS, { hold: holdBar || side !== null });
  const hideFloating = idle;
  // A barra da direita aberta (expandida) não some sozinha: só a recolhida some com o mouse parado.
  const hideRail = idle && !expanded;
  // Mensagens novas desde que o chat foi fechado (a bolinha no botão).
  const seenChat = useRef(session.chat.messages.length);
  if (side === 'chat') seenChat.current = session.chat.messages.length;
  const unread = Math.max(0, session.chat.messages.length - seenChat.current);
  // Painel (chat/pessoas): no celular vira gaveta que se arrasta. Ao abrir, o foco vai para ele;
  // ao fechar (botão, Esc ou arrastando), volta para quem abriu.
  const panelRef = useRef<HTMLElement>(null);
  // Abre/fecha o painel; no celular, fecha a gaveta de opções para a do painel subir sozinha.
  const toggleSide = (next: 'people' | 'chat') => {
    setSide((v) => (v === next ? null : next));
    if (window.matchMedia?.('(max-width: 640px)').matches) setExpanded(false);
  };
  const sheet = useSheetDrag({ onClose: () => setSide(null) });
  const openedFrom = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!side) return;
    openedFrom.current ??= document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSide(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [side]);
  useEffect(() => {
    if (side) return;
    sheet.reset();
    // Volta o foco para quem abriu; se ele sumiu (estava na gaveta de opções do celular), vai
    // para o botão de opções.
    const from = openedFrom.current;
    if (from && from.isConnected && from.offsetParent !== null) from.focus();
    else document.querySelector<HTMLElement>('.rail-toggle')?.focus();
    openedFrom.current = null;
  }, [side]);
  // Volume de quem (na lista da barra), como no Discord.
  const [audioOf, setAudioOf] = useState<string | null>(null);
  const audio = useAudioPrefs();
  // Quem fala acende na hora: volume medido no navegador (o aviso do servidor chega atrasado).
  useVoiceLevels(tiles);
  const holdHandlers = {
    onPointerEnter: () => setHoldBar(true),
    onPointerLeave: () => setHoldBar(false),
    onFocus: () => setHoldBar(true),
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoldBar(false);
    },
  };
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // Quem a administração destacou vale para todos; fixar outra pessoa por conta própria vale só aqui.
  const effectivePin = pinnedId ?? room?.spotlightId ?? null;
  // Fixar pela lista de pessoas: clicar no que já está fixado solta.
  const togglePin = (value: string) =>
    withPinTransition(() => setPinnedId((v) => (v === value ? null : value)));
  const sharingIds = new Set(tiles.filter((t) => t.screenPublished).map((t) => t.identity));
  // Sala grande e eu só assistindo: recebo um único vídeo (o fixado, a tela, ou quem falou por último).
  const lastSpeaker = useRef<string | null>(null);
  const speaking = tiles.find((t) => t.canPublish && t.isSpeaking && !t.isLocal);
  if (speaking) lastSpeaker.current = speaking.identity;
  const audienceOfBigRoom =
    Boolean(room && isBigRoom(room.maxParticipants)) && local?.permissions?.canPublish !== true;
  useAudienceSubscriptions(
    media,
    audienceOfBigRoom,
    audienceOfBigRoom ? wantedVideo(tiles, effectivePin, lastSpeaker.current) : null,
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

  // As permissões podem mudar no meio da reunião (tela travada, subir ao palco): vale a mais nova.
  const allowedSources = liveSources(local.permissions, permissions?.canPublishSources);
  const restriction = publishRestriction(state, me.role, allowedSources);

  const controlsFor = (variant: 'media' | 'rail') => (
    <Controls
      variant={variant}
      room={media}
      hand={
        room.type === 'MEETING'
          ? { raised, busy: handBusy, onToggle: () => void toggleHand() }
          : undefined
      }
      local={local}
      profile={profileFor({ people: tiles.length, videos: countVideos(tiles) })}
      allowedSources={allowedSources}
      screenLocked={room.screenLock}
      restriction={restriction}
      panelOpen={side === 'people'}
      onTogglePanel={() => toggleSide('people')}
      chatOpen={side === 'chat'}
      chatUnread={unread}
      onToggleChat={() => toggleSide('chat')}
      layout={{
        value: layout,
        onChange: (next) => {
          writePref(LAYOUT_KEY, next);
          setLayout(next);
        },
      }}
      onLeave={() => {
        playSound('leave');
        onLeave();
      }}
      onError={toast.error}
    />
  );

  return (
    <div
      className="call-frame"
      data-rail={expanded ? 'open' : undefined}
      data-idle={hideFloating || undefined}
      data-panel={side ? 'open' : undefined}
    >
      {/*
       * Barra de opções na borda direita: sempre à mão (recolhida, só os ícones; expandida,
       * com os nomes, a sala e quem está na chamada). Some com o mouse parado e volta ao mexer.
       */}
      <div
        className="call-rail"
        data-open={expanded || undefined}
        data-idle={hideRail || undefined}
      >
        <div className="call-rail-inner" {...holdHandlers}>
          <button
            type="button"
            onClick={() => {
              setHoldBar(false);
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            aria-label={expanded ? 'Fechar opções' : 'Mais opções'}
            title={expanded ? 'Recolher' : 'Expandir'}
            className="rail-toggle"
          >
            <Icon name={expanded ? 'right_panel_close' : 'right_panel_open'} size="1.25rem" />
          </button>
          {/* A sala: nome, estado e quantas pessoas. */}
          <div className="rail-room">
            <p className="rail-room-title">{room.title}</p>
            <p className="rail-room-sub">
              <StatusBadge room={room} />
              <span>
                {tiles.length} {tiles.length === 1 ? 'pessoa' : 'pessoas'}
              </span>
            </p>
          </div>

          {controlsFor('rail')}

          {/* Quem está na chamada (como a lista de membros do Discord). */}
          <div className="rail-people">
            <p className="rail-heading">Na chamada · {tiles.length}</p>
            <ul aria-label="Na chamada">
              {tiles.slice(0, 40).map((t) => (
                <li
                  key={t.identity}
                  data-speaking={t.isSpeaking || undefined}
                  data-voice-id={t.identity}
                  data-open={audioOf === t.identity || undefined}
                >
                  <Avatar name={t.name} url={t.avatarUrl} size="sm" />
                  {t.isLocal ? (
                    <span className="min-w-0 flex-1 truncate">{t.name} (você)</span>
                  ) : (
                    // Como no Discord: clicar na pessoa abre o volume dela (só para você).
                    <button
                      type="button"
                      className="rail-person min-w-0 flex-1 truncate text-left"
                      aria-expanded={audioOf === t.identity}
                      onClick={() => setAudioOf((v) => (v === t.identity ? null : t.identity))}
                      title="Volume (só para você)"
                    >
                      {t.name}
                      {audio.muted[t.identity] && (
                        <span className="sr-only"> (mutada para você)</span>
                      )}
                    </button>
                  )}
                  <Icon
                    name={audio.muted[t.identity] ? 'volume_off' : t.micOn ? 'mic' : 'mic_off'}
                    size="0.95rem"
                    label={
                      audio.muted[t.identity]
                        ? 'mutada para você'
                        : t.micOn
                          ? 'microfone ligado'
                          : 'microfone desligado'
                    }
                  />
                  {audioOf === t.identity && (
                    <div className="rail-audio">
                      <PersonAudio id={t.identity} name={t.name} sharing={t.screenPublished} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {tiles.length > 40 && <p className="rail-more">e mais {tiles.length - 40} pessoas</p>}
          </div>

          <div className="rail-me" title={`${me.displayName} · ${ROLE_LABEL[me.role]}`}>
            <Avatar name={me.displayName} url={me.avatarUrl} size="sm" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold">{me.displayName}</span>
              <span className="block text-[11px] text-zinc-500">{ROLE_LABEL[me.role]}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="call-main" data-panel={side ? 'open' : undefined}>
        <section aria-label="Chamada" className="call-screen">
          <h1 className="sr-only">{room.title}</h1>
          {state.lectureMode && (
            <div className="mb-2 flex justify-end">
              <Badge tone="warn">Palco ligado</Badge>
            </div>
          )}

          <div className="space-y-2 empty:hidden">
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
          </div>

          <div className="min-w-0 space-y-3 pt-1">
            <Stage
              tiles={tiles}
              layout={layout}
              pinnedId={effectivePin}
              onPinnedChange={setPinnedId}
              lectureMode={state.lectureMode}
              {...(me.role === 'ADMIN' && room.type === 'MEETING'
                ? { onStageSelf: () => void stageSelf() }
                : {})}
            />
          </div>
        </section>

        {side && (
          <aside
            ref={panelRef}
            tabIndex={-1}
            aria-label={side === 'chat' ? 'Chat' : 'Pessoas'}
            className="call-panel"
            data-size={sheet.big ? 'big' : undefined}
            data-dragging={sheet.dragging || undefined}
            style={sheet.dy ? { transform: `translateY(${sheet.dy}px)` } : undefined}
          >
            {/* Celular: alça para arrastar (para baixo fecha, para cima aumenta). */}
            <div aria-hidden="true" className="sheet-handle" {...sheet.handlers}>
              <span />
            </div>
            <div className="call-panel-head">
              {side === 'chat' && <h2 className="call-panel-title">Chat</h2>}
              <button
                type="button"
                aria-label="Fechar painel"
                onClick={() => setSide(null)}
                className="icon-button h-8 w-8"
              >
                <Icon name="close" size="1.1rem" />
              </button>
            </div>
            {side === 'chat' ? (
              <ChatPanel
                chat={session.chat}
                me={me}
                pollsEnabled={state.lectureMode}
                onError={toast.error}
                onInfo={toast.info}
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ParticipantsPanel
                  room={room}
                  me={me}
                  version={participantsVersion}
                  lectureMode={state.lectureMode}
                  hands={session.hands}
                  recording={session.recording}
                  onInfo={toast.info}
                  onError={toast.error}
                  pinnedId={effectivePin}
                  onPin={togglePin}
                  sharingIds={sharingIds}
                />
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="call-float" data-idle={hideFloating || undefined} {...holdHandlers}>
        {controlsFor('media')}
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
/** Quanto tempo com o mouse parado até os controles sumirem. */
const IDLE_MS = 30_000;

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
  user: {
    id: string;
    role: 'MEMBER' | 'MOD' | 'ADMIN';
    displayName: string;
    avatarUrl: string | null;
  };
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

  // Na chamada, a tela é só a chamada: o topo do site some.
  useImmersive(phase.kind === 'connected' || phase.kind === 'disconnected');

  return (
    <>
      {body}
      <ToastViewport toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
