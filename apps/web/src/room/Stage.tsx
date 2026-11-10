import {
  Track,
  type VideoQuality,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type TrackPublication,
} from 'livekit-client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/ui';
import { cameraQualityFor, screenQualityFor } from '../lib/bigRoom';
import { POSITION_CLASS, aspectFor, useVideoPrefs } from '../lib/videoPrefs';
import { ROLE_LABEL } from '../lib/moderation-rules';
import { screenSharers, type Tile } from './useParticipants';

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
      className={`h-full w-full bg-black ${fit === 'contain' ? 'object-contain' : `object-cover ${POSITION_CLASS[prefs.position]}`} ${mirror ? '-scale-x-100' : ''}`}
    />
  );
}

function PinButton({
  tile,
  pinned,
  onPin,
}: {
  tile: Tile;
  pinned: boolean;
  onPin: (identity: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPin(tile.identity)}
      aria-pressed={pinned}
      aria-label={`${pinned ? 'Desafixar' : 'Fixar'} ${tile.name}`}
      title={pinned ? 'Desafixar' : 'Fixar em destaque'}
      className={`absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-white backdrop-blur transition-opacity focus-visible:opacity-100 ${
        pinned
          ? 'bg-brand-500/80 opacity-100'
          : 'bg-black/55 opacity-0 hover:bg-black/75 group-hover:opacity-100'
      }`}
    >
      <Icon name={pinned ? 'keep_off' : 'keep'} size="1rem" />
    </button>
  );
}

