import { useEffect, useRef, useState } from 'react';
import { LiveLogo } from '../../shared/ui/LiveLogo';
import { motionOff } from './motion';

/** Quanto tempo a animação do controle leva antes de a TV ligar (apertar, infravermelho). */
const PRESS_MS = 720;

/**
 * Tela de carregamento: o cenário aparece, a barrinha enche e sobe uma mão com o controle
 * remoto. Apertar o botão de ligar (o botão de verdade é a tecla do controle) faz o polegar
 * descer, o controle mandar o infravermelho para a TV e a TV ligar; a tecla de mudo liga sem
 * música. O clique é o gesto que o navegador exige para tocar a música.
 */
export function Boot({ onStart }: { onStart: (sound: boolean) => void }) {
  const [ready, setReady] = useState(false);
  const [pressed, setPressed] = useState<'sound' | 'mute' | null>(null);
  const power = useRef<HTMLButtonElement>(null);
  // Foco na tecla de ligar quando o controle aparece, sem rolar a página até ela.
  useEffect(() => {
    if (ready) power.current?.focus({ preventScroll: true });
  }, [ready]);
  useEffect(() => {
    let alive = true;
    const min = new Promise((r) => window.setTimeout(r, motionOff() ? 0 : 1300));
    const fonts = document.fonts?.ready ?? Promise.resolve();
    void Promise.all([min, fonts]).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const press = (withSound: boolean) => {
    if (pressed) return;
    setPressed(withSound ? 'sound' : 'mute');
    window.setTimeout(() => onStart(withSound), motionOff() ? 0 : PRESS_MS);
  };

  return (
    <div
      className="boot"
      role="dialog"
      aria-modal="true"
      aria-label="Carregando o Screen"
      data-ready={ready || undefined}
      data-pressed={pressed ?? undefined}
    >
      <div className="boot-box">
        <div className="boot-logo">
          <LiveLogo className="h-full w-full" />
        </div>
        <p className="boot-name">screen</p>
        {!ready ? (
          <>
            <div className="boot-bar" role="progressbar" aria-label="Carregando">
              <span />
            </div>
            <p className="boot-hint">carregando</p>
          </>
        ) : (
          <p className="boot-hint">aperte o botão do controle para ligar a TV</p>
        )}
        {ready && (
          <button type="button" className="boot-mute" onClick={() => press(false)}>
            entrar sem som
          </button>
        )}
      </div>

      {/* A mão com o controle: sobe quando carregou; as duas teclas são botões de verdade. */}
      {ready && (
        <div className="remote-wrap">
          <span className="remote-ir" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div className="remote">
            {/* A mão: o braço vindo do canto e quatro dedos segurando a lateral do controle. */}
            <span className="remote-arm" aria-hidden="true" />
            <span className="remote-palm" aria-hidden="true" />
            <div className="remote-body">
              <span className="remote-led" aria-hidden="true" />
              <button
                type="button"
                ref={power}
                className="remote-power"
                aria-label="Ligar a TV (com som)"
                onClick={() => press(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v8" />
                  <path d="M7.5 6.2a7 7 0 1 0 9 0" />
                </svg>
              </button>
              <span className="remote-keys" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              <button
                type="button"
                className="remote-mute"
                aria-label="Ligar a TV sem som"
                onClick={() => press(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9z" />
                  <path d="M16 9l5 6M21 9l-5 6" />
                </svg>
              </button>
              <span className="remote-brand" aria-hidden="true">
                screen
              </span>
            </div>
            <span className="remote-grip" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            {/* O polegar, por cima do controle: desce até a tecla apertada. */}
            <svg className="remote-thumb" viewBox="0 0 60 90" aria-hidden="true">
              <path d="M10 88c-4-30 0-58 14-74 8-8 20-6 24 4 4 12-2 40-8 70z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
