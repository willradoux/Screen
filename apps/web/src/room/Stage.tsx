import { Track, type RemoteParticipant, type TrackPublication } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/ui';
import { POSITION_CLASS, aspectRatioNumber, useVideoPrefs } from '../lib/videoPrefs';
import { ROLE_LABEL } from '../lib/moderation-rules';
import { screenSharers, type Tile } from './useParticipants';

function Video({
  pub,
  mirror = false,
  fit = 'cover',
  label,
  onNaturalAspect,
}: {
  pub: TrackPublication;
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

function PersonTile({ tile, size = 'normal' }: { tile: Tile; size?: 'normal' | 'small' }) {
  const prefs = useVideoPrefs();
  const [natural, setNatural] = useState<number | null>(null);
  const ratio = aspectRatioNumber(prefs.shape, tile.cameraPub ? natural : null);
  return (
    <figure
      data-testid="tile"
      data-speaking={tile.isSpeaking || undefined}
      data-size={size}
      style={fitStyle(ratio)}
      className={`stage-tile ${tile.cameraPub ? '' : 'stage-tile-empty'} ${
        tile.isSpeaking ? 'speaking-glow' : ''
      }`}
    >
      {tile.cameraPub ? (
        <Video
          pub={tile.cameraPub}
          mirror={tile.isLocal}
          fit={prefs.fit}
          label={`Câmera de ${tile.name}`}
          onNaturalAspect={setNatural}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Avatar name={tile.name} url={tile.avatarUrl} size={size === 'small' ? 'md' : 'lg'} />
        </div>
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
          <Icon name={tile.micOn ? 'mic' : 'mic_off'} size="1.05rem" />
          <span className="sr-only">{tile.micOn ? 'Microfone ligado' : 'Microfone desligado'}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function ScreenTile({ tile }: { tile: Tile }) {
  const [natural, setNatural] = useState<number | null>(null);
  if (!tile.screenPub) return null;
  return (
    <figure
      data-testid="screen-tile"
      style={fitStyle(natural ?? 16 / 9)}
      className="stage-tile stage-tile-screen"
    >
      <Video
        pub={tile.screenPub}
        fit="contain"
        label={`Tela de ${tile.name}`}
        onNaturalAspect={setNatural}
      />
      <figcaption className="absolute left-2.5 top-2.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">
        Tela de {tile.name}
        {tile.isLocal && ' (você)'}
      </figcaption>
    </figure>
  );
}

/**
 * Como organizar o palco:
 * - `auto`: com tela compartilhada, ela em destaque; sem tela, todos em mosaico.
 * - `mosaic`: tudo lado a lado, preenchendo a tela.
 * - `focus`: um grande (tela, quem está falando ou a primeira pessoa) e o resto numa faixa.
 *
 * Em todos, cada vídeo tem o quadro no formato real da transmissão (largo, quadrado ou em pé)
 * e cresce até onde couber, sem faixas pretas.
 */
export type StageLayout = 'auto' | 'mosaic' | 'focus';

export const STAGE_LAYOUTS: { value: StageLayout; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'mosaic', label: 'Mosaico' },
  { value: 'focus', label: 'Destaque' },
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

function PieceView({ piece, small = false }: { piece: Piece; small?: boolean }) {
  return piece.kind === 'screen' ? (
    <ScreenTile tile={piece.tile} />
  ) : (
    <PersonTile tile={piece.tile} size={small ? 'small' : 'normal'} />
  );
}

function featuredPiece(all: Piece[]): Piece | undefined {
  return (
    all.find((p) => p.kind === 'screen') ??
    all.find((p) => p.kind === 'person' && p.tile.isSpeaking && !p.tile.isLocal) ??
    all.find((p) => p.kind === 'person' && !p.tile.isLocal) ??
    all[0]
  );
}

/** Colunas do mosaico: o mais perto de um quadrado (1, 2, 2, 2, 3, 3, ...). */
const columnsFor = (count: number) => Math.max(1, Math.ceil(Math.sqrt(count)));

export function Stage({ tiles, layout = 'auto' }: { tiles: Tile[]; layout?: StageLayout }) {
  const all = pieces(tiles);
  const mode = layout === 'auto' ? (screenSharers(tiles).length > 0 ? 'focus' : 'mosaic') : layout;

  if (mode === 'focus') {
    const main = featuredPiece(all);
    const rest = all.filter((p) => p !== main);
    return (
      <div className="stage-focus" data-layout="focus" data-strip={rest.length > 0 || undefined}>
        {main && (
          <div className="stage-cell">
            <PieceView piece={main} />
          </div>
        )}
        {rest.length > 0 && (
          <div className="stage-strip">
            {rest.map((p) => (
              <div key={p.key} className="stage-cell stage-thumb">
                <PieceView piece={p} small />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const cols = columnsFor(all.length);
  return (
    <div
      className="stage-mosaic"
      data-layout="mosaic"
      style={
        {
          '--cols': cols,
          '--cols-sm': all.length <= 2 ? 1 : 2,
        } as React.CSSProperties
      }
    >
      {all.map((p) => (
        <div key={p.key} className="stage-cell">
          <PieceView piece={p} />
        </div>
      ))}
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
