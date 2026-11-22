import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AceleraMark } from '../components/AceleraMark';
import { Icon, type IconName } from '../components/Icon';
import { LiveLogo } from '../components/LiveLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { api } from '../lib/api';
import '../styles/landing.css';

/*
 * Página de apresentação do Screen (/sobre). O começo é uma TV: a própria TV é o bonequinho do
 * Screen, e na tela passa, em "canais", como se usa (entrar na call, o bot mandar o link, abrir a
 * sala, fixar e conversar). Tudo desenhado em CSS, sem vídeo. Os canais trocam sozinhos; dá para
 * escolher clicando nos passos. Com movimento reduzido, não troca sozinho e não anima.
 */

const SCENE_MS = 4600;

const STEPS: { title: string; text: string }[] = [
  { title: 'Entra na call', text: 'do jeito de sempre, no Discord' },
  { title: 'O bot manda o link', text: 'no chat da própria call' },
  { title: 'Abre e transmite', text: 'tela, câmera e voz, no navegador' },
  { title: 'Fixa e conversa', text: 'chat, enquete e quem importa em destaque' },
];

function motionOff(): boolean {
  if (typeof window === 'undefined') return true;
  if (document.documentElement.dataset.motion === 'off') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Aparece ao rolar (uma vez). Um observador só para a página inteira. */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      items.forEach((i) => i.setAttribute('data-shown', ''));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute('data-shown', '');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);
  return root;
}

/** Os canais da TV: qual está passando, e a troca automática (pausa com a aba escondida). */
function useChannels() {
  const [scene, setScene] = useState(0);
  const [auto, setAuto] = useState(() => !motionOff());
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setScene((s) => (s + 1) % STEPS.length);
    }, SCENE_MS);
    return () => window.clearInterval(id);
  }, [auto, scene]);
  return {
    scene,
    auto,
    pick: (i: number) => {
      setScene(i);
      setAuto(false);
    },
    resume: () => setAuto(!motionOff()),
  };
}

const people = ['Ana', 'Beto', 'Você'];

/** Canal 1: a call do Discord, com a galera entrando. */
function SceneCall() {
  return (
    <div className="tv-scene tv-discord">
      <aside className="tv-side">
        <p className="tv-side-title">CANAIS DE VOZ</p>
        <p className="tv-channel" data-on>
          <Icon name="volume_up" size="0.9rem" />
          call-geral
        </p>
        <ul className="tv-people">
          {people.map((p, i) => (
            <li key={p} style={{ '--d': `${0.3 + i * 0.6}s` } as CSSProperties}>
              <span className="tv-av" data-tone={i}>
                {p[0]}
              </span>
              {p}
            </li>
          ))}
        </ul>
        <p className="tv-channel">
          <Icon name="volume_up" size="0.9rem" />
          estudos
        </p>
      </aside>
      <div className="tv-empty">
        <Icon name="headphones" size="2rem" />
        <span>Conectado à voz</span>
      </div>
    </div>
  );
}

/** Canal 2: o bot posta o link e o cursor clica. */
function SceneBot() {
  return (
    <div className="tv-scene tv-chat-scene">
      <p className="tv-chat-head">
        <Icon name="chat" size="0.9rem" /> chat da call-geral
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
            <p className="tv-embed-text">3 pessoas na call · tela, câmera e voz</p>
            <span className="tv-embed-btn">
              Entrar na sala <Icon name="open_in_new" size="0.8rem" />
            </span>
          </div>
        </div>
      </div>
      <span className="tv-cursor" />
    </div>
  );
}

/** Canal 3: a sala aberta; a tela compartilhada entra. */
function SceneRoom() {
  return (
    <div className="tv-scene tv-room">
      <div className="tv-grid">
        <div className="tv-share">
          <div className="tv-code">
            <i style={{ width: '58%' }} />
            <i style={{ width: '36%', marginLeft: '10%' }} />
            <i style={{ width: '48%', marginLeft: '10%' }} />
            <i style={{ width: '24%' }} />
          </div>
          <span className="tv-label">
            <Icon name="screen_share" size="0.75rem" /> Tela da Ana
          </span>
        </div>
        {people.map((p, i) => (
          <div key={p} className="tv-tile" data-talk={i === 0 || undefined}>
            <span className="tv-av tv-av-lg" data-tone={i}>
              {p[0]}
            </span>
            <span className="tv-label">{p}</span>
          </div>
        ))}
      </div>
      <div className="tv-ctl">
        {(['mic', 'videocam', 'screen_share', 'chat'] as IconName[]).map((n) => (
          <span key={n} data-hot={n === 'screen_share' || undefined}>
            <Icon name={n} size="0.85rem" />
          </span>
        ))}
        <span className="tv-ctl-end">
          <Icon name="call_end" size="0.85rem" />
        </span>
      </div>
    </div>
  );
}

