import { useRef, useState } from 'react';

/**
 * Arrastar a gaveta do celular (chat e pessoas) pela alça, como no Discord:
 *  - para baixo (mais de ~90 px, ou um puxão rápido) fecha;
 *  - para cima abre maior; para baixo, já maior, volta ao tamanho normal;
 *  - soltou pouco: volta para o lugar.
 *
 * O arraste só mexe no `transform` (leve). Para teclado e leitor de tela, a gaveta tem o botão
 * "Fechar painel" e fecha com Esc.
 */
export function useSheetDrag({ onClose }: { onClose: () => void }) {
  const [dy, setDy] = useState(0);
  const [big, setBig] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      start.current = { y: e.clientY, t: performance.now() };
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      // Para cima, resiste (só um pouco); para baixo, segue o dedo.
      const raw = e.clientY - start.current.y;
      setDy(raw < 0 ? Math.max(raw * 0.4, -60) : raw);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      setDragging(false);
      if (!s) return;
      const moved = e.clientY - s.y;
      const speed = moved / Math.max(1, performance.now() - s.t); // px por ms
      setDy(0);
      if (moved > 90 || speed > 0.6) {
        if (big && moved < 220) setBig(false);
        else onClose();
      } else if (moved < -40) {
        setBig(true);
      }
    },
    onPointerCancel: () => {
      start.current = null;
      setDragging(false);
      setDy(0);
    },
  };

  return { dy, big, dragging, handlers, reset: () => setBig(false) };
}
