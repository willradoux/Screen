import { useId, useLayoutEffect, useRef, useState } from 'react';
import { animateSpring, prefersReducedMotion } from '../lib/motion';
import { AceleraMark } from './AceleraMark';
import { LOGO_H, LOGO_W } from './ScreenLogo';

/** Toca a cada carregamento da página (inclusive reload); trocar de tela dentro do app não. */
function shouldPlay(): boolean {
  return import.meta.env.MODE !== 'test' && !prefersReducedMotion();
}

/**
 * Abertura: sobre o fundo do tema, o logo do Screen (laranja/rosa, com o "|<" vazado) salta, pisca,
 * olha para os lados e pisca de novo; então o logo sai de cena e fica só o nome da Acelera DEV,
 * sem fundo nenhum. Depois tudo some e o app entra. A cada carregamento
 * da página, ~3,8 s; pula com clique ou tecla; não existe com movimento reduzido ou com as
 * animações desligadas. Decorativa.
 */
export function Intro() {
  const [playing, setPlaying] = useState(shouldPlay);
  const [leaving, setLeaving] = useState(false);
  const [mark, setMark] = useState(false);
  const id = useId().replace(/:/g, '');
  const popRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const eyeRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    if (!playing) return;
    const html = document.documentElement;
    const pop = popRef.current;
    const svg = svgRef.current;
    const glyph = glyphRef.current;
    const eye = eyeRef.current;
    if (!pop || !svg || !glyph || !eye) return;
    html.dataset.intro = 'play';

    const timers: number[] = [];
    const cancels: (() => void)[] = [];
    let done = false;
    const at = (s: number, fn: () => void) => timers.push(window.setTimeout(fn, s * 1000));

    const blink = () => {
      eye.style.transform = 'scaleY(0.1)';
      at(0.11, () => (eye.style.transform = 'scaleY(1)'));
    };
    const look = (x: number) => (glyph.style.transform = `translateX(${x}px)`);

    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      cancels.forEach((c) => c());
      setLeaving(true);
      html.dataset.intro = 'reveal';
      window.setTimeout(() => setPlaying(false), 420);
      window.setTimeout(() => {
        if (html.dataset.intro === 'reveal') delete html.dataset.intro;
      }, 1200);
    };

    // 1. O logo salta.
    cancels.push(
      animateSpring({
        from: 0,
        to: 1,
        freq: 14,
        damp: 0.55,
        delay: 0.1,
        onUpdate: (v) => {
          pop.style.transform = `scale(${Math.max(0, v)})`;
          pop.style.opacity = String(Math.min(1, v * 1.8));
        },
      }),
    );
    // 2. Pisca, olha para um lado e para o outro, pisca de novo.
    at(0.85, blink);
    at(1.25, () => look(-16));
    at(1.65, () => look(16));
    at(2.0, () => look(0));
    at(2.2, blink);
    // 3. O logo sai de cena e fica só o nome da Acelera DEV (sem fundo).
    at(2.55, () => (svg.dataset.gone = ''));
    at(2.75, () => setMark(true));
    at(3.85, finish);

    const skip = () => finish();
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      timers.forEach(clearTimeout);
      cancels.forEach((c) => c());
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [playing]);

  if (!playing) return null;
  const mask = `intro-glyph-${id}`;
  const fill = `intro-fill-${id}`;
  return (
    <div aria-hidden="true" className="intro-stage" data-leaving={leaving || undefined}>
      <div ref={popRef} className="intro-figure" style={{ transform: 'scale(0)', opacity: 0 }}>
        <svg ref={svgRef} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} className="intro-svg">
          <defs>
            {/* As cores do logo do Screen (laranja para rosa), visíveis no escuro e no claro. */}
            <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffb347" />
              <stop offset="1" stopColor="#ff4f93" />
            </linearGradient>
            <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO_W} height={LOGO_H}>
              <rect width={LOGO_W} height={LOGO_H} rx="62" fill="#fff" />
              <g ref={glyphRef} className="intro-glyph">
                <rect
                  ref={eyeRef}
                  className="intro-eye"
                  x="84"
                  y="74"
                  width="32"
                  height="90"
                  rx="16"
                  fill="#000"
                />
                <path
                  d="M208 97 175 123 208 149"
                  fill="none"
                  stroke="#000"
                  strokeWidth="32"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </mask>
          </defs>
          <rect
            width={LOGO_W}
            height={LOGO_H}
            rx="62"
            fill={`url(#${fill})`}
            mask={`url(#${mask})`}
          />
        </svg>
        <div className="intro-mark-acelera" data-show={mark || undefined}>
          {/* Só o nome: "ACELERA" no degradê da marca e "DEV" na cor do texto do modo. */}
          <AceleraMark className="h-[30px] w-auto max-w-full text-[var(--v3-text)]" title="" />
        </div>
      </div>
    </div>
  );
}
