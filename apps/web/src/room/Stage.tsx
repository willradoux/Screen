import {
  Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type TrackPublication,
  type VideoQuality,
} from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/ui';
import { effectiveVolume, useAudioPrefs } from '../lib/audioPrefs';
import { cameraQualityFor, screenQualityFor } from '../lib/bigRoom';
import { POSITION_CLASS, aspectRatioNumber, useVideoPrefs } from '../lib/videoPrefs';
import { ROLE_LABEL } from '../lib/moderation-rules';
import { screenSharers, type Tile } from './useParticipants';
import { ZoomPan } from './ZoomPan';
import { cameraPin, parsePin, screenPin, transitionName, withPinTransition } from './pin';

function Video({
  pub,
  mirror = false,
  fit = 'cover',
  label,
  onNaturalAspect,
  quality,
}: {
  pub: TrackPublication;
  /** Salas grandes: pede uma camada de qualidade menor (menos banda no servidor). */
  quality?: VideoQuality | undefined;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  label: string;
  /** Formato real da transmissão (largura/altura); muda se a pessoa deitar o celular. */
  onNaturalAspect?: (ratio: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = pub.track;
  const prefs = useVideoPrefs();

  useEffect(() => {
    if (quality !== undefined && 'setVideoQuality' in pub) {
      (pub as RemoteTrackPublication).setVideoQuality(quality);
    }
  }, [pub, track, quality]);

  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    const report = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        onNaturalAspect?.(el.videoWidth / el.videoHeight);
      }
    };
    el.addEventListener('loadedmetadata', report);
    el.addEventListener('resize', report);
    report();
    return () => {
      el.removeEventListener('loadedmetadata', report);
      el.removeEventListener('resize', report);
      track.detach(el);
    };
  }, [track, onNaturalAspect]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted // o áudio é tocado à parte (RemoteAudio); aqui só a imagem
      aria-label={label}
      className={`h-full w-full ${fit === 'contain' ? 'object-contain' : `object-cover ${POSITION_CLASS[prefs.position]}`} ${mirror ? '-scale-x-100' : ''}`}
    />
  );
}

/** Variáveis do quadro: a proporção real (número) que o CSS usa para caber sem faixas. */
const fitStyle = (ratio: number) => ({ '--ar': ratio }) as React.CSSProperties;

/**
 * Botão de fixar no canto do vídeo: aparece ao passar o mouse ou com o foco do teclado; quando
 * fixado, fica sempre à vista.
 */
function PinButton({
  name,
  value,
  pinned,
  onPin,
}: {
  /** Como o leitor de tela chama o que é fixado ("Beto" ou "tela de Beto"). */
  name: string;
  /** O valor fixado (ver room/pin.ts). */
  value: string;
  pinned: boolean;
  onPin: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPin(value)}
      aria-pressed={pinned}
      aria-label={`${pinned ? 'Desafixar' : 'Fixar'} ${name}`}
      title={pinned ? 'Desafixar' : 'Fixar em destaque'}
      className="stage-pin"
      data-pinned={pinned || undefined}
    >
      <Icon name={pinned ? 'keep_off' : 'keep'} size="1rem" />
    </button>
  );
}

/**
 * No toque não existe "passar o mouse": tocar no vídeo mostra o botão de fixar por 3 s.
 * Devolve as props para o quadro (`data-reveal` e o toque).
 */
function useTouchReveal() {
  const [reveal, setReveal] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    'data-reveal': reveal || undefined,
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      setReveal(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setReveal(false), 3000);
    },
  };
}

interface TileExtras {
  pinned?: boolean;
  onPin?: (identity: string) => void;
  quality?: VideoQuality | undefined;
}

