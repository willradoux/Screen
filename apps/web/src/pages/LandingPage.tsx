import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AceleraMark } from '../components/AceleraMark';
import { Icon, type IconName } from '../components/Icon';
import { LiveLogo } from '../components/LiveLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { api } from '../lib/api';
import '../styles/landing.css';

/*
 * Página de apresentação do Screen (pública). Escura como o resto do site, com a cor do tema
 * escolhido. O bonequinho do topo segue o mouse; a "call" do lado é só desenho (CSS), sem vídeo
 * de verdade, para a página abrir rápido. As seções aparecem ao rolar (uma vez só) e tudo fica
 * parado com movimento reduzido ou animações desligadas.
 */

/** Aparece ao entrar na tela (uma vez). Um observador só para a página inteira. */
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
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);
  return root;
}

/** Brilho que segue o mouse nos cards (só muda duas variáveis CSS, sem redesenhar o React). */
function glow(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

const FEATURES: { icon: IconName; title: string; text: string; wide?: boolean }[] = [
  {
    icon: 'videocam',
    title: 'Live direto da call',
    text: 'Entrou na call do Discord? O bot abre a sala e solta o link no chat. Um clique e você tá transmitindo.',
    wide: true,
  },
  {
    icon: 'screen_share',
    title: 'Tela, câmera e voz',
    text: 'Só a câmera, só a tela ou as duas. Em 60 quadros quando dá, leve quando a sala enche.',
  },
  {
    icon: 'keep',
    title: 'Fixa quem importa',
    text: 'Fixa uma, duas ou três telas e câmeras lado a lado. Tela cheia e zoom na tela dos outros.',
  },
  {
    icon: 'stadium',
    title: 'Modo palco',
    text: 'Palestrante fala, plateia assiste e manda no chat. O admin chama quem sobe.',
  },
  {
    icon: 'forum',
    title: 'Chat e enquete',
    text: 'Chat da sala com anti-spam e enquete no topo, estilo live do YouTube.',
    wide: true,
  },
  {
    icon: 'volume_up',
    title: 'O som do seu jeito',
    text: 'Volume de cada pessoa e de cada tela, redução de ruído e escolha da saída de som.',
  },
  {
    icon: 'palette',
    title: 'Fundo e efeitos',
    text: 'Desfoca ou troca o fundo da câmera e brinca com a voz.',
  },
  {
    icon: 'shield_person',
    title: 'Moderação de verdade',
    text: 'Silenciar, tirar do palco, desligar câmeras, travar a tela. Tudo registrado.',
    wide: true,
  },
  {
    icon: 'qr_code_2',
    title: 'No celular também',
    text: 'Lê o QR code e entra pelo celular. Dá pra instalar como app.',
  },
];

const STEPS: { n: string; title: string; text: string; icon: IconName }[] = [
  {
    n: '01',
    icon: 'headphones',
    title: 'Entra na call',
    text: 'Do jeito de sempre, numa call de voz do servidor.',
  },
  {
    n: '02',
    icon: 'chat',
    title: 'O bot manda o link',
    text: 'A sala abre sozinha e o link aparece no chat da call.',
  },
  {
    n: '03',
    icon: 'arrow_forward',
    title: 'Abre e transmite',
    text: 'No navegador, no PC ou no celular. Sem instalar nada.',
  },
];

const MARQUEE = [
  'sem instalar nada',
  'login com Discord',
  'tela em 1080p',
  'chat com enquete',
  'modo palco',
  'redução de ruído',
  'fixar várias telas',
  'funciona no celular',
  'só entra quem é da comunidade',
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
    a: 'O celular manda câmera e voz e assiste a tudo. Compartilhar a tela é pelo computador (limite do próprio navegador do celular).',
  },
  {
    q: 'E a minha privacidade?',
    a: 'Login pelo Discord, sem senha nossa. Câmera, tela e microfone começam desligados, e você liga quando quiser.',
  },
];

