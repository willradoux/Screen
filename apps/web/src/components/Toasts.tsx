import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '../lib/sounds';
import { Icon } from './Icon';

export interface Toast {
  id: number;
  tone: 'info' | 'error';
  text: string;
}

/**
 * Avisos curtos que somem sozinhos. O mesmo aviso não aparece duas vezes: se chegar de novo,
 * o que já está na tela ganha mais tempo. Cada aviso novo toca um som curto (se ligados).
 */
export function useToasts(ttlMs = 6000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const schedule = useCallback(
    (id: number) => {
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setToasts((list) => list.filter((t) => t.id !== id));
        }, ttlMs),
      );
    },
    [ttlMs],
  );

  // Lista atual fora do estado: a decisão (repetido ou novo, tocar som) roda uma vez só.
  const current = useRef<Toast[]>([]);
  current.current = toasts;

  const push = useCallback(
    (tone: Toast['tone'], text: string) => {
      const same = current.current.find((t) => t.tone === tone && t.text === text);
      if (same) {
        schedule(same.id);
        return;
      }
      const id = next.current++;
      schedule(id);
      playSound(tone === 'error' ? 'error' : 'notify');
      const toast = { id, tone, text };
      current.current = [...current.current.slice(-3), toast];
      setToasts((list) => [...list.slice(-3), toast]);
    },
    [schedule],
  );

  return {
    toasts,
    info: useCallback((text: string) => push('info', text), [push]),
    error: useCallback((text: string) => push('error', text), [push]),
    dismiss: useCallback((id: number) => {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      setToasts((list) => list.filter((t) => t.id !== id));
    }, []),
  };
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div aria-live="polite" className="toast-viewport">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="toast">
          <span className="toast-icon" data-tone={t.tone} aria-hidden="true">
            <Icon name={t.tone === 'error' ? 'error' : 'info'} size="1.05rem" />
          </span>
          <p className="min-w-0 flex-1 pt-0.5 text-[13px] font-medium leading-snug text-zinc-100">
            {t.text}
          </p>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => onDismiss(t.id)}
            className="icon-button -my-1 -mr-1 h-8 w-8"
          >
            <Icon name="close" size="1rem" />
          </button>
        </div>
      ))}
    </div>
  );
}