/** Canal 4: tela fixada em destaque, chat e enquete do lado. */
function ScenePin() {
  return (
    <div className="tv-scene tv-pin">
      <div className="tv-pin-main">
        <div className="tv-code tv-code-big">
          <i style={{ width: '62%' }} />
          <i style={{ width: '40%', marginLeft: '8%' }} />
          <i style={{ width: '52%', marginLeft: '8%' }} />
          <i style={{ width: '30%', marginLeft: '16%' }} />
          <i style={{ width: '44%', marginLeft: '8%' }} />
        </div>
        <span className="tv-label">
          <Icon name="keep" size="0.75rem" /> Fixado: tela da Ana
        </span>
      </div>
      <div className="tv-pin-chat">
        <p className="tv-msg" style={{ '--d': '0.2s' } as CSSProperties}>
          <b>beto</b> fixei aqui, tá nítido
        </p>
        <p className="tv-msg" style={{ '--d': '0.9s' } as CSSProperties}>
          <b>você</b> dá zoom no código?
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

const SCENES = [SceneCall, SceneBot, SceneRoom, ScenePin];

/** A TV: corpo na cor do tema, antenas, tela com os canais e os botões embaixo. */
function Tv() {
  const { scene, auto, pick, resume } = useChannels();
  const Scene = SCENES[scene]!;
  return (
    <div className="tv-wrap" data-reveal>
      <div className="tv" aria-hidden="true">
        <span className="tv-antenna tv-antenna-l" />
        <span className="tv-antenna tv-antenna-r" />
        <div className="tv-body">
          <div className="tv-screen">
            {/* key: cada canal remonta e as animações dele começam do zero. */}
            <div key={scene} className="tv-channel-in">
              <Scene />
            </div>
            <span className="tv-noise" key={`n${scene}`} />
            <span className="tv-glass" />
            <span className="tv-ch">CH {scene + 1}</span>
          </div>
          <div className="tv-panel">
            <span className="tv-brand">screen</span>
            <span className="tv-grille" />
            <span className="tv-knob" style={{ '--r': `${scene * 90}deg` } as CSSProperties} />
            <span className="tv-knob tv-knob-sm" />
          </div>
        </div>
        <span className="tv-foot tv-foot-l" />
        <span className="tv-foot tv-foot-r" />
      </div>

      <ol className="tv-steps" aria-label="Como usar o Screen">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              className="tv-step"
              aria-current={i === scene ? 'step' : undefined}
              onClick={() => pick(i)}
            >
              <span className="tv-step-n">{i + 1}</span>
              <span className="tv-step-copy">
                <span className="tv-step-title">{s.title}</span>
                <span className="tv-step-text">{s.text}</span>
              </span>
              {i === scene && auto && (
                <span className="tv-step-bar" style={{ animationDuration: `${SCENE_MS}ms` }} />
              )}
            </button>
          </li>
        ))}
      </ol>
      {!auto && !motionOff() && (
        <button type="button" className="tv-resume" onClick={resume}>
          <Icon name="play_arrow" size="1rem" /> Passar sozinho
        </button>
      )}
    </div>
  );
}

const WHY: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'videocam',
    title: 'Do Discord pro navegador',
    text: 'Entrou na call, o link chega. Sem instalar nada.',
  },
  {
    icon: 'lock',
    title: 'Só a comunidade entra',
    text: 'Login pelo Discord, conferido no servidor.',
  },
  {
    icon: 'bedtime',
    title: 'Leve de verdade',
    text: 'Sala cheia fica econômica sozinha. Ninguém transmitindo? Entra em espera.',
  },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'screen_share',
    title: 'Tela, câmera e voz',
    text: 'Junto ou separado, você liga o que quiser.',
  },
  { icon: 'keep', title: 'Fixa várias telas', text: 'Uma, duas ou três lado a lado, com zoom.' },
  { icon: 'stadium', title: 'Modo palco', text: 'Palestrante fala, plateia assiste e comenta.' },
  { icon: 'forum', title: 'Chat e enquete', text: 'Anti-spam e enquete no topo, estilo live.' },
  { icon: 'volume_up', title: 'Som do seu jeito', text: 'Volume de cada um e redução de ruído.' },
  {
    icon: 'shield_person',
    title: 'Moderação',
    text: 'Silenciar, palco, câmeras. Tudo registrado.',
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Precisa instalar alguma coisa?',
    a: 'Não. Abre no navegador do PC ou do celular. Se quiser, dá para instalar como app pelo próprio navegador.',
  },
  {
    q: 'Quem pode entrar?',
    a: 'Só quem está no servidor da Acelera DEV. Nas lives, também precisa estar na call de voz. Nas reuniões, basta estar no servidor.',
  },
  {
    q: 'Compartilhar tela funciona no celular?',
    a: 'O celular manda câmera e voz e assiste a tudo. Compartilhar a tela é pelo computador (limite do navegador do celular).',
  },
  {
    q: 'E a minha privacidade?',
    a: 'Login pelo Discord, sem senha nossa. Câmera, tela e microfone começam desligados.',
  },
];

