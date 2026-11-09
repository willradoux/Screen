import { useCallback, useEffect, useRef, useState } from 'react';

export interface Toast {
  id: number;
  tone: 'info' | 'error';
  text: string;
}

/** Avisos curtos que somem sozinhos. */
export function useToasts(ttlMs = 6000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const push = useCallback(
    (tone: Toast['tone'], text: string) => {
      const id = next.current++;
      setToasts((list) => [...list.slice(-3), { id, tone, text }]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setToasts((list) => list.filter((t) => t.id !== id));
      }, ttlMs);
      timers.current.add(timer);
    },
    [ttlMs],
  );

  return {
    toasts,
    info: useCallback((text: string) => push('info', text), [push]),
    error: useCallback((text: string) => push('error', text), [push]),
    dismiss: useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []),
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
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${
            t.tone === 'error'
              ? 'border-red-500/40 bg-red-950 text-red-100'
              : 'border-zinc-700 bg-zinc-900 text-zinc-100'
          }`}
        >
          <span className="flex-1">{t.text}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => onDismiss(t.id)}
            className="text-zinc-400 hover:text-zinc-50"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