/** A "call" desenhada do hero: quatro pessoas, uma tela compartilhada, alguém falando e o chat. */
function CallMock() {
  return (
    <div className="lp-call" aria-hidden="true">
      <div className="lp-call-bar">
        <span className="lp-dot" />
        <span className="lp-live">AO VIVO</span>
        <span className="lp-call-title">call-geral</span>
        <span className="lp-call-count">
          <Icon name="group" size="0.9rem" />
          37
        </span>
      </div>
      <div className="lp-call-body">
        <div className="lp-stage">
          <div className="lp-screen">
            <div className="lp-code">
              <i style={{ width: '62%' }} />
              <i style={{ width: '38%', marginLeft: '8%' }} />
              <i style={{ width: '54%', marginLeft: '8%' }} />
              <i style={{ width: '30%', marginLeft: '16%' }} />
              <i style={{ width: '46%', marginLeft: '8%' }} />
              <i style={{ width: '20%' }} />
            </div>
            <span className="lp-tag">
              <Icon name="screen_share" size="0.8rem" />
              Tela da Ana
            </span>
          </div>
          <div className="lp-tiles">
            {['A', 'B', 'C', 'D'].map((l, i) => (
              <div key={l} className="lp-tile" style={{ '--i': i } as React.CSSProperties}>
                <span className="lp-avatar">{l}</span>
                <span className="lp-bars">
                  <b />
                  <b />
                  <b />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-chat">
          <p className="lp-msg" style={{ '--d': '0s' } as React.CSSProperties}>
            <b>caio</b> bora que bora
          </p>
          <p className="lp-msg" style={{ '--d': '1.2s' } as React.CSSProperties}>
            <b>duda</b> dá zoom no código?
          </p>
          <p className="lp-msg" style={{ '--d': '2.4s' } as React.CSSProperties}>
            <b>beto</b> fixei a tela aqui
          </p>
          <div className="lp-poll">
            <span>Próximo tema?</span>
            <div className="lp-poll-row">
              React <i style={{ '--w': '68%' } as React.CSSProperties} />
            </div>
            <div className="lp-poll-row">
              Node <i style={{ '--w': '32%' } as React.CSSProperties} />
            </div>
          </div>
        </div>
      </div>
      <div className="lp-call-controls">
        {(['mic', 'videocam', 'screen_share', 'chat'] as IconName[]).map((n) => (
          <span key={n}>
            <Icon name={n} size="1rem" />
          </span>
        ))}
        <span className="lp-end">
          <Icon name="call_end" size="1rem" />
        </span>
      </div>
    </div>
  );
}

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
          <a href="#como">Como funciona</a>
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
        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-aura" aria-hidden="true" />
          <div className="lp-hero-copy">
            <p className="lp-kicker" data-reveal>
              <span className="lp-dot" /> feito pela e para a comunidade Acelera DEV
            </p>
            <h1 className="lp-title" data-reveal>
              Sua call do Discord,
              <br />
              agora com <span className="lp-grad">tela, câmera</span>
              <br />e palco.
            </h1>
            <p className="lp-sub" data-reveal>
              Entrou na call, o link chega. Abre no navegador e mostra o código, a cara e a voz pra
              galera, sem instalar nada e sem sair do Discord.
            </p>
            <div className="lp-ctas" data-reveal>
              {cta}
              <a href="#como" className="lp-btn lp-btn-ghost">
                Ver como funciona
              </a>
            </div>
          </div>
          <div className="lp-hero-art" data-reveal>
            <div className="lp-pet">
              <LiveLogo className="h-full w-full" />
            </div>
            <CallMock />
          </div>
        </section>

        {/* Faixa que corre */}
        <div className="lp-marquee" aria-label="Destaques">
          <div className="lp-marquee-track">
            {[...MARQUEE, ...MARQUEE].map((t, i) => (
              <span key={i} aria-hidden={i >= MARQUEE.length || undefined}>
                {t}
                <i />
              </span>
            ))}
          </div>
        </div>

        {/* Como funciona */}
        <section id="como" className="lp-section">
          <h2 className="lp-h2" data-reveal>
            Três passos. <span className="lp-muted">Literalmente.</span>
          </h2>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className="lp-step"
                data-reveal
                style={{ '--delay': `${i * 90}ms` } as React.CSSProperties}
              >
                <span className="lp-step-n">{s.n}</span>
                <span className="lp-step-icon">
                  <Icon name={s.icon} size="1.3rem" />
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Recursos */}
        <section id="recursos" className="lp-section">
          <h2 className="lp-h2" data-reveal>
            Tudo que uma call boa tem. <span className="lp-muted">E um pouco mais.</span>
          </h2>
          <ul className="lp-bento">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="lp-card"
                data-wide={f.wide || undefined}
                data-reveal
                onPointerMove={glow}
                style={{ '--delay': `${(i % 4) * 70}ms` } as React.CSSProperties}
              >
                <span className="lp-card-icon">
                  <Icon name={f.icon} size="1.25rem" />
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Palco */}
        <section className="lp-section lp-split">
          <div data-reveal>
            <h2 className="lp-h2">Aula, live ou papo. Você escolhe o formato.</h2>
            <p className="lp-sub">
              Sala comum: todo mundo fala e mostra. Liga o <strong>palco</strong> e vira palestra:
              quem tá no palco transmite, a plateia assiste, vota e manda no chat. Admin sobe e
              desce quem quiser.
            </p>
            <ul className="lp-checks">
              <li>
                <Icon name="check_circle" size="1.1rem" /> Pedir a palavra com fila
              </li>
              <li>
                <Icon name="check_circle" size="1.1rem" /> Tela só para quem está no palco
              </li>
              <li>
                <Icon name="check_circle" size="1.1rem" /> Chat mais calmo para a plateia
              </li>
            </ul>
          </div>
          <div className="lp-stage-art" aria-hidden="true" data-reveal>
            <div className="lp-stage-top">
              <span className="lp-speaker">
                <Icon name="record_voice_over" size="1.4rem" />
              </span>
              <span className="lp-speaker" data-on>
                <Icon name="mic" size="1.4rem" />
              </span>
            </div>
            <div className="lp-crowd">
              {Array.from({ length: 24 }, (_, i) => (
                <i key={i} style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>
            <span className="lp-hand">
              <Icon name="front_hand" size="1.1rem" />
            </span>
          </div>
        </section>

        {/* Dúvidas */}
        <section id="duvidas" className="lp-section lp-faq">
          <h2 className="lp-h2" data-reveal>
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

        {/* Final */}
        <section className="lp-final" data-reveal>
          <div className="lp-final-pet">
            <LiveLogo className="h-full w-full" />
          </div>
          <h2 className="lp-h2">Bora pra call?</h2>
          <p className="lp-sub">Entra com o Discord e cola na próxima live da comunidade.</p>
          <div className="lp-ctas lp-ctas-center">{cta}</div>
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