export function LandingPage() {
  const root = useReveal();
  const { state } = useAuth();
  const logged = state.status === 'authenticated';
  const cta = logged ? (
    <Link to="/" className="lp-btn lp-btn-main">
      Ir para as salas
      <Icon name="arrow_forward" size="1.1rem" />
    </Link>
  ) : (
    <a href={api.loginUrl('/')} className="lp-btn lp-btn-main">
      Entrar com Discord
      <Icon name="arrow_forward" size="1.1rem" />
    </a>
  );

  return (
    <div ref={root} className="lp">
      <header className="lp-nav">
        <Link to="/sobre" className="lp-brand" aria-label="Screen — início">
          <LiveLogo className="h-7" />
          <span>screen</span>
        </Link>
        <nav aria-label="Seções" className="lp-nav-links">
          <a href="#como">Como usa</a>
          <a href="#recursos">Recursos</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <div className="lp-nav-end">
          <ThemeToggle />
          {logged ? (
            <Link to="/" className="lp-btn lp-btn-small">
              Salas
            </Link>
          ) : (
            <a href={api.loginUrl('/')} className="lp-btn lp-btn-small">
              Entrar
            </a>
          )}
        </div>
      </header>

      <main>
        <section id="como" className="lp-hero">
          <span className="lp-stars" aria-hidden="true" />
          <p className="lp-kicker" data-reveal>
            <span className="lp-dot" /> da comunidade Acelera DEV, pra comunidade
          </p>
          <h1 className="lp-title" data-reveal>
            Liga a call.
            <br />
            <span className="lp-grad">Mostra a tela.</span>
          </h1>
          <p className="lp-sub" data-reveal>
            O Screen transforma a call do Discord numa sala com tela, câmera e palco. Direto no
            navegador.
          </p>
          <div className="lp-ctas" data-reveal>
            {cta}
          </div>
          <Tv />
        </section>

        <section className="lp-section lp-why">
          <div data-reveal>
            <p className="lp-eyebrow">O que é</p>
            <h2 className="lp-h2">
              O Discord fala.
              <br />
              <span className="lp-muted">O Screen mostra.</span>
            </h2>
            <p className="lp-sub lp-sub-left">
              Call de voz é ótima pra trocar ideia. Pra mostrar código, dar aula ou fazer live,
              faltava a tela. O Screen abre uma sala ligada à call, com o mesmo pessoal, sem ninguém
              precisar instalar nada.
            </p>
          </div>
          <ul className="lp-rows">
            {WHY.map((w, i) => (
              <li
                key={w.title}
                className="lp-row"
                data-reveal
                style={{ '--delay': `${i * 80}ms` } as CSSProperties}
              >
                <span className="lp-row-icon">
                  <Icon name={w.icon} size="1.2rem" />
                </span>
                <span>
                  <strong>{w.title}</strong>
                  <span>{w.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="recursos" className="lp-section">
          <p className="lp-eyebrow lp-center" data-reveal>
            Recursos
          </p>
          <h2 className="lp-h2 lp-center" data-reveal>
            Tudo que a call precisa.
          </h2>
          <ul className="lp-features">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="lp-feature"
                data-reveal
                style={{ '--delay': `${(i % 3) * 70}ms` } as CSSProperties}
              >
                <span className="lp-feature-icon">
                  <Icon name={f.icon} size="1.3rem" />
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="duvidas" className="lp-section lp-faq">
          <h2 className="lp-h2 lp-center" data-reveal>
            Dúvidas rápidas
          </h2>
          <div className="lp-faq-list">
            {FAQ.map((f) => (
              <details key={f.q} className="lp-faq-item" data-reveal>
                <summary>
                  {f.q}
                  <Icon name="add" size="1.1rem" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-final" data-reveal>
          <div className="lp-final-pet">
            <LiveLogo className="h-full w-full" />
          </div>
          <h2 className="lp-h2">Bora pra call?</h2>
          <p className="lp-sub">Entra com o Discord e cola na próxima live da comunidade.</p>
          <div className="lp-ctas">{cta}</div>
        </section>
      </main>

      <footer className="lp-footer">
        <AceleraMark className="h-[14px] w-auto text-zinc-400" />
        <span>Screen · feito pela comunidade</span>
        <Link to="/features">Tutorial completo</Link>
      </footer>
    </div>
  );
}