function PersonTile({
  tile,
  size = 'normal',
  pinned = false,
  onPin,
  quality,
}: { tile: Tile; size?: 'normal' | 'small' } & TileExtras) {
  const prefs = useVideoPrefs();
  const [natural, setNatural] = useState<number | null>(null);
  const ratio = aspectRatioNumber(prefs.shape, tile.cameraPub ? natural : null);
  const reveal = useTouchReveal();
  return (
    <figure
      {...(onPin ? reveal : {})}
      data-testid="tile"
      data-speaking={tile.isSpeaking || undefined}
      data-voice-id={tile.identity}
      data-size={size}
      style={fitStyle(ratio)}
      className={`stage-tile ${tile.cameraPub ? '' : 'stage-tile-empty'} ${
        tile.isSpeaking ? 'speaking-glow' : ''
      }`}
    >
      {tile.cameraPub ? (
        <Video
          pub={tile.cameraPub}
          mirror={tile.isLocal && prefs.selfie === 'mirror'}
          fit={prefs.fit}
          label={`Câmera de ${tile.name}`}
          onNaturalAspect={setNatural}
          quality={quality}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          {/* Anel verde que "respira" em volta do avatar enquanto a pessoa fala. */}
          <span className="speak-avatar">
            <span aria-hidden="true" className="speak-ring" />
            <span aria-hidden="true" className="speak-ring speak-ring-2" />
            <Avatar name={tile.name} url={tile.avatarUrl} size={size === 'small' ? 'md' : 'lg'} />
          </span>
        </div>
      )}
      {onPin && (
        <PinButton
          name={tile.name}
          value={cameraPin(tile.identity)}
          pinned={pinned}
          onPin={onPin}
        />
      )}
      <figcaption className="stage-caption">
        <span className="truncate font-medium text-white">
          {tile.name}
          {tile.isLocal && ' (você)'}
        </span>
        {tile.role !== 'MEMBER' && size !== 'small' && (
          <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-semibold text-white">
            {ROLE_LABEL[tile.role]}
          </span>
        )}
        <span
          className={`ml-auto ${tile.micOn ? 'text-emerald-300' : 'text-red-300'}`}
          title={tile.micOn ? 'Microfone ligado' : 'Microfone desligado'}
        >
          {/* Falando: o ícone vira três barrinhas que seguem o volume (o CSS troca na hora). */}
          <span aria-hidden="true" className="speak-mic">
            <Icon name={tile.micOn ? 'mic' : 'mic_off'} size="1.05rem" />
          </span>
          {tile.micOn && (
            <span aria-hidden="true" className="speak-bars">
              <span />
              <span />
              <span />
            </span>
          )}
          <span className="sr-only">
            {tile.micOn ? 'Microfone ligado' : 'Microfone desligado'}
            {tile.isSpeaking && ', falando'}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

function ScreenTile({ tile, pinned = false, onPin, quality }: { tile: Tile } & TileExtras) {
  const [natural, setNatural] = useState<number | null>(null);
  const reveal = useTouchReveal();
  if (!tile.screenPub) return null;
  return (
    <figure
      {...(onPin ? reveal : {})}
      data-testid="screen-tile"
      style={fitStyle(natural ?? 16 / 9)}
      className="stage-tile stage-tile-screen"
    >
      {tile.isLocal ? (
        <Video
          pub={tile.screenPub}
          fit="contain"
          label={`Tela de ${tile.name}`}
          onNaturalAspect={setNatural}
          quality={quality}
        />
      ) : (
        // Quem assiste pode dar zoom na tela dos outros (só na própria tela).
        <ZoomPan name={`tela de ${tile.name}`}>
          <Video
            pub={tile.screenPub}
            fit="contain"
            label={`Tela de ${tile.name}`}
            onNaturalAspect={setNatural}
            quality={quality}
          />
        </ZoomPan>
      )}
      {onPin && (
        <PinButton
          name={`tela de ${tile.name}`}
          value={screenPin(tile.identity)}
          pinned={pinned}
          onPin={onPin}
        />
      )}
      <figcaption className="absolute left-2.5 top-2.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">
        Tela de {tile.name}
        {tile.isLocal && ' (você)'}
      </figcaption>
    </figure>
  );
}

/**
 * Como organizar o palco:
 * - `auto`: um grande e o resto numa faixa. O grande é a tela compartilhada (prioridade) ou
 *   quem está falando (fica até outra pessoa falar).
 * - `mosaic`: tudo lado a lado, preenchendo a tela.
 *
 * Fixar (câmera ou tela de alguém) vence os dois: o fixado fica grande até soltar.
 * Em todos, cada vídeo tem o quadro no formato real da transmissão (largo, quadrado ou em pé)
 * e cresce até onde couber, sem faixas pretas.
 */
export type StageLayout = 'auto' | 'mosaic';

export const STAGE_LAYOUTS: { value: StageLayout; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'mosaic', label: 'Mosaico' },
];

/** Uma peça do palco: a tela de alguém ou a câmera de alguém. */
type Piece = { kind: 'screen' | 'person'; tile: Tile; key: string };

function pieces(tiles: Tile[]): Piece[] {
  const screens = screenSharers(tiles).map((t) => ({
    kind: 'screen' as const,
    tile: t,
    key: `s:${t.identity}`,
  }));
  const people = tiles.map((t) => ({ kind: 'person' as const, tile: t, key: `p:${t.identity}` }));
  return [...screens, ...people];
}

interface StageExtras {
  pinnedId: string | null;
  onPin: (value: string) => void;
  cameraQuality: VideoQuality | undefined;
  screenQuality: VideoQuality | undefined;
}

function PieceView({
  piece,
  small = false,
  extras,
}: {
  piece: Piece;
  small?: boolean;
  extras: StageExtras;
}) {
  const pin = parsePin(extras.pinnedId);
  const mine = pin?.identity === piece.tile.identity;
  // Fixado "da pessoa" (sem dizer qual) é a tela, se ela compartilha; senão a câmera.
  const pinned =
    mine &&
    (piece.kind === 'screen'
      ? !pin.camera
      : pin.camera || !(piece.tile.screenPub || piece.tile.screenPublished));
  return piece.kind === 'screen' ? (
    <ScreenTile
      tile={piece.tile}
      pinned={pinned}
      onPin={extras.onPin}
      quality={extras.screenQuality}
    />
  ) : (
    <PersonTile
      tile={piece.tile}
      size={small ? 'small' : 'normal'}
      pinned={pinned}
      onPin={extras.onPin}
      quality={extras.cameraQuality}
    />
  );
}

/** O automático: a tela compartilhada; senão quem falou por último; senão outra pessoa. */
function featuredPiece(all: Piece[], lastSpeaker: string | null): Piece | undefined {
  return (
    all.find((p) => p.kind === 'screen') ??
    all.find((p) => p.kind === 'person' && p.tile.isSpeaking && !p.tile.isLocal) ??
    all.find((p) => p.kind === 'person' && p.tile.identity === lastSpeaker) ??
    all.find((p) => p.kind === 'person' && !p.tile.isLocal) ??
    all[0]
  );
}

/** O fixado: a câmera (cam:) ou a tela da pessoa, se ela compartilha; senão a câmera. */
function pinnedPiece(all: Piece[], pinnedId: string | null): Piece | undefined {
  const pin = parsePin(pinnedId);
  if (!pin) return undefined;
  const theirs = all.filter((p) => p.tile.identity === pin.identity);
  return pin.camera
    ? theirs.find((p) => p.kind === 'person')
    : (theirs.find((p) => p.kind === 'screen') ?? theirs.find((p) => p.kind === 'person'));
}

/** Colunas do mosaico: o mais perto de um quadrado (1, 2, 2, 2, 3, 3, ...). */
const columnsFor = (count: number) => Math.max(1, Math.ceil(Math.sqrt(count)));

/** Acima disto, quem está só ouvindo (sem câmera, tela ou voz) deixa de ter um quadrado. */
const CROWD = 6;

const isActive = (t: Tile) =>
  t.isLocal || t.isSpeaking || t.micOn || Boolean(t.cameraPub) || Boolean(t.screenPub);

/**
 * O palco. Com o palco ligado (modo palestra) só aparece quem foi colocado nele e a plateia vira
 * um número; salas grandes mostram só quem está transmitindo ou falando. Qualquer pessoa pode
 * fixar uma câmera ou tela para vê-la grande.
 */
export function Stage({
  tiles,
  layout = 'auto',
  lectureMode = false,
  onStageSelf,
  pinnedId: controlledPin,
  onPinnedChange,
}: {
  tiles: Tile[];
  layout?: StageLayout;
  /** Fixado, quando quem usa o palco controla isso (a sala precisa saber para assinar o vídeo certo). */
  pinnedId?: string | null;
  onPinnedChange?: (identity: string | null) => void;
  lectureMode?: boolean;
  /** Admin: sobe a si mesmo ao palco (aparece no palco vazio). */
  onStageSelf?: () => void;
}) {
  const [innerPin, setInnerPin] = useState<string | null>(null);
  const pinnedId = onPinnedChange ? (controlledPin ?? null) : innerPin;
  const setPinned = onPinnedChange ?? setInnerPin;
  // Quem falou por último continua grande no automático até outra pessoa falar.
  const lastSpeaker = useRef<string | null>(null);
  const speakingNow = tiles.find((t) => t.isSpeaking && !t.isLocal);
  if (speakingNow) lastSpeaker.current = speakingNow.identity;
  const extras: StageExtras = {
    pinnedId,
    onPin: (value) => {
      // Clicar no que já está fixado solta (vale também para o formato do destaque do admin).
      const current = pinnedPiece(pieces(tiles), pinnedId);
      const target = pinnedPiece(pieces(tiles), value);
      withPinTransition(() =>
        setPinned(current && target && current.key === target.key ? null : value),
      );
    },
    cameraQuality: cameraQualityFor(tiles.length),
    screenQuality: screenQualityFor(tiles.length),
  };

  const visible = lectureMode
    ? tiles.filter((t) => t.canPublish)
    : tiles.length > CROWD
      ? tiles.filter(isActive)
      : tiles;
  const hidden = tiles.length - visible.length;

  const audience =
    hidden > 0 ? (
      <p className="stage-audience tabular" data-testid="audience-count">
        <Icon name="group" size="0.95rem" />
        {lectureMode ? 'Na plateia' : 'Só ouvindo'}: {hidden} {hidden === 1 ? 'pessoa' : 'pessoas'}
      </p>
    ) : null;

  if (lectureMode && visible.length === 0) {
    return (
      <div className="stage-empty" data-testid="empty-stage">
        <Icon name="stadium" size="2.5rem" />
        <p className="text-lg font-bold text-zinc-50">O palco está vazio.</p>
        <p className="max-w-md text-sm text-zinc-400">
          Ninguém transmite até um admin subir alguém ao palco, pela lista de pessoas.
        </p>
        {onStageSelf && (
          <button type="button" onClick={onStageSelf} className="btn btn-primary">
            <Icon name="person_add" size="1.1rem" />
            Subir ao palco
          </button>
        )}
        {audience}
      </div>
    );
  }

  const all = pieces(visible);
  const pinned = pinnedPiece(all, pinnedId);
  // Automático com uma peça só (você sozinho) é o mosaico de um.
  const mode = pinned ? 'focus' : layout === 'auto' && all.length > 1 ? 'focus' : 'mosaic';

  if (mode === 'focus') {
    // Grande: o fixado, ou a tela, ou quem está falando. Na faixa, todo o resto (dá para fixar
    // qualquer um dali, inclusive a tela).
    const main = pinned ?? featuredPiece(all, lastSpeaker.current);
    const rest = all.filter((p) => p !== main);
    return (
      <div className="stage-focus" data-layout="focus" data-strip={rest.length > 0 || undefined}>
        {main && (
          <div
            key={main.key}
            className="stage-cell"
            style={{ viewTransitionName: transitionName(main.key) }}
          >
            <PieceView piece={main} extras={extras} />
          </div>
        )}
        {rest.length > 0 && (
          <div className="stage-strip">
            {rest.map((p) => (
              <div
                key={p.key}
                className="stage-cell stage-thumb"
                style={{ viewTransitionName: transitionName(p.key) }}
              >
                <PieceView piece={p} small extras={extras} />
              </div>
            ))}
          </div>
        )}
        {audience}
      </div>
    );
  }

  const cols = columnsFor(all.length);
  return (
    <div
      className="stage-mosaic"
      data-layout="mosaic"
      data-dense={all.length >= 3 || undefined}
      style={
        {
          '--cols': cols,
          '--cols-sm': all.length <= 2 ? 1 : 2,
        } as React.CSSProperties
      }
    >
      {all.map((p) => (
        <div
          key={p.key}
          className="stage-cell"
          style={{ viewTransitionName: transitionName(p.key) }}
        >
          <PieceView piece={p} extras={extras} />
        </div>
      ))}
      {audience}
    </div>
  );
}

/** Identifica as faixas de áudio de cada pessoa: só muda quando alguém liga/desliga o som. */
function audioSignature(participants: RemoteParticipant[]): string {
  return participants
    .map((p) =>
      [Track.Source.Microphone, Track.Source.ScreenShareAudio]
        .map((source) => p.getTrackPublication(source)?.track?.sid ?? '')
        .join(','),
    )
    .join('|');
}

/**
 * Toca o áudio de quem está na sala (microfone e áudio de tela). Os elementos de áudio
 * ficam escondidos e só são recriados quando as faixas mudam (não a cada re-render, o que
 * cortaria o som).
 */
export function RemoteAudio({ participants }: { participants: RemoteParticipant[] }) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(participants);
  latest.current = participants;
  const signature = audioSignature(participants);
  const prefs = useAudioPrefs();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  /** Cada som tocando: de quem é, o elemento e (só acima de 100%) o amplificador. */
  const playing = useRef<
    { identity: string; track: MediaStreamTrack; el: HTMLMediaElement; boost?: Boost }[]
  >([]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const cleanups: (() => void)[] = [];
    playing.current = [];
    for (const p of latest.current) {
      for (const source of [Track.Source.Microphone, Track.Source.ScreenShareAudio]) {
        const track = p.getTrackPublication(source)?.track;
        if (!track) continue;
        const el = track.attach();
        root.appendChild(el);
        const entry = { identity: p.identity, track: track.mediaStreamTrack, el };
        playing.current.push(entry);
        applyVolume(
          entry,
          effectiveVolume(prefsRef.current, p.identity),
          prefsRef.current.outputId,
        );
        cleanups.push(() => {
          (entry as { boost?: Boost }).boost?.close();
          track.detach(el);
          el.remove();
        });
      }
    }
    return () => cleanups.forEach((fn) => fn());
  }, [signature]);

  // Mudou o volume de alguém, silenciou ou desligou o som da sala: aplica sem recriar nada.
  useEffect(() => {
    for (const entry of playing.current) {
      applyVolume(entry, effectiveVolume(prefs, entry.identity), prefs.outputId);
    }
  }, [prefs]);

  return <div ref={container} hidden aria-hidden="true" data-testid="remote-audio" />;
}

