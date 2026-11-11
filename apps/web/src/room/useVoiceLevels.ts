import {
  createAudioAnalyser,
  type LocalAudioTrack,
  type RemoteAudioTrack,
  type TrackPublication,
} from 'livekit-client';
import { useEffect, useRef } from 'react';
import { effectiveVolume, useAudioPrefs } from '../lib/audioPrefs';

/** Quem pode estar falando: a pessoa e a publicação do microfone dela. */
export interface VoiceSource {
  identity: string;
  micPub?: TrackPublication | undefined;
}

/** Acima disso é voz (o volume vai de 0 a 1). */
const TALK_ON = 0.045;
/** Quanto tempo de silêncio até apagar (evita piscar entre as palavras). */
const TALK_OFF_MS = 320;
/** No máximo tantos medidores ao mesmo tempo (salas grandes: só o palco fala). */
const MAX_METERS = 16;

const motionOff = () =>
  document.documentElement.dataset.motion === 'off' ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Mede o volume de cada microfone no próprio navegador, em tempo real, e escreve direto nos
 * elementos marcados com `data-voice-id="{identity}"` (o card do palco e a linha da lista):
 *  - `data-voice`   = existe medidor para essa pessoa (o CSS passa a confiar nele);
 *  - `data-talking` = está falando agora (acende na hora, apaga depois de ~0,3 s de silêncio);
 *  - `--voice`      = volume suavizado de 0 a 1 (barrinhas e anel seguem a voz).
 *
 * Sem React no meio (nada de redesenho a cada quadro): um único requestAnimationFrame para
 * todos. Sem medidor (faixa ainda não recebida, navegador sem Web Audio), vale o "falando" que
 * vem do servidor (`data-speaking`).
 */
export function useVoiceLevels(sources: VoiceSource[], enabled = true): void {
  // Som cortado para você (fone ou "mutar só para mim"): o Chrome para de entregar esse som ao
  // medidor, então para essa pessoa vale o "falando" do servidor (a animação continua).
  const audio = useAudioPrefs();
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const meters = useRef(
    new Map<
      string,
      {
        track: unknown;
        pub: TrackPublication;
        volume: () => number;
        cleanup: () => Promise<void> | void;
        level: number;
        talking: boolean;
        lastLoud: number;
      }
    >(),
  );

  // Liga e desliga medidores conforme quem está com o microfone aberto.
  const key = sources
    .filter((s) => s.micPub?.track && !s.micPub.isMuted)
    .slice(0, MAX_METERS)
    .map((s) => `${s.identity}:${s.micPub!.trackSid}`)
    .join('|');

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || import.meta.env.MODE === 'test') return;
    const map = meters.current;
    const wanted = new Map<string, TrackPublication>();
    for (const s of sources) {
      if (wanted.size >= MAX_METERS) break;
      if (s.micPub?.track && !s.micPub.isMuted) wanted.set(s.identity, s.micPub);
    }
    for (const [id, m] of map) {
      const pub = wanted.get(id);
      if (!pub || pub.track !== m.track) {
        void m.cleanup();
        map.delete(id);
        markAll(id, (el) => {
          delete el.dataset.voice;
          delete el.dataset.talking;
          el.style.removeProperty('--voice');
        });
      }
    }
    for (const [id, pub] of wanted) {
      if (map.has(id)) continue;
      try {
        const analyser = createAudioAnalyser(pub.track as LocalAudioTrack | RemoteAudioTrack, {
          smoothingTimeConstant: 0.5,
        });
        map.set(id, {
          track: pub.track,
          pub,
          volume: analyser.calculateVolume,
          cleanup: analyser.cleanup,
          level: 0,
          talking: false,
          lastLoud: 0,
        });
      } catch {
        // Sem Web Audio: fica o aviso do servidor.
      }
    }
  }, [key, enabled]);

  // Um laço só, que escreve nos elementos de cada pessoa.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || import.meta.env.MODE === 'test') return;
    let raf = 0;
    let idleTimer = 0;
    let lastFrame = 0;
    const tick = (now: number) => {
      // Leve no celular: 30 vezes por segundo (não 60) e, sem ninguém com o mic aberto,
      // dorme e só confere de novo a cada 0,5 s.
      if (meters.current.size === 0) {
        idleTimer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 500);
        return;
      }
      if (now - lastFrame < 30) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastFrame = now;
      const still = motionOff();
      for (const [id, m] of meters.current) {
        // Sem som pra você: some o medidor e fica o aviso do servidor.
        if (!m.pub.isLocal && effectiveVolume(audioRef.current, id) === 0) {
          if (m.talking || m.level > 0) {
            m.talking = false;
            m.level = 0;
          }
          markAll(id, (el) => {
            delete el.dataset.voice;
            delete el.dataset.talking;
            el.style.removeProperty('--voice');
          });
          continue;
        }
        // Microfone mutado: nunca acende, mesmo se escapar algum som.
        const v = m.pub.isMuted ? 0 : Math.min(1, m.volume() * 2.2);
        // Sobe rápido e desce devagar: segue a voz sem tremer.
        m.level += (v - m.level) * (v > m.level ? 0.55 : 0.12);
        if (v > TALK_ON) m.lastLoud = now;
        const talking = now - m.lastLoud < TALK_OFF_MS;
        const changed = talking !== m.talking;
        m.talking = talking;
        markAll(id, (el) => {
          el.dataset.voice = '';
          if (changed || (talking && !('talking' in el.dataset))) {
            if (talking) el.dataset.talking = '';
            else delete el.dataset.talking;
          }
          el.style.setProperty('--voice', still ? (talking ? '0.6' : '0') : m.level.toFixed(3));
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const map = meters.current;
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      for (const [id, m] of map) {
        void m.cleanup();
        markAll(id, (el) => {
          delete el.dataset.voice;
          delete el.dataset.talking;
          el.style.removeProperty('--voice');
        });
      }
      map.clear();
    };
  }, [enabled]);
}

function markAll(id: string, fn: (el: HTMLElement) => void) {
  document.querySelectorAll<HTMLElement>(`[data-voice-id="${CSS.escape(id)}"]`).forEach(fn);
}
