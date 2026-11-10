import { useId, useLayoutEffect, useRef, useState } from 'react';
import { animateSpring, prefersReducedMotion } from '../lib/motion';
import { AceleraMark } from './AceleraMark';
import { LOGO_H, LOGO_W } from './ScreenLogo';

/** Toca a cada carregamento da página (inclusive reload); trocar de tela dentro do app não. */
function shouldPlay(): boolean {
  return import.meta.env.MODE !== 'test' && !prefersReducedMotion();
}

/** Quanto o retângulo do logo cresce para os lados ao virar a cápsula. */
const GROW = 230;
const VIEW_X = -GROW;
const VIEW_W = LOGO_W + GROW * 2;
const CAPSULE_R = LOGO_H / 2;

/**
 * Abertura: sobre o fundo do tema, o logo do Screen (preto, com o "|<" vazado) salta, pisca,
 * olha para os lados e pisca de novo; então o retângulo se estica e vira uma cápsula, o "|<"
 * some e o logo da Acelera DEV aparece dentro dela. Depois tudo some e o app entra. A cada carregamento
 * da página, ~3,8 s; pula com clique ou tecla; não existe com movimento reduzido ou com as
 * animações desligadas. Decorativa.
 */
export function Intro() {
  const [playing, setPlaying] = useState(shouldPlay);
  const [leaving, setLeaving] = useState(false);
  const [mark, setMark] = useState(false);
  const id = useId().replace(/:/g, '');
  const popRef = useRef<HTMLDivElement>(null);
  const shapeRef = useRef<SVGRectElement>(null);
  const maskRectRef = useRef<SVGRectElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const eyeRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    if (!playing) return;
    const html = document.documentElement;
    const pop = popRef.current;
    const shape = shapeRef.current;
    const maskRect = maskRectRef.current;
    const glyph = glyphRef.current;
    const eye = eyeRef.current;
    if (!pop || !shape || !maskRect || !glyph || !eye) return;
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
    /** O retângulo do logo, de 0 (logo) a 1 (cápsula). */
    const morph = (p: number) => {
      const x = -GROW * p;
      const w = LOGO_W + GROW * 2 * p;
      const r = 62 + (CAPSULE_R - 62) * Math.min(1, Math.max(0, p));
      for (const el of [shape, maskRect]) {
        el.setAttribute('x', String(x));
        el.setAttribute('width', String(Math.max(1, w)));
        el.setAttribute('rx', String(r));
      }
      glyph.style.opacity = String(Math.max(0, 1 - p * 2.5));
    };

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
    // 3. Vira a cápsula e aparece a Acelera DEV.
    at(2.55, () =>
      cancels.push(animateSpring({ from: 0, to: 1, freq: 9, damp: 0.78, onUpdate: morph })),
    );
    at(2.85, () => setMark(true));
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
  return (
    <div aria-hidden="true" className="intro-stage" data-leaving={leaving || undefined}>
      <div ref={popRef} className="intro-figure" style={{ transform: 'scale(0)', opacity: 0 }}>
        <svg viewBox={`${VIEW_X} 0 ${VIEW_W} ${LOGO_H}`} className="intro-svg">
          <defs>
            <mask
              id={mask}
              maskUnits="userSpaceOnUse"
              x={VIEW_X}
              y="0"
              width={VIEW_W}
              height={LOGO_H}
            >
              <rect ref={maskRectRef} width={LOGO_W} height={LOGO_H} rx="62" fill="#fff" />
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
            ref={shapeRef}
            width={LOGO_W}
            height={LOGO_H}
            rx="62"
            fill="#0a0a0a"
            mask={`url(#${mask})`}
          />
        </svg>
        <div className="intro-mark-acelera" data-show={mark || undefined}>
          <AceleraMark className="h-[24px] w-auto text-white" title="" />
        </div>
      </div>
    </div>
  );
}