/** Amplificador do navegador para tocar acima de 100% (só para quem foi aumentado). */
interface Boost {
  gain: GainNode;
  ctx: AudioContext & { setSinkId?: (id: string) => Promise<void> };
  sinkId: string;
  close: () => void;
}

function applyVolume(
  entry: { track: MediaStreamTrack; el: HTMLMediaElement; boost?: Boost },
  volume: number,
  outputId = '',
) {
  if (volume <= 1) {
    entry.boost?.close();
    entry.boost = undefined;
    entry.el.muted = volume === 0;
    entry.el.volume = volume;
    return;
  }
  // Acima de 100%: o elemento fica mudo e o som passa por um ganho do Web Audio.
  if (!entry.boost) {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(new MediaStream([entry.track]));
      const gain = ctx.createGain();
      src.connect(gain).connect(ctx.destination);
      void ctx.resume().catch(() => undefined);
      entry.boost = {
        gain,
        ctx,
        sinkId: '',
        close: () => {
          src.disconnect();
          gain.disconnect();
          void ctx.close().catch(() => undefined);
        },
      };
    } catch {
      // Sem Web Audio: fica no máximo do elemento (100%).
      entry.el.muted = false;
      entry.el.volume = 1;
      return;
    }
  }
  entry.el.muted = true;
  entry.boost.gain.gain.value = volume;
  // O amplificador sai pela mesma saída de som escolhida (Chrome/Edge).
  if (entry.boost.sinkId !== outputId && entry.boost.ctx.setSinkId) {
    entry.boost.sinkId = outputId;
    void entry.boost.ctx.setSinkId(outputId).catch(() => undefined);
  }
}
