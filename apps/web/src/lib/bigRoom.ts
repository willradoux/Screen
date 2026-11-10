import {
  AudioPresets,
  VideoPresets,
  VideoQuality,
  type AudioCaptureOptions,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from 'livekit-client';
import type { Tile } from '../room/useParticipants';

/**
 * Salas grandes (centenas de pessoas) em um servidor pequeno. O que custa caro é cada espectador
 * receber cada vídeo e cada áudio, então o plano é: o palco publica leve, a plateia assiste a UM
 * vídeo por vez na camada mais fraca que ainda é útil, e o áudio é só de fala.
 */

/** A sala é grande o bastante para precisar do modo econômico? */
export const BIG_ROOM_MIN_CAPACITY = 100;

export const isBigRoom = (maxParticipants: number): boolean =>
  maxParticipants >= BIG_ROOM_MIN_CAPACITY;

export interface PublishProfile {
  camera: { capture: VideoCaptureOptions; publish: TrackPublishOptions };
  microphone: { capture: AudioCaptureOptions; publish: TrackPublishOptions };
  screen: { capture: ScreenShareCaptureOptions; publish: TrackPublishOptions };
}

/** Perfil normal: qualidade de reunião pequena. */
export const NORMAL_PROFILE: PublishProfile = {
  camera: { capture: {}, publish: {} },
  microphone: { capture: {}, publish: {} },
  screen: {
    capture: {
      audio: true,
      contentHint: 'detail', // legibilidade do código acima de fluidez
      resolution: { width: 1920, height: 1080, frameRate: 30 },
    },
    publish: {},
  },
};

/**
 * Perfil econômico de quem está no palco de uma sala grande: câmera 360p (~0,45 Mbps) com camadas
 * menores para a plateia, tela de slides em 720p a 10 quadros (~0,8 Mbps) e voz de 24 kbps sem
 * redundância (RED dobraria a banda do áudio para cada um dos espectadores).
 */
export const BIG_ROOM_PROFILE: PublishProfile = {
  camera: {
    capture: { resolution: VideoPresets.h360.resolution },
    publish: {
      simulcast: true,
      videoEncoding: { maxBitrate: 450_000, maxFramerate: 24 },
    },
  },
  microphone: {
    capture: {},
    publish: { red: false, dtx: true, audioPreset: AudioPresets.speech },
  },
  screen: {
    capture: {
      audio: true,
      contentHint: 'detail',
      resolution: { width: 1280, height: 720, frameRate: 10 },
    },
    publish: { screenShareEncoding: { maxBitrate: 800_000, maxFramerate: 10 } },
  },
};

export const profileFor = (maxParticipants: number): PublishProfile =>
  isBigRoom(maxParticipants) ? BIG_ROOM_PROFILE : NORMAL_PROFILE;

/** Câmeras que a plateia recebe: quanto mais gente, mais fraca a camada pedida. */
export function cameraQualityFor(people: number): VideoQuality | undefined {
  if (people > 200) return VideoQuality.LOW;
  if (people > 60) return VideoQuality.MEDIUM;
  return undefined;
}

/** Telas: só perdem qualidade em salas muito grandes (precisam continuar legíveis). */
export function screenQualityFor(people: number): VideoQuality | undefined {
  return people > 300 ? VideoQuality.MEDIUM : undefined;
}

export interface WantedVideo {
  identity: string;
  source: 'camera' | 'screen';
}

/**
 * Qual é o único vídeo que um espectador de sala grande recebe: o fixado (a tela dele, se
 * houver, senão a câmera), senão a primeira tela compartilhada, senão quem falou por último
 * no palco, senão o primeiro do palco.
 */
export function wantedVideo(
  tiles: Tile[],
  pinnedId: string | null,
  lastSpeakerId: string | null,
): WantedVideo | null {
  const stage = tiles.filter((t) => t.canPublish);
  const pick = (t: Tile): WantedVideo => ({
    identity: t.identity,
    source: t.screenPublished ? 'screen' : 'camera',
  });

  const pinned = pinnedId ? tiles.find((t) => t.identity === pinnedId) : undefined;
  if (pinned) return pick(pinned);

  const sharer = stage.find((t) => t.screenPublished);
  if (sharer) return { identity: sharer.identity, source: 'screen' };

  const last = lastSpeakerId ? stage.find((t) => t.identity === lastSpeakerId) : undefined;
  const chosen = last ?? stage[0];
  return chosen ? { identity: chosen.identity, source: 'camera' } : null;
}
