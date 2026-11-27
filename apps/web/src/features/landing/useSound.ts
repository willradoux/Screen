import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sfx, Synthwave } from './synthwave';
import { motionOff } from './motion';

/*
 * Som da página de apresentação: liga/desliga a trilha, volume (lembrado no navegador),
 * efeitos e o pulso da cena no bumbo.
 */

const SOUND_KEY = 'screen-lp-sound';
const VOLUME_KEY = 'screen-lp-volume';
/** Volume em 10 degraus, como nas TVs antigas. */
export const VOLUME_STEPS = 10;

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isInteger(v) && v >= 0 && v <= VOLUME_STEPS ? v : 7;
  } catch {
    return 7;
  }
}

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

function saveSoundPref(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // sem armazenamento: só não lembra
  }
}

/**
 * Som da página: a trilha e os efeitos. O motor só nasce quando a pessoa liga a TV (o navegador
 * não deixa tocar antes de um clique) e o código dele só carrega nessa hora.
 */
export function useSound(root: React.RefObject<HTMLDivElement | null>) {
  const [on, setOn] = useState(false);
  const [volume, setVolumeState] = useState(readVolume);
  const engine = useRef<Synthwave | null>(null);
  const want = useRef(readSoundPref());
  const volRef = useRef(volume);

  const ensure = useCallback(async () => {
    if (!engine.current) {
      const { Synthwave } = await import('./synthwave');
      engine.current = new Synthwave();
      engine.current.setVolume(volRef.current / VOLUME_STEPS);
      // Para medir o som no navegador durante o desenvolvimento.
      if (import.meta.env.DEV)
        (window as unknown as { __lpSound?: Synthwave }).__lpSound = engine.current;
    }
    return engine.current;
  }, []);

  const turn = useCallback(
    async (next: boolean) => {
      want.current = next;
      saveSoundPref(next);
      setOn(next);
      if (next) {
        const e = await ensure();
        await e.start();
        e.sound('power');
      } else {
        engine.current?.stop();
      }
    },
    [ensure],
  );

  // Aba escondida: pausa o áudio; voltou: continua.
  useEffect(() => {
    const onVis = () => {
      if (!engine.current) return;
      if (document.hidden) engine.current.suspend();
      else if (on) engine.current.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [on]);

  // A cena pulsa no bumbo (uma variável CSS, atualizada só enquanto toca).
  useEffect(() => {
    const el = root.current;
    if (!on || !el || motionOff()) return;
    let raf = 0;
    const loop = () => {
      el.style.setProperty('--beat', (engine.current?.beat() ?? 0).toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--beat', '0');
    };
  }, [on, root]);

  useEffect(() => () => engine.current?.close(), []);

  // Estável: não reinicia os relógios da página a cada desenho.
  const fx = useCallback((kind: Sfx, note = 0) => {
    if (want.current) engine.current?.sound(kind, note);
  }, []);

  /** Volume − / +: um degrau por vez; com o som desligado, o + liga. */
  const changeVolume = useCallback(
    (delta: number) => {
      const next = Math.min(VOLUME_STEPS, Math.max(0, volRef.current + delta));
      volRef.current = next;
      setVolumeState(next);
      try {
        localStorage.setItem(VOLUME_KEY, String(next));
      } catch {
        // sem armazenamento: só não lembra
      }
      engine.current?.setVolume(next / VOLUME_STEPS);
      if (delta > 0 && !want.current) void turn(true);
      else engine.current?.sound('click', next);
    },
    [turn],
  );

  return {
    on,
    volume,
    turn,
    toggle: () => void turn(!on),
    changeVolume,
    fx,
  };
}
