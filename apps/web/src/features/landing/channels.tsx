import type { CSSProperties } from 'react';
import { AppLink } from './AppLink';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { LiveLogo } from '../../shared/ui/LiveLogo';
import { api } from '../../shared/lib/api';
import { SceneBot, SceneCall, ScenePin, SceneRoom } from './scenes';
import { HOME } from '../../shared/lib/paths';

/* Os canais da TV: abertura, recursos, dúvidas e a chamada final (os do "como usa" vêm das cenas). */

function Cta({ logged }: { logged: boolean }) {
  return logged ? (
    <AppLink to={HOME} className="lp-btn lp-btn-main">
      Ir para as salas <Icon name="arrow_forward" size="1.1em" />
    </AppLink>
  ) : (
    <a href={api.loginUrl(HOME)} className="lp-btn lp-btn-main">
      Entrar com Discord <Icon name="arrow_forward" size="1.1em" />
    </a>
  );
}

export function ChannelIntro({ logged, onNext }: { logged: boolean; onNext: () => void }) {
  return (
    <div className="tv-scene tv-page tv-intro">
      <div className="tv-intro-pet">
        <LiveLogo className="h-full w-full" />
      </div>
      <h1 className="tv-title">
        Liga a call.
        <br />
        <span className="tv-accent">Mostra a tela.</span>
      </h1>
      <p className="tv-text">
        O Screen transforma a call do Discord numa sala com tela, câmera e palco. Direto no
        navegador.
      </p>
      <div className="tv-actions">
        <Cta logged={logged} />
        <button type="button" className="lp-btn lp-btn-ghost" onClick={onNext}>
          Ver como usa <Icon name="keyboard_arrow_down" size="1.1em" />
        </button>
      </div>
    </div>
  );
}

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'screen_share', title: 'Tela, câmera e voz', text: 'Junto ou separado.' },
  { icon: 'keep', title: 'Fixa várias telas', text: 'Lado a lado, com zoom.' },
  { icon: 'stadium', title: 'Modo palco', text: 'Palestrante fala, plateia assiste.' },
  { icon: 'forum', title: 'Chat e enquete', text: 'Anti-spam e enquete no topo.' },
  { icon: 'volume_up', title: 'Som do seu jeito', text: 'Volume de cada um e menos ruído.' },
  { icon: 'shield_person', title: 'Moderação', text: 'Palco, silenciar, câmeras.' },
];

export function ChannelFeatures() {
  return (
    <div className="tv-scene tv-page">
      <h2 className="tv-h2">Tudo que a call precisa.</h2>
      <ul className="tv-features">
        {FEATURES.map((f, i) => (
          <li key={f.title} style={{ '--d': `${0.1 + i * 0.07}s` } as CSSProperties}>
            <span className="tv-feature-icon">
              <Icon name={f.icon} size="1.2em" />
            </span>
            <strong>{f.title}</strong>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Precisa instalar alguma coisa?',
    a: 'Não. Abre no navegador do PC ou do celular. Se quiser, dá pra instalar como app.',
  },
  {
    q: 'Quem pode entrar?',
    a: 'Só quem está no servidor da Acelera DEV. Nas lives, também precisa estar na call de voz.',
  },
  {
    q: 'Compartilhar tela funciona no celular?',
    a: 'O celular manda câmera e voz e assiste a tudo. Compartilhar a tela é pelo computador.',
  },
  {
    q: 'E a minha privacidade?',
    a: 'Login pelo Discord, sem senha nossa. Câmera, tela e microfone começam desligados.',
  },
];

export function ChannelFaq() {
  return (
    <div className="tv-scene tv-page tv-scroll">
      <h2 className="tv-h2">Dúvidas rápidas</h2>
      <div className="tv-faq">
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>
              {f.q}
              <Icon name="add" size="1.1em" />
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

export function ChannelEnd({ logged }: { logged: boolean }) {
  return (
    <div className="tv-scene tv-page tv-intro">
      <div className="tv-intro-pet">
        <LiveLogo className="h-full w-full" />
      </div>
      <h2 className="tv-title">Bora pra call?</h2>
      <p className="tv-text">Entra com o Discord e cola na próxima live da comunidade.</p>
      <div className="tv-actions">
        <Cta logged={logged} />
        <AppLink to="/features" className="lp-btn lp-btn-ghost">
          Tutorial completo
        </AppLink>
      </div>
    </div>
  );
}

export const CHANNELS: { name: string; caption?: string; Scene?: () => React.JSX.Element }[] = [
  { name: 'Início' },
  { name: 'Entra na call', caption: 'do jeito de sempre, no Discord', Scene: SceneCall },
  { name: 'O bot manda o link', caption: 'no chat da própria call', Scene: SceneBot },
  { name: 'Abre e transmite', caption: 'tela, câmera e voz, no navegador', Scene: SceneRoom },
  { name: 'Fixa e conversa', caption: 'chat, enquete e quem importa em destaque', Scene: ScenePin },
  { name: 'Recursos' },
  { name: 'Dúvidas' },
  { name: 'Bora pra call' },
];
