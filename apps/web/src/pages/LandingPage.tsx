import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AceleraMark } from '../components/AceleraMark';
import { Icon, type IconName } from '../components/Icon';
import { LiveLogo } from '../components/LiveLogo';
import { api } from '../lib/api';
import '../styles/landing.css';

/*
 * Página de apresentação do Screen (/sobre). A página é uma TV numa paisagem: cada canal é uma
 * parte (abertura, como usa, recursos, dúvidas, chamada final). Troca pelos botões da TV, pelas
 * setas do teclado, pela rodinha do mouse ou arrastando no celular. No começo os canais passam
 * sozinhos; depois que a pessoa mexe, só trocam quando ela quer. Tudo desenhado em CSS/SVG, sem
 * vídeo. Com movimento reduzido, nada passa sozinho e nada anima.
 */

const AUTO_MS = 5200;

function motionOff(): boolean {
  if (typeof window === 'undefined') return true;
  if (document.documentElement.dataset.motion === 'off') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const people = ['Ana', 'Beto', 'Você'];

/* ── Cenas do "como usa" ─────────────────────────────────────────────────────────────── */

function SceneCall() {
  return (
    <div className="tv-scene tv-discord" aria-hidden="true">
      <aside className="tv-side">
        <p className="tv-side-title">CANAIS DE VOZ</p>
        <p className="tv-channel" data-on>
          <Icon name="volume_up" size="1em" />
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

function SceneBot() {
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
            <p className="tv-embed-text">3 pessoas na call · tela, câmera e voz</p>
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

function SceneRoom() {
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
            <Icon name="screen_share" size="0.9em" /> Tela da Ana
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

function ScenePin() {
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
          <Icon name="keep" size="0.9em" /> Fixado: tela da Ana
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

/** Tarja de baixo nos canais do "como usa", como legenda de programa. */
function Caption({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="tv-caption">
      <span className="tv-caption-n">{n}/4</span>
      <span>
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </div>
  );
}

/* ── Canais com texto ────────────────────────────────────────────────────────────────── */

function Cta({ logged }: { logged: boolean }) {
  return logged ? (
    <Link to="/" className="lp-btn lp-btn-main">
      Ir para as salas <Icon name="arrow_forward" size="1.1em" />
    </Link>
  ) : (
    <a href={api.loginUrl('/')} className="lp-btn lp-btn-main">
      Entrar com Discord <Icon name="arrow_forward" size="1.1em" />
    </a>
  );
}

function ChannelIntro({ logged, onNext }: { logged: boolean; onNext: () => void }) {
  return (
    <div className="tv-scene tv-page tv-intro">
      <div className="tv-intro-pet">
        <LiveLogo className="h-full w-full" />
      </div>
      <p className="tv-kicker">
        <span className="lp-dot" /> da comunidade Acelera DEV
      </p>
      <h1 className="tv-title">
        Liga a call.
        <br />
        <span className="lp-grad">Mostra a tela.</span>
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

function ChannelFeatures() {
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

function ChannelFaq() {
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

function ChannelEnd({ logged }: { logged: boolean }) {
  return (
    <div className="tv-scene tv-page tv-intro">
      <div className="tv-intro-pet">
        <LiveLogo className="h-full w-full" />
      </div>
      <h2 className="tv-title">Bora pra call?</h2>
      <p className="tv-text">Entra com o Discord e cola na próxima live da comunidade.</p>
      <div className="tv-actions">
        <Cta logged={logged} />
        <Link to="/features" className="lp-btn lp-btn-ghost">
          Tutorial completo
        </Link>
      </div>
    </div>
  );
}

/* ── Paisagem ────────────────────────────────────────────────────────────────────────── */

/** Pôr do sol retrô na cor do tema, montanhas em camadas e nuvens. Camadas mexem com o mouse. */
function Landscape() {
  return (
    <div className="ls" aria-hidden="true">
      <span className="ls-stars" />
      <span className="ls-sun" />
      <span className="ls-cloud ls-cloud-1" />
      <span className="ls-cloud ls-cloud-2" />
      <span className="ls-cloud ls-cloud-3" />
      <svg className="ls-layer ls-far" viewBox="0 0 1600 400" preserveAspectRatio="none">
        <path d="M0 400V250l120-70 90 40 140-110 120 90 80-40 160 120 130-150 150 110 110-60 150 100 120-80 130 70v130z" />
      </svg>
      <svg className="ls-layer ls-mid" viewBox="0 0 1600 400" preserveAspectRatio="none">
        <path d="M0 400V300l160-80 140 60 170-120 160 110 120-50 200 100 150-90 170 80 140-60 190 90v160z" />
      </svg>
      <svg className="ls-layer ls-near" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <path d="M0 300V190c180-70 360-80 560-30s360 60 520 10 360-70 520-20v150z" />
      </svg>
      <span className="ls-ground" />
    </div>
  );
}

/* ── A página ────────────────────────────────────────────────────────────────────────── */

const CHANNELS: { name: string; caption?: string; Scene?: () => React.JSX.Element }[] = [
  { name: 'Início' },
  { name: 'Entra na call', caption: 'do jeito de sempre, no Discord', Scene: SceneCall },
  { name: 'O bot manda o link', caption: 'no chat da própria call', Scene: SceneBot },
  { name: 'Abre e transmite', caption: 'tela, câmera e voz, no navegador', Scene: SceneRoom },
  { name: 'Fixa e conversa', caption: 'chat, enquete e quem importa em destaque', Scene: ScenePin },
  { name: 'Recursos' },
  { name: 'Dúvidas' },
  { name: 'Bora pra call' },
];

export function LandingPage() {
  const { state } = useAuth();
  const logged = state.status === 'authenticated';
  const [ch, setCh] = useState(0);
  const [auto, setAuto] = useState(() => !motionOff());
  const root = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);
  const touchY = useRef<number | null>(null);
  const count = CHANNELS.length;

  const go = useCallback(
    (next: number, byUser = true) => {
      setCh(((next % count) + count) % count);
      if (byUser) setAuto(false);
    },
    [count],
  );

  // Passa sozinho no começo (sem dar a volta), até a pessoa mexer.
  useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(() => {
      if (document.hidden) return;
      if (ch >= count - 1) setAuto(false);
      else go(ch + 1, false);
    }, AUTO_MS);
    return () => window.clearTimeout(id);
  }, [auto, ch, count, go]);

  // Setas do teclado trocam o canal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') go(ch + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') go(ch - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ch, go]);

  // Paralaxe da paisagem com o mouse (só mexe em duas variáveis CSS).
  useEffect(() => {
    const el = root.current;
    if (!el || motionOff()) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty('--px', (e.clientX / window.innerWidth - 0.5).toFixed(3));
        el.style.setProperty('--py', (e.clientY / window.innerHeight - 0.5).toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  /** Rodinha: um canal por gesto (ignora enquanto rola uma lista de dentro da TV). */
  const onWheel = (e: React.WheelEvent) => {
    const scroller = (e.target as HTMLElement).closest('.tv-scroll');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 2) return;
    if (Math.abs(e.deltaY) < 12) return;
    const t = performance.now();
    if (t - lastWheel.current < 650) return;
    lastWheel.current = t;
    go(ch + (e.deltaY > 0 ? 1 : -1));
  };

  const current = CHANNELS[ch]!;
  const Scene = current.Scene;

  return (
    <div
      ref={root}
      className="lp"
      onWheel={onWheel}
      onTouchStart={(e) => (touchY.current = e.touches[0]?.clientY ?? null)}
      onTouchEnd={(e) => {
        const start = touchY.current;
        touchY.current = null;
        const end = e.changedTouches[0]?.clientY;
        if (start == null || end == null) return;
        if ((e.target as HTMLElement).closest('.tv-scroll')) return;
        if (Math.abs(end - start) > 50) go(ch + (end < start ? 1 : -1));
      }}
    >
      <Landscape />

      <header className="lp-nav">
        <button
          type="button"
          className="lp-brand"
          onClick={() => go(0)}
          aria-label="Screen — início"
        >
          <LiveLogo className="h-7" />
          <span>screen</span>
        </button>
        <div className="lp-nav-end">
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

      <main className="lp-stage">
        <div className="tv">
          <span className="tv-antenna tv-antenna-l" aria-hidden="true" />
          <span className="tv-antenna tv-antenna-r" aria-hidden="true" />
          <div className="tv-body">
            <section className="tv-screen" aria-label={`Canal ${ch + 1}: ${current.name}`}>
              <div key={ch} className="tv-channel-in">
                {ch === 0 && <ChannelIntro logged={logged} onNext={() => go(1)} />}
                {Scene && (
                  <>
                    <div className="tv-demo">
                      <Scene />
                    </div>
                    <Caption n={ch} title={current.name} text={current.caption ?? ''} />
                  </>
                )}
                {ch === 5 && <ChannelFeatures />}
                {ch === 6 && <ChannelFaq />}
                {ch === 7 && <ChannelEnd logged={logged} />}
              </div>
              <span className="tv-noise" key={`n${ch}`} aria-hidden="true" />
              <span className="tv-glass" aria-hidden="true" />
              <span className="tv-ch" key={`c${ch}`} aria-hidden="true">
                CH {String(ch + 1).padStart(2, '0')}
              </span>
            </section>
            <div className="tv-panel">
              <span className="tv-brand" aria-hidden="true">
                screen
              </span>
              <span className="tv-grille" aria-hidden="true" />
              <span
                className="tv-knob"
                aria-hidden="true"
                style={{ '--r': `${ch * 45}deg` } as CSSProperties}
              />
              <div className="tv-chbtns">
                <button type="button" aria-label="Canal anterior" onClick={() => go(ch - 1)}>
                  <Icon name="keyboard_arrow_up" size="1.2rem" />
                </button>
                <button type="button" aria-label="Próximo canal" onClick={() => go(ch + 1)}>
                  <Icon name="keyboard_arrow_down" size="1.2rem" />
                </button>
              </div>
            </div>
          </div>
          <span className="tv-foot tv-foot-l" aria-hidden="true" />
          <span className="tv-foot tv-foot-r" aria-hidden="true" />
          <span className="tv-shadow" aria-hidden="true" />
        </div>

        <nav className="tv-guide" aria-label="Canais">
          {CHANNELS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              aria-current={i === ch ? 'true' : undefined}
              aria-label={`Canal ${i + 1}: ${c.name}`}
              onClick={() => go(i)}
            >
              <span className="tv-guide-dot" />
              <span className="tv-guide-name">{c.name}</span>
              {i === ch && auto && (
                <span className="tv-guide-bar" style={{ animationDuration: `${AUTO_MS}ms` }} />
              )}
            </button>
          ))}
        </nav>
      </main>

      <footer className="lp-foot">
        <AceleraMark className="h-[12px] w-auto" />
        <span className="lp-foot-hint">
          <Icon name="keyboard_arrow_up" size="0.9rem" />
          <Icon name="keyboard_arrow_down" size="0.9rem" />
          troca de canal
        </span>
      </footer>
    </div>
  );
}
