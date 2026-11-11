import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';

const MIN = 1;
const MAX = 5;
const STEP = 1.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Zoom na tela compartilhada de outra pessoa (só para quem assiste; muda só a sua tela).
 *  - rodinha do mouse em cima: aproxima/afasta mirando onde o mouse está;
 *  - arrastar (com zoom): move a imagem;
 *  - clique duplo: aproxima ali; de novo, volta ao normal;
 *  - pinça com dois dedos no celular;
 *  - botões −, % e + (aparecem ao passar o mouse, e sempre com zoom), acessíveis pelo teclado.
 *
 * Leve: o zoom vai direto no `transform` de uma camada (nada de redesenho do React por quadro).
 */
export function ZoomPan({ name, children }: { name: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  /** Aplica (e limita para a imagem sempre cobrir o quadro). `smooth` anima (botões). */
  const apply = useCallback((s: number, x: number, y: number, smooth = false) => {
    const el = box.current;
    const lay = layer.current;
    if (!el || !lay) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    s = clamp(s, MIN, MAX);
    x = clamp(x, w - w * s, 0);
    y = clamp(y, h - h * s, 0);
    view.current = { s, x, y };
    lay.style.transition = smooth ? 'transform 180ms cubic-bezier(0.2, 0.9, 0.25, 1)' : 'none';
    lay.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    setScale((prev) => (Math.abs(prev - s) > 0.01 ? s : prev));
  }, []);

  /** Zoom mirando um ponto (coordenadas dentro do quadro). */
  const zoomAt = useCallback(
    (next: number, px: number, py: number, smooth = false) => {
      const { s, x, y } = view.current;
      const k = clamp(next, MIN, MAX) / s;
      apply(s * k, px - (px - x) * k, py - (py - y) * k, smooth);
    },
    [apply],
  );

  const center = () => {
    const el = box.current!;
    return [el.clientWidth / 2, el.clientHeight / 2] as const;
  };

  // Rodinha (precisa ser não passiva para não rolar a página junto).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(view.current.s * Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Arrastar e pinçar (ponteiros).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), s: view.current.s };
    }
    if (view.current.s > 1 || pointers.current.size === 2) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const r = box.current!.getBoundingClientRect();
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomAt(
        pinch.current.s * (dist / pinch.current.dist),
        (a!.x + b!.x) / 2 - r.left,
        (a!.y + b!.y) / 2 - r.top,
      );
    } else if (view.current.s > 1) {
      const { s, x, y } = view.current;
      apply(s, x + now.x - prev.x, y + now.y - prev.y);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('button')) return;
    const r = box.current!.getBoundingClientRect();
    if (view.current.s > 1.05) apply(1, 0, 0, true);
    else zoomAt(2.5, e.clientX - r.left, e.clientY - r.top, true);
  };

  // O quadro mudou de tamanho (layout, janela): mantém dentro dos limites.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const { s, x, y } = view.current;
      apply(s, x, y);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply]);

  const zoomed = scale > 1.01;
  return (
    <div
      ref={box}
      className="zoom-box"
      data-zoomed={zoomed || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div ref={layer} className="zoom-layer">
        {children}
      </div>
      <div className="zoom-controls" role="group" aria-label={`Zoom na ${name}`}>
        <button
          type="button"
          aria-label="Afastar"
          disabled={!zoomed}
          onClick={() => zoomAt(view.current.s / STEP, ...center(), true)}
        >
          <Icon name="remove" size="1rem" />
        </button>
        <button
          type="button"
          aria-label="Tamanho original"
          className="zoom-value tabular"
          onClick={() => apply(1, 0, 0, true)}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="Aproximar"
          disabled={scale >= MAX - 0.01}
          onClick={() => zoomAt(view.current.s * STEP, ...center(), true)}
        >
          <Icon name="add" size="1rem" />
        </button>
      </div>
    </div>
  );
}
