import { VideoQuality } from 'livekit-client';
import { describe, expect, it } from 'vitest';
import type { Tile } from '../room/useParticipants';
import {
  BIG_ROOM_PROFILE,
  NORMAL_PROFILE,
  cameraQualityFor,
  isBigRoom,
  profileFor,
  HD_PROFILE,
  countVideos,
  screenQualityFor,
  wantedVideo,
} from './bigRoom';

const tile = (over: Partial<Tile>): Tile => ({
  identity: 'a',
  name: 'A',
  role: 'MEMBER',
  avatarUrl: null,
  isLocal: false,
  isSpeaking: false,
  canPublish: true,
  micOn: true,
  cameraPub: undefined,
  screenPub: undefined,
  screenPublished: false,
  ...over,
});

describe('sala grande', () => {
  it('a qualidade de quem transmite segue a sala de verdade (pessoas e vídeos), não as vagas', () => {
    expect(isBigRoom(99)).toBe(false);
    expect(isBigRoom(100)).toBe(true);
    // Pouca gente e até 5 vídeos: alta, a 60 quadros.
    expect(profileFor({ people: 3, videos: 2 })).toBe(HD_PROFILE);
    expect(profileFor({ people: 30, videos: 5 })).toBe(HD_PROFILE);
    expect(HD_PROFILE.camera.capture.resolution?.frameRate).toBe(60);
    expect(HD_PROFILE.screen.capture.resolution?.height).toBe(1080);
    // Muitos transmitindo: normal até 100 pessoas, econômico acima.
    expect(profileFor({ people: 10, videos: 6 })).toBe(NORMAL_PROFILE);
    expect(profileFor({ people: 150, videos: 8 })).toBe(BIG_ROOM_PROFILE);
    // Live/reunião com poucos no palco: a câmera de quem fala sai em alta (com camadas),
    // mesmo com 500 assistindo; a tela e o áudio ficam leves.
    const live = profileFor({ people: 500, videos: 2 });
    expect(live.camera).toBe(HD_PROFILE.camera);
    expect(live.camera.publish.simulcast).toBe(true);
    expect(live.screen).toBe(BIG_ROOM_PROFILE.screen);
    expect(live.microphone).toBe(BIG_ROOM_PROFILE.microphone);
    expect(profileFor({ people: 80, videos: 3 }).screen).toBe(NORMAL_PROFILE.screen);
  });

  it('conta câmeras e telas ligadas', () => {
    const pub = {} as never;
    expect(
      countVideos([
        tile({ cameraPub: pub }),
        tile({ identity: 'b', cameraPub: pub, screenPub: pub }),
        tile({ identity: 'c' }),
      ]),
    ).toBe(3);
  });

  it('perfil econômico: câmera 360p, tela de slides a 10 quadros, voz sem redundância', () => {
    expect(BIG_ROOM_PROFILE.camera.capture.resolution?.height).toBe(360);
    expect(BIG_ROOM_PROFILE.camera.publish.videoEncoding?.maxBitrate).toBeLessThanOrEqual(500_000);
    expect(BIG_ROOM_PROFILE.screen.capture.resolution?.frameRate).toBe(10);
    expect(BIG_ROOM_PROFILE.microphone.publish.red).toBe(false);
  });

  it('qualidade pedida cai com o tamanho da plateia', () => {
    expect(cameraQualityFor(30)).toBeUndefined();
    expect(cameraQualityFor(61)).toBe(VideoQuality.MEDIUM);
    expect(cameraQualityFor(201)).toBe(VideoQuality.LOW);
    expect(screenQualityFor(300)).toBeUndefined();
    expect(screenQualityFor(301)).toBe(VideoQuality.MEDIUM);
  });
});

describe('wantedVideo: o único vídeo de quem assiste', () => {
  const a = tile({ identity: 'a' });
  const b = tile({ identity: 'b' });
  const plateia = tile({ identity: 'p', canPublish: false, screenPublished: true });

  it('sem palco, nada', () => {
    expect(wantedVideo([plateia], null, null)).toBeNull();
  });

  it('padrão: primeiro do palco; quem falou por último ganha', () => {
    expect(wantedVideo([a, b], null, null)).toEqual({ identity: 'a', source: 'camera' });
    expect(wantedVideo([a, b], null, 'b')).toEqual({ identity: 'b', source: 'camera' });
  });

  it('tela compartilhada do palco tem prioridade sobre quem fala', () => {
    const sharer = tile({ identity: 'c', screenPublished: true });
    expect(wantedVideo([a, b, sharer], null, 'b')).toEqual({ identity: 'c', source: 'screen' });
  });

  it('fixado vence tudo (a tela dele, se houver)', () => {
    const sharer = tile({ identity: 'c', screenPublished: true });
    expect(wantedVideo([a, b, sharer], 'b', null)).toEqual({ identity: 'b', source: 'camera' });
    expect(wantedVideo([a, b, sharer], 'c', null)).toEqual({ identity: 'c', source: 'screen' });
  });

  it('plateia nunca é escolhida (só quem está no palco)', () => {
    expect(wantedVideo([plateia, a], null, 'p')).toEqual({ identity: 'a', source: 'camera' });
  });
});
