import {
  ParticipantEvent,
  RoomEvent,
  Track,
  type LocalParticipant,
  type Participant,
  type RemoteParticipant,
  type Room,
  type TrackPublication,
} from 'livekit-client';
import { roleSchema, type Role } from '@screem/shared';
import { useEffect, useState } from 'react';

/** Uma pessoa da sala, já reduzida ao que a interface precisa. */
export interface Tile {
  identity: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  isLocal: boolean;
  isSpeaking: boolean;
  /** Pode transmitir agora. No palco ligado isto é exatamente "está no palco". */
  canPublish: boolean;
  micOn: boolean;
  cameraPub: TrackPublication | undefined;
  screenPub: TrackPublication | undefined;
  /** Há tela publicada (mesmo que este navegador não esteja recebendo o vídeo dela). */
  screenPublished: boolean;
}

/** O metadata é colocado pelo servidor no token; o cliente só lê. */
export function parseMetadata(metadata: string | undefined): {
  role: Role;
  avatarUrl: string | null;
} {
  try {
    const raw = JSON.parse(metadata || '{}') as { role?: unknown; avatarUrl?: unknown };
    const role = roleSchema.safeParse(raw.role);
    return {
      role: role.success ? role.data : 'MEMBER',
      avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null,
    };
  } catch {
    return { role: 'MEMBER', avatarUrl: null };
  }
}

const hasVideo = (pub: TrackPublication | undefined) => Boolean(pub && !pub.isMuted && pub.track);

export function toTile(p: Participant): Tile {
  const meta = parseMetadata(p.metadata);
  const camera = p.getTrackPublication(Track.Source.Camera);
  const screen = p.getTrackPublication(Track.Source.ScreenShare);
  return {
    identity: p.identity,
    name: p.name || p.identity,
    role: meta.role,
    avatarUrl: meta.avatarUrl,
    isLocal: p.isLocal,
    isSpeaking: p.isSpeaking,
    canPublish: p.permissions?.canPublish ?? false,
    micOn: p.isMicrophoneEnabled,
    cameraPub: hasVideo(camera) ? camera : undefined,
    screenPub: hasVideo(screen) ? screen : undefined,
    screenPublished: Boolean(screen && !screen.isMuted),
  };
}

const ROOM_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ParticipantMetadataChanged,
  RoomEvent.ParticipantNameChanged,
  // O servidor mudou o que alguém pode transmitir (palco, tela travada, silenciar).
  RoomEvent.ParticipantPermissionsChanged,
  RoomEvent.Reconnected,
] as const;

/**
 * As pessoas da sala (eu primeiro). O LiveKit avisa por eventos e entrega os objetos
 * já mutáveis, então guardamos só um contador para re-renderizar e derivamos tudo.
 */
export function useParticipants(room: Room | null): {
  tiles: Tile[];
  remote: RemoteParticipant[];
  local: LocalParticipant | null;
} {
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!room) return;
    // Com centenas de pessoas chegam dezenas de eventos por segundo: o primeiro redesenha na hora
    // e o resto é agrupado em um só redesenho a cada 250 ms.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    const flush = () => {
      timer = null;
      if (dirty) {
        dirty = false;
        setVersion((v) => v + 1);
        timer = setTimeout(flush, 250);
      }
    };
    const refresh = () => {
      if (timer) {
        dirty = true;
        return;
      }
      setVersion((v) => v + 1);
      timer = setTimeout(flush, 250);
    };
    for (const event of ROOM_EVENTS) room.on(event, refresh);
    // Mudanças no próprio participante local (mic ligado/desligado) também.
    room.localParticipant.on(ParticipantEvent.TrackMuted, refresh);
    room.localParticipant.on(ParticipantEvent.TrackUnmuted, refresh);
    refresh();
    return () => {
      if (timer) clearTimeout(timer);
      for (const event of ROOM_EVENTS) room.off(event, refresh);
      room.localParticipant.off(ParticipantEvent.TrackMuted, refresh);
      room.localParticipant.off(ParticipantEvent.TrackUnmuted, refresh);
    };
  }, [room]);

  if (!room) return { tiles: [], remote: [], local: null };
  const remote = [...room.remoteParticipants.values()];
  const tiles = [room.localParticipant, ...remote].map(toTile);
  return { tiles, remote, local: room.localParticipant };
}

/** Quem está compartilhando tela agora. */
export const screenSharers = (tiles: Tile[]): Tile[] => tiles.filter((t) => t.screenPub);
