import type { CSSProperties } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { LiveLogo } from '../../components/LiveLogo';

/*
 * As cenas do "como usa" que passam na TV: tudo desenhado (sem vídeo), com a galera da
 * comunidade nos papéis.
 */

/** A galera da comunidade, na demonstração. */
const crew = ['pc', 'marujo', 'scharp', 'flazo', 'will', 'luan'];
/** Quem aparece com câmera na sala de exemplo. */
const onCam = ['flazo', 'marujo', 'will'];

export function SceneCall() {
  return (
    <div className="tv-scene tv-discord" aria-hidden="true">
      <aside className="tv-side">
        <p className="tv-side-title">CANAIS DE VOZ</p>
        <p className="tv-channel" data-on>
          <Icon name="volume_up" size="1em" />
          call-geral
        </p>
        <ul className="tv-people">
          {crew.map((p, i) => (
            <li key={p} style={{ '--d': `${0.2 + i * 0.35}s` } as CSSProperties}>
              <span className="tv-av" data-tone={i % 3}>
                {p[0]!.toUpperCase()}
              </span>
              {p}
            </li>
          ))}
        </ul>
        <p className="tv-channel">
          <Icon name="volume_up" size="1em" />
          estudos
        </p>
      </aside>
      <div className="tv-empty">
        <Icon name="headphones" size="2.4em" />
        <span>Conectado à voz</span>
      </div>
    </div>
  );
}

export function SceneBot() {
  return (
    <div className="tv-scene tv-chat-scene" aria-hidden="true">
      <p className="tv-chat-head">
        <Icon name="chat" size="1em" /> chat da call-geral
      </p>
      <div className="tv-post">
        <span className="tv-bot">
          <LiveLogo className="h-full w-full" />
        </span>
        <div className="tv-post-body">
          <p className="tv-post-name">
            Screen <span>APP</span>
          </p>
          <div className="tv-embed">
            <p className="tv-embed-title">Live aberta em call-geral</p>
            <p className="tv-embed-text">6 pessoas na call · tela, câmera e voz</p>
            <span className="tv-embed-btn">
              Entrar na sala <Icon name="open_in_new" size="0.9em" />
            </span>
          </div>
        </div>
      </div>
      <span className="tv-cursor" />
    </div>
  );
}

export function SceneRoom() {
  return (
    <div className="tv-scene tv-room" aria-hidden="true">
      <div className="tv-grid">
        <div className="tv-share">
          <div className="tv-code">
            <i style={{ width: '58%' }} />
            <i style={{ width: '36%', marginLeft: '10%' }} />
            <i style={{ width: '48%', marginLeft: '10%' }} />
            <i style={{ width: '24%' }} />
          </div>
          <span className="tv-label">
            <Icon name="screen_share" size="0.9em" /> Tela do pc
          </span>
        </div>
        {onCam.map((p, i) => (
          <div key={p} className="tv-tile" data-talk={i === 0 || undefined}>
            <span className="tv-av tv-av-lg" data-tone={i}>
              {p[0]!.toUpperCase()}
            </span>
            <span className="tv-label">{p}</span>
          </div>
        ))}
      </div>
      <div className="tv-ctl">
        {(['mic', 'videocam', 'screen_share', 'chat'] as IconName[]).map((n) => (
          <span key={n} data-hot={n === 'screen_share' || undefined}>
            <Icon name={n} size="1em" />
          </span>
        ))}
        <span className="tv-ctl-end">
          <Icon name="call_end" size="1em" />
        </span>
      </div>
    </div>
  );
}

export function ScenePin() {
  return (
    <div className="tv-scene tv-pin" aria-hidden="true">
      <div className="tv-pin-main">
        <div className="tv-code tv-code-big">
          <i style={{ width: '62%' }} />
          <i style={{ width: '40%', marginLeft: '8%' }} />
          <i style={{ width: '52%', marginLeft: '8%' }} />
          <i style={{ width: '30%', marginLeft: '16%' }} />
          <i style={{ width: '44%', marginLeft: '8%' }} />
        </div>
        <span className="tv-label">
          <Icon name="keep" size="0.9em" /> Fixado: tela do pc
        </span>
      </div>
      <div className="tv-pin-chat">
        <p className="tv-msg" style={{ '--d': '0.2s' } as CSSProperties}>
          <b>marujo</b> fixei aqui, tá nítido
        </p>
        <p className="tv-msg" style={{ '--d': '0.9s' } as CSSProperties}>
          <b>scharp</b> dá zoom no código?
        </p>
        <div className="tv-poll" style={{ '--d': '1.6s' } as CSSProperties}>
          <b>Próximo tema?</b>
          <span>
            React <i style={{ '--w': '70%' } as CSSProperties} />
          </span>
          <span>
            Node <i style={{ '--w': '30%' } as CSSProperties} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Tarja de baixo nos canais do "como usa", como legenda de programa. */
export function Caption({ title, text }: { title: string; text: string }) {
  return (
    <div className="tv-caption">
      <span>
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </div>
  );
}
