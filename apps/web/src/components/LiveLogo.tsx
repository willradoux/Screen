import { useEffect, useId, useRef } from 'react';
import { LOGO_H, LOGO_W } from './ScreenLogo';

/*
 * Ícone do topo vivo: o bonequinho do Screen com dois olhos "| |". A piscadinha é o olho da
 * direita dobrando e virando o "<" (o "|<" do logo) e voltando. Os olhos acompanham o mouse; sem
 * mouse (celular), de vez em quando ele olha para um lado. Cores do tema (--logo-1/--logo-2).
 *
 * Leve: um listener passivo de pointermove e um requestAnimationFrame que só roda enquanto os
 * olhos estão indo para algum lugar ou piscando (parado, não gasta nada). Com animações
 * desligadas ou movimento reduzido, fica parado com os olhos normais.
 */

/** Olho direito: três pontos, de "|" (aberto) a "<" (piscando). */
const OPEN = [
  [202, 90],
  [202, 119],
  [202, 148],
] as const;
const WINK = [
  [208, 97],
  [175, 123],
  [208, 149],
] as const;

export function eyePath(t: number): string {
  const p = OPEN.map(([x, y], i) => {
    const [wx, wy] = WINK[i]!;
    return `${(x + (wx - x) * t).toFixed(1)} ${(y + (wy - y) * t).toFixed(1)}`;
  });
  return `M${p[0]} L${p[1]} L${p[2]}`;
}

/** O olho esquerdo, sempre "|". */
export const LEFT_EYE = 'M100 90 L100 148';

/**
 * A piscadinha: o olho direito dobra em "<" e volta (~0,4 s), mexendo no `d` do caminho.
 * Devolve uma função que cancela.
 */
export function wink(right: SVGPathElement, ms = 380): () => void {
  const start = performance.now();
  let raf = 0;
  const ease = (v: number) => 1 - (1 - v) * (1 - v);
  const frame = (now: number) => {
    const p = (now - start) / ms;
    const t = p < 0.3 ? ease(p / 0.3) : p < 0.62 ? 1 : p < 1 ? 1 - ease((p - 0.62) / 0.38) : 0;
    right.setAttribute('d', eyePath(t));
    if (p < 1) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    right.setAttribute('d', eyePath(0));
  };
}

/** Quanto os olhos andam (em unidades do desenho, que tem 302 × 238). */
const REACH_X = 16;
const REACH_Y = 11;

function motionOff(): boolean {
  if (document.documentElement.dataset.motion === 'off') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function LiveLogo({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const rightRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const svg = svgRef.current;
    const eyes = eyesRef.current;
    const right = rightRef.current;
    if (!svg || !eyes || !right) return;

    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let lastMove = 0;
    let blinkTimer = 0;
    let glanceTimer = 0;

    const step = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      if (Math.abs(tx - x) < 0.05 && Math.abs(ty - y) < 0.05) {
        x = tx;
        y = ty;
        raf = 0;
      } else {
        raf = requestAnimationFrame(step);
      }
      eyes.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    };
    const lookAt = (nx: number, ny: number) => {
      tx = nx;
      ty = ny;
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || motionOff()) return;
      const r = svg.getBoundingClientRect();
      if (r.width === 0) return; // o ícone escondido (topo do celular no computador)
      lastMove = performance.now();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      // Perto do ícone o olhar é suave; a partir de ~280 px já vai até o canto do olho.
      const k = Math.min(1, dist / 280);
      lookAt((dx / dist) * REACH_X * k, (dy / dist) * REACH_Y * k);
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) lookAt(0, 0);
    };

    const schedule = () => {
      blinkTimer = window.setTimeout(
        () => {
          if (!document.hidden && !motionOff()) {
            wink(right);
            // Sem mouse por um tempo (ou no celular): às vezes olha para um lado e volta.
            if (performance.now() - lastMove > 4000 && Math.random() < 0.5) {
              const side = Math.random() < 0.5 ? -1 : 1;
              glanceTimer = window.setTimeout(() => {
                lookAt(side * REACH_X, (Math.random() - 0.5) * REACH_Y);
                glanceTimer = window.setTimeout(() => lookAt(0, 0), 1100);
              }, 600);
            }
          }
          schedule();
        },
        2600 + Math.random() * 3400,
      );
    };
    schedule();

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseout', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(blinkTimer);
      window.clearTimeout(glanceTimer);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseout', onLeave);
    };
  }, []);

  const mask = `live-logo-mask-${id}`;
  const fill = `live-logo-fill-${id}`;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${LOGO_W} ${LOGO_H}`}
      aria-hidden="true"
      className={`screen-logo live-logo ${className}`}
    >
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-1, #ffb347)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-2, #ff4f93)' }} />
        </linearGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO_W} height={LOGO_H}>
          <rect width={LOGO_W} height={LOGO_H} rx="62" fill="#fff" />
          <g
            ref={eyesRef}
            fill="none"
            stroke="#000"
            strokeWidth="32"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={LEFT_EYE} />
            <path ref={rightRef} d={eyePath(0)} />
          </g>
        </mask>
      </defs>
      <rect width={LOGO_W} height={LOGO_H} rx="62" fill={`url(#${fill})`} mask={`url(#${mask})`} />
    </svg>
  );
}
