import { useEffect, useRef } from 'react';
import type { Caption } from '../lib/types';

/** Minimiza o que usamos da Web Speech API (não está nos tipos padrão do TypeScript). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** O navegador sabe transcrever voz? (Chrome e Edge; no Firefox não.) */
export const speechSupported = (): boolean =>
  typeof window !== 'undefined' && recognitionCtor() !== null;

/**
 * Transcreve o SEU microfone enquanto `active` e manda para a sala. Atenção: no Chrome e no Edge a
 * transcrição é feita pelo serviço de voz do navegador (Google ou Microsoft), que recebe o áudio.
 */
export function useSpeechCaptions(
  active: boolean,
  send: (text: string, final: boolean) => void,
  onProblem: (message: string) => void,
) {
  const sendRef = useRef(send);
  sendRef.current = send;
  const problemRef = useRef(onProblem);
  problemRef.current = onProblem;

  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!active || !Ctor) return;
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    let stopped = false;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r[0].transcript.trim();
        if (text) sendRef.current(text, r.isFinal);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        problemRef.current(
          'O navegador não deixou transcrever sua fala. Libere o microfone para o site.',
        );
      }
    };
    // O navegador encerra sozinho depois de um tempo: reinicia enquanto estiver ligado.
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start();
        } catch {
          // Já iniciando.
        }
      }
    };
    try {
      rec.start();
    } catch {
      problemRef.current('Não foi possível iniciar a transcrição.');
    }
    return () => {
      stopped = true;
      rec.onend = null;
      rec.stop();
    };
  }, [active]);
}

/** Legendas na parte de baixo do palco: quem falou e o quê. */
export function CaptionsOverlay({ captions, now }: { captions: Caption[]; now: number }) {
  const recent = captions.filter((c) => now - c.at < 6000).slice(-3);
  if (recent.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-label="Legendas"
      className="pointer-events-none mx-auto mt-3 max-w-3xl space-y-1 text-center"
    >
      {recent.map((c) => (
        <p
          key={c.userId}
          className="inline-block rounded-xl bg-black/75 px-3 py-1.5 text-sm text-on-brand"
        >
          <strong className="mr-1 text-brand-300">{c.displayName}:</strong>
          {c.text}
        </p>
      ))}
    </div>
  );
}
