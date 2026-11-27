import { useEffect, useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { LiveLogo } from '../../shared/ui/LiveLogo';
import { motionOff } from './motion';

/**
 * Tela de carregamento: o cenário aparece, a barrinha enche e a pessoa liga a TV (com ou sem
 * som). O clique é o gesto que o navegador exige para tocar a música.
 */
export function Boot({ onStart }: { onStart: (sound: boolean) => void }) {
  const [ready, setReady] = useState(false);
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
  return (
    <div className="boot" role="dialog" aria-modal="true" aria-label="Carregando o Screen">
      <div className="boot-box">
        <div className="boot-logo">
          <LiveLogo className="h-full w-full" />
        </div>
        <p className="boot-name">screen</p>
        {!ready ? (
          <div className="boot-bar" role="progressbar" aria-label="Carregando">
            <span />
          </div>
        ) : (
          <div className="boot-actions">
            <button
              type="button"
              className="lp-btn lp-btn-main"
              autoFocus
              onClick={() => onStart(true)}
            >
              <Icon name="play_arrow" size="1.2em" /> Ligar a TV
            </button>
            <button type="button" className="boot-mute" onClick={() => onStart(false)}>
              entrar sem som
            </button>
          </div>
        )}
        <p className="boot-hint">{ready ? 'com música, de preferência' : 'carregando'}</p>
      </div>
    </div>
  );
}