function PersonTile({
  tile,
  size = 'normal',
  pinned = false,
  onPin,
  quality,
}: {
  tile: Tile;
  quality?: VideoQuality | undefined;
  size?: 'normal' | 'small';
  pinned?: boolean;
  onPin?: (identity: string) => void;
}) {
  const prefs = useVideoPrefs();
  const [natural, setNatural] = useState<number | null>(null);
  const fit = prefs.fit;
  return (
    <figure
      data-testid="tile"
      data-speaking={tile.isSpeaking || undefined}
      style={{ aspectRatio: aspectFor(prefs.shape, natural) }}
      className={`group relative overflow-hidden rounded-2xl border bg-zinc-900 ${
        tile.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-zinc-800'
      } ${size === 'small' ? 'w-44 shrink-0' : 'mx-auto w-full'} ${natural && natural < 1 && prefs.shape === 'auto' ? 'max-h-[75vh] w-auto' : ''}`}
    >
      {tile.cameraPub ? (
        <Video
          pub={tile.cameraPub}
          mirror={tile.isLocal}
          fit={fit}
          label={`Câmera de ${tile.name}`}
          quality={quality}
          onNaturalAspect={setNatural}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Avatar name={tile.name} url={tile.avatarUrl} size="lg" />
        </div>
      )}
      {onPin && <PinButton tile={tile} pinned={pinned} onPin={onPin} />}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-sm">
        <span className="truncate font-medium text-white">
          {tile.name}
          {tile.isLocal && ' (você)'}
        </span>
        {tile.role !== 'MEMBER' && (
          <span className="rounded bg-brand-500/60 px-1.5 text-[10px] font-semibold uppercase text-white">
            {ROLE_LABEL[tile.role]}
          </span>
        )}
        <span
          className={`ml-auto ${tile.micOn ? 'text-emerald-300' : 'text-red-300'}`}
          title={tile.micOn ? 'Microfone ligado' : 'Microfone desligado'}
        >
          <Icon name={tile.micOn ? 'mic' : 'mic_off'} size="1.1rem" />
          <span className="sr-only">{tile.micOn ? 'Microfone ligado' : 'Microfone desligado'}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function ScreenTile({
  tile,
  pinned = false,
  onPin,
  quality,
}: {
  tile: Tile;
  quality?: VideoQuality | undefined;
  pinned?: boolean;
  onPin?: (identity: string) => void;
}) {
  if (!tile.screenPub) return null;
  return (
    <figure
      data-testid="screen-tile"
      className="group relative aspect-video w-full overflow-hidden rounded-xl border border-brand-400/60 bg-black"
    >
      <Video pub={tile.screenPub} fit="contain" label={`Tela de ${tile.name}`} quality={quality} />
      {onPin && <PinButton tile={tile} pinned={pinned} onPin={onPin} />}
      <figcaption className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
        Tela de {tile.name}
        {tile.isLocal && ' (você)'}
      </figcaption>
    </figure>
  );
}

function gridColumns(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-3xl mx-auto';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 9) return 'grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-2 lg:grid-cols-4';
}

/** Acima disto, quem está só ouvindo (sem câmera, tela ou voz) deixa de ter um quadrado. */
const CROWD = 24;

const isActive = (t: Tile) =>
  t.isLocal || t.isSpeaking || t.micOn || Boolean(t.cameraPub) || Boolean(t.screenPub);

/**
 * O palco. Com o palco ligado (modo palestra) só aparece quem foi colocado nele e a plateia vira
 * um número; salas grandes mostram só quem está transmitindo ou falando. Quem compartilha tela
 * ganha destaque, e qualquer pessoa pode fixar uma câmera ou tela para vê-la grande.
 */
export function Stage({
  tiles,
  lectureMode = false,
  onStageSelf,
  pinnedId: controlledPin,
  onPinnedChange,
}: {
  tiles: Tile[];
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
  const togglePin = (identity: string) => setPinned(pinnedId === identity ? null : identity);
  const cameraQuality = cameraQualityFor(tiles.length);
  const screenQuality = screenQualityFor(tiles.length);

  const visible = lectureMode
    ? tiles.filter((t) => t.canPublish)
    : tiles.length > CROWD
      ? tiles.filter(isActive)
      : tiles;
  const hidden = tiles.length - visible.length;
  const pinned = visible.find((t) => t.identity === pinnedId);
  const sharers = screenSharers(visible);

  const footer =
    hidden > 0 ? (
      <p className="tabular text-center text-sm text-zinc-500" data-testid="audience-count">
        {lectureMode ? 'Na plateia' : 'Só ouvindo'}: {hidden} {hidden === 1 ? 'pessoa' : 'pessoas'}
      </p>
    ) : null;

  if (lectureMode && visible.length === 0) {
    return (
      <div className="space-y-3">
        <div
          className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-zinc-700 px-6 py-16 text-center"
          data-testid="empty-stage"
        >
          <Icon name="stadium" size="2.5rem" />
          <p className="text-lg font-semibold text-zinc-50">O palco está vazio.</p>
          <p className="max-w-md text-sm text-zinc-400">
            Ninguém transmite até um admin subir alguém ao palco, pela lista de pessoas.
          </p>
          {onStageSelf && (
            <button
              type="button"
              onClick={onStageSelf}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-50 px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              <Icon name="person_add" size="1.1rem" />
              Subir ao palco
            </button>
          )}
        </div>
        {footer}
      </div>
    );
  }

  const spotlight: ReactNode[] = [];
  if (pinned) {
    spotlight.push(
      pinned.screenPub ? (
        <ScreenTile
          key={`s-${pinned.identity}`}
          tile={pinned}
          pinned
          onPin={togglePin}
          quality={screenQuality}
        />
      ) : (
        <PersonTile
          key={`p-${pinned.identity}`}
          tile={pinned}
          pinned
          onPin={togglePin}
          quality={cameraQuality}
        />
      ),
    );
  } else {
    for (const t of sharers) {
      spotlight.push(
        <ScreenTile key={`s-${t.identity}`} tile={t} onPin={togglePin} quality={screenQuality} />,
      );
    }
  }

  if (spotlight.length > 0) {
    const bigPerson = pinned && !pinned.screenPub ? pinned : null;
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-3">{spotlight}</div>
          <div className="flex gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto">
            {visible
              .filter((t) => t !== bigPerson)
              .map((t) => (
                <PersonTile
                  key={t.identity}
                  tile={t}
                  size="small"
                  pinned={t.identity === pinnedId}
                  onPin={togglePin}
                  quality={cameraQuality}
                />
              ))}
          </div>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${gridColumns(visible.length)}`}>
        {visible.map((t) => (
          <PersonTile key={t.identity} tile={t} onPin={togglePin} quality={cameraQuality} />
        ))}
      </div>
      {footer}
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

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const cleanups: (() => void)[] = [];
    for (const p of latest.current) {
      for (const source of [Track.Source.Microphone, Track.Source.ScreenShareAudio]) {
        const track = p.getTrackPublication(source)?.track;
        if (!track) continue;
        const el = track.attach();
        root.appendChild(el);
        cleanups.push(() => {
          track.detach(el);
          el.remove();
        });
      }
    }
    return () => cleanups.forEach((fn) => fn());
  }, [signature]);

  return <div ref={container} hidden aria-hidden="true" data-testid="remote-audio" />;
}
