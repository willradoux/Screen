import { useEffect, useRef, useState, type CSSProperties } from 'react';

/* Peças da TV: o texto por cima da imagem (OSD) e a rodinha de canais. */

/** Hora no canto da tela, como nas TVs (atualiza a cada 20 s). */
function useClock() {
  const fmt = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const id = window.setInterval(() => setNow(fmt()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * O que a TV escreve por cima da imagem (OSD): "ao vivo" e a hora em cima; embaixo, o volume
 * em barrinhas por um instante quando a pessoa mexe no som.
 */
export function Osd({ on, volume, flash }: { on: boolean; volume: number; flash: number }) {
  const clock = useClock();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!flash) return;
    setShow(true);
    const id = window.setTimeout(() => setShow(false), 2500);
    return () => window.clearTimeout(id);
  }, [flash]);
  return (
    <div className="tv-osd" aria-hidden="true">
      <span className="osd-top">
        <span className="osd-live">AO VIVO</span>
        <span>{clock}</span>
      </span>
      {show && (
        <span className="osd-vol" key={flash}>
          {on ? (
            <>
              <span>VOLUME</span>
              <span className="osd-bars">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} data-on={i < volume || undefined} />
                ))}
              </span>
              <span>{String(volume).padStart(2, '0')}</span>
            </>
          ) : (
            <span>SEM SOM</span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * A rodinha da TV: gira arrastando (ou com a rodinha do mouse / setas) e cada "clique" é um
 * canal, como o seletor das TVs antigas. 8 canais = 45° cada.
 */
export function Knob({
  ch,
  count,
  onPick,
}: {
  ch: number;
  count: number;
  onPick: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const step = 360 / count;
  const drag = useRef(false);

  const pickFromPointer = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const i = Math.round(((a + 360) % 360) / step) % count;
    if (i !== ch) onPick(i);
  };

  return (
    <div
      ref={ref}
      className="tv-knob"
      role="slider"
      tabIndex={0}
      aria-label="Seletor de canal"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={ch + 1}
      aria-valuetext={`Canal ${ch + 1}`}
      style={{ '--r': `${ch * step}deg` } as CSSProperties}
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        pickFromPointer(e);
      }}
      onPointerMove={(e) => {
        if (drag.current) pickFromPointer(e);
      }}
      onPointerUp={() => {
        drag.current = false;
      }}
      onPointerCancel={() => {
        drag.current = false;
      }}
      onWheel={(e) => {
        e.stopPropagation();
        if (Math.abs(e.deltaY) > 4) onPick(ch + (e.deltaY > 0 ? 1 : -1));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onPick(ch + 1);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onPick(ch - 1);
        else return;
        e.preventDefault();
      }}
    >
      <span className="tv-knob-cap" />
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className="tv-knob-tick"
          style={{ '--a': `${i * step}deg` } as CSSProperties}
          data-on={i === ch || undefined}
        />
      ))}
    </div>
  );
}
