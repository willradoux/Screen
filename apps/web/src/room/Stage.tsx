import { Track, type RemoteParticipant, type TrackPublication } from 'livekit-client';
import { useEffect, useRef } from 'react';
import { Avatar } from '../components/ui';
import { ROLE_LABEL } from '../lib/moderation-rules';
import { screenSharers, type Tile } from './useParticipants';

function Video({
  pub,
  mirror = false,
  fit = 'cover',
  label,
}: {
  pub: TrackPublication;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = pub.track;

  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted // o áudio é tocado à parte (RemoteAudio); aqui só a imagem
      aria-label={label}
      className={`h-full w-full bg-black ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${mirror ? '-scale-x-100' : ''}`}
    />
  );
}

function PersonTile({ tile, size = 'normal' }: { tile: Tile; size?: 'normal' | 'small' }) {
  return (
    <figure
      data-testid="tile"
      data-speaking={tile.isSpeaking || undefined}
      className={`relative aspect-video overflow-hidden rounded-xl border bg-zinc-900 ${
        tile.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-zinc-800'
      } ${size === 'small' ? 'w-48 shrink-0' : ''}`}
    >
      {tile.cameraPub ? (
        <Video pub={tile.cameraPub} mirror={tile.isLocal} label={`Câmera de ${tile.name}`} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Avatar name={tile.name} url={tile.avatarUrl} size="lg" />
        </div>
      )}
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
          className={`ml-auto text-xs ${tile.micOn ? 'text-emerald-300' : 'text-red-300'}`}
          title={tile.micOn ? 'Microfone ligado' : 'Microfone desligado'}
        >
          {tile.micOn ? '🎙' : '🔇'}
          <span className="sr-only">{tile.micOn ? 'Microfone ligado' : 'Microfone desligado'}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function ScreenTile({ tile }: { tile: Tile }) {
  if (!tile.screenPub) return null;
  return (
    <figure
      data-testid="screen-tile"
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-brand-400/60 bg-black"
    >
      <Video pub={tile.screenPub} fit="contain" label={`Tela de ${tile.name}`} />
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

/**
 * Quem compartilha tela ganha destaque (a tela grande e o resto numa faixa ao lado);
 * sem compartilhamento, todos em grade.
 */
export function Stage({ tiles }: { tiles: Tile[] }) {
  const sharers = screenSharers(tiles);
  const featured = sharers[0];

  if (featured) {
    return (
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-3">
          <ScreenTile tile={featured} />
          {sharers.slice(1).map((t) => (
            <ScreenTile key={t.identity} tile={t} />
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto">
          {tiles.map((t) => (
            <PersonTile key={t.identity} tile={t} size="small" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${gridColumns(tiles.length)}`}>
      {tiles.map((t) => (
        <PersonTile key={t.identity} tile={t} />
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
