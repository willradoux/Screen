import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const motionOff = () =>
  document.documentElement.dataset.motion === 'off' ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const GAP = 8;
const PAD = 8;
const RADIUS = 16;
const SPRING = 'cubic-bezier(0.34, 1.22, 0.5, 1)';

/**
 * Mini painel que sai do próprio botão (o mesmo efeito do cartão da conta e da barra da
 * chamada): nasce do tamanho do botão e cresce até completar a forma; as linhas sobem em
 * sequência. Não escurece a página e não fecha sozinho quando algo muda lá dentro (trocar o tema,
 * por exemplo): fecha no X, com Esc ou clicando fora. O foco volta para o botão.
 *
 * Fica acima do botão se ele estiver na metade de baixo da tela, senão abaixo; nunca sai da tela.
 */
export function Popover({
  anchor,
  title,
  onClose,
  children,
  width = 340,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const closing = useRef(false);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el) return;
    const w = Math.min(width, window.innerWidth - PAD * 2);
    const left = Math.max(PAD, Math.min(a.left, window.innerWidth - w - PAD));
    const below = a.top + a.height / 2 < window.innerHeight / 2;
    setPos(
      below ? { left, top: a.bottom + GAP } : { left, bottom: window.innerHeight - a.top + GAP },
    );
  }, [anchor, width]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  // Entrada: a forma começa do tamanho do botão e cresce até o painel inteiro.
  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchor.current?.getBoundingClientRect();
    if (!pos || !el || !a || motionOff() || typeof el.animate !== 'function') return;
    const p = el.getBoundingClientRect();
    const from = `inset(${Math.max(0, a.top - p.top)}px ${Math.max(0, p.right - a.right)}px ${Math.max(
      0,
      p.bottom - a.bottom,
    )}px ${Math.max(0, a.left - p.left)}px round ${RADIUS}px)`;
    el.animate(
      [
        { clipPath: from, opacity: 0.6 },
        { clipPath: `inset(0px round ${RADIUS}px)`, opacity: 1 },
      ],
      { duration: 520, easing: SPRING },
    );
    // Só na primeira vez que o painel tem posição.
  }, [pos === null]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const el = ref.current;
    const a = anchor.current?.getBoundingClientRect();
    if (!el || !a || motionOff() || typeof el.animate !== 'function') return onClose();
    const p = el.getBoundingClientRect();
    const to = `inset(${Math.max(0, a.top - p.top)}px ${Math.max(0, p.right - a.right)}px ${Math.max(
      0,
      p.bottom - a.bottom,
    )}px ${Math.max(0, a.left - p.left)}px round ${RADIUS}px)`;
    const anim = el.animate(
      [
        { clipPath: `inset(0px round ${RADIUS}px)`, opacity: 1 },
        { clipPath: to, opacity: 0 },
      ],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => onClose();
  }, [anchor, onClose]);

  useEffect(() => {
    const button = anchor.current;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || button?.contains(t)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', place);
      button?.focus?.({ preventScroll: true });
    };
  }, [anchor, close, place]);

  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={title}
      data-popover=""
      className="popover"
      style={{
        width: Math.min(width, typeof window === 'undefined' ? width : window.innerWidth - PAD * 2),
        left: pos?.left ?? 0,
        top: pos?.top,
        bottom: pos?.bottom,
        visibility: pos ? undefined : 'hidden',
      }}
    >
      <div className="popover-head">
        <h2>{title}</h2>
        <button type="button" onClick={close} aria-label="Fechar" className="icon-button">
          <Icon name="close" />
        </button>
      </div>
      <div className="popover-body">{children}</div>
    </div>,
    document.body,
  );
}
