import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Icon, type IconName } from '../components/Icon';
import { LiveLogo } from '../components/LiveLogo';
import { api } from '../lib/api';
import type { Sfx, Synthwave } from '../lib/synthwave';
import '../styles/landing.css';

/*
 * Página de apresentação do Screen (/sobre). A página é uma TV numa paisagem: cada canal é uma
 * parte (abertura, como usa, recursos, dúvidas, chamada final). Troca pelos botões da TV, pelas
 * setas do teclado, pela rodinha do mouse ou arrastando no celular. No começo os canais passam
 * sozinhos; depois que a pessoa mexe, só trocam quando ela quer. Tudo desenhado em CSS/SVG, sem
 * vídeo. Com movimento reduzido, nada passa sozinho e nada anima.
 */

const AUTO_MS = 5200;
const SOUND_KEY = 'screen-lp-sound';

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

function saveSoundPref(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // sem armazenamento: só não lembra
  }
}

/**
 * Som da página: a trilha e os efeitos. O motor só nasce quando a pessoa liga a TV (o navegador
 * não deixa tocar antes de um clique) e o código dele só carrega nessa hora.
 */
function useSound(root: React.RefObject<HTMLDivElement | null>) {
  const [on, setOn] = useState(false);
  const engine = useRef<Synthwave | null>(null);
  const want = useRef(readSoundPref());

  const ensure = useCallback(async () => {
    if (!engine.current) {
      const { Synthwave } = await import('../lib/synthwave');
      engine.current = new Synthwave();
      // Para medir o som no navegador durante o desenvolvimento.
      if (import.meta.env.DEV)
        (window as unknown as { __lpSound?: Synthwave }).__lpSound = engine.current;
    }
    return engine.current;
  }, []);

  const turn = useCallback(
    async (next: boolean) => {
      want.current = next;
      saveSoundPref(next);
      setOn(next);
      if (next) {
        const e = await ensure();
        await e.start();
        e.sound('power');
      } else {
        engine.current?.stop();
      }
    },
    [ensure],
  );

  // Aba escondida: pausa o áudio; voltou: continua.
  useEffect(() => {
    const onVis = () => {
      if (!engine.current) return;
      if (document.hidden) engine.current.suspend();
      else if (on) engine.current.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [on]);

  // A cena pulsa no bumbo (uma variável CSS, atualizada só enquanto toca).
  useEffect(() => {
    const el = root.current;
    if (!on || !el || motionOff()) return;
    let raf = 0;
    const loop = () => {
      el.style.setProperty('--beat', (engine.current?.beat() ?? 0).toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--beat', '0');
    };
  }, [on, root]);

  useEffect(() => () => engine.current?.close(), []);

  // Estável: não reinicia os relógios da página a cada desenho.
  const fx = useCallback((kind: Sfx, note = 0) => {
    if (want.current) engine.current?.sound(kind, note);
  }, []);

  return { on, prefer: want.current, turn, toggle: () => void turn(!on), fx };
}

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
      <span className="tv-caption-n">0{n}/04</span>
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

/** Palmeira em silhueta (SVG simples). */
function Palm({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 220">
      <path d="M62 220c-4-50-2-100 8-150" fill="none" stroke="currentColor" strokeWidth="7" />
      <path d="M70 70c-20-18-48-18-66-6 22-2 40 2 66 6z" />
      <path d="M70 70c-12-26-36-38-56-34 20 8 36 18 56 34z" />
      <path d="M70 70c8-26 30-40 52-38-18 8-34 20-52 38z" />
      <path d="M70 70c22-14 46-12 50 2-18-6-32-4-50-2z" />
      <path d="M70 70c-2-24 6-44 18-56-4 18-8 34-18 56z" />
    </svg>
  );
}

/**
 * Cenário synthwave: céu de fim de tarde, estrelas e estrela cadente, sol listrado na cor do
 * tema, montanhas com contorno neon, palmeiras, chão de grade andando e um filtro de VHS por
 * cima. As camadas mexem com o mouse; com som ligado, o sol e a grade pulsam no bumbo.
 */
function Landscape() {
  return (
    <div className="ls" aria-hidden="true">
      <span className="ls-stars" />
      <span className="ls-shoot" />
      <span className="ls-sun" />
      <svg className="ls-layer ls-far" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <path d="M0 300V210l90-60 70 40 120-120 110 100 70-40 140 110 120-140 130 110 100-60 140 90 110-70 120 60 160-30v150z" />
      </svg>
      <svg className="ls-layer ls-mid" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <path d="M0 300V250l150-70 130 50 160-110 150 100 110-40 190 90 140-80 160 70 130-50 180 80v110z" />
      </svg>
      <span className="ls-haze" />
      <div className="ls-floor">
        <span className="ls-grid" />
      </div>
      <Palm className="ls-palm ls-palm-l" />
      <Palm className="ls-palm ls-palm-r" />
      <span className="ls-vhs" />
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

/**
 * A rodinha da TV: gira arrastando (ou com a rodinha do mouse / setas) e cada "clique" é um
 * canal, como o seletor das TVs antigas. 8 canais = 45° cada.
 */
function Knob({ ch, count, onPick }: { ch: number; count: number; onPick: (i: number) => void }) {
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

/**
 * Tela de carregamento: o cenário aparece, a barrinha enche e a pessoa liga a TV (com ou sem
 * som). O clique é o gesto que o navegador exige para tocar a música.
 */
function Boot({ onStart }: { onStart: (sound: boolean) => void }) {
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

export function LandingPage() {
  const { state } = useAuth();
  const logged = state.status === 'authenticated';
  const [ch, setCh] = useState(0);
  const [booted, setBooted] = useState(false);
  const [auto, setAuto] = useState(() => !motionOff());
  const root = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);
  const touchY = useRef<number | null>(null);
  const hovered = useRef<Element | null>(null);
  const count = CHANNELS.length;
  const sound = useSound(root);
  const fx = sound.fx;

  const go = useCallback(
    (next: number, byUser = true) => {
      setCh(((next % count) + count) % count);
      if (byUser) setAuto(false);
      fx('channel');
    },
    [count, fx],
  );

  // Passa sozinho no começo (sem dar a volta), até a pessoa mexer.
  useEffect(() => {
    if (!auto || !booted) return;
    const id = window.setTimeout(() => {
      if (document.hidden) return;
      if (ch >= count - 1) setAuto(false);
      else go(ch + 1, false);
    }, AUTO_MS);
    return () => window.clearTimeout(id);
  }, [auto, booted, ch, count, go]);

  // Setas do teclado trocam o canal.
  useEffect(() => {
    if (!booted) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [role="slider"]')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') go(ch + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') go(ch - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [booted, ch, go]);

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

  /** Rodinha do mouse: um canal por gesto (ignora enquanto rola uma lista de dentro da TV). */
  const onWheel = (e: React.WheelEvent) => {
    if (!booted) return;
    const scroller = (e.target as HTMLElement).closest('.tv-scroll');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 2) return;
    if (Math.abs(e.deltaY) < 12) return;
    const t = performance.now();
    if (t - lastWheel.current < 650) return;
    lastWheel.current = t;
    go(ch + (e.deltaY > 0 ? 1 : -1));
  };

  /** Botões tocam uma nota da escala da música ao passar o mouse (cada botão a sua). */
  const onPointerOver = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const el = (e.target as HTMLElement).closest('button, a, [role="slider"]');
    if (!el || el === hovered.current) return;
    hovered.current = el;
    const all = Array.from(root.current?.querySelectorAll('button, a') ?? []);
    fx('hover', Math.max(0, all.indexOf(el)));
  };

  const start = (withSound: boolean) => {
    setBooted(true);
    if (withSound) void sound.turn(true);
  };

  const current = CHANNELS[ch]!;
  const Scene = current.Scene;

  return (
    <div
      ref={root}
      className="lp"
      data-booted={booted || undefined}
      onWheel={onWheel}
      onPointerOver={onPointerOver}
      onPointerLeave={() => {
        hovered.current = null;
      }}
      onTouchStart={(e) => {
        touchY.current = e.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(e) => {
        const begin = touchY.current;
        touchY.current = null;
        const end = e.changedTouches[0]?.clientY;
        if (!booted || begin == null || end == null) return;
        if ((e.target as HTMLElement).closest('.tv-scroll, .tv-knob')) return;
        if (Math.abs(end - begin) > 50) go(ch + (end < begin ? 1 : -1));
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
          <button
            type="button"
            className="lp-sound"
            data-on={sound.on || undefined}
            aria-pressed={sound.on}
            aria-label={sound.on ? 'Desligar o som' : 'Ligar o som'}
            onClick={sound.toggle}
          >
            <span className="lp-eq" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </button>
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
              {booted && (
                <>
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
                  <span className="tv-ch" key={`c${ch}`} aria-hidden="true">
                    CH {String(ch + 1).padStart(2, '0')}
                  </span>
                </>
              )}
              <span className="tv-glass" aria-hidden="true" />
            </section>
            <div className="tv-panel">
              <span className="tv-brand" aria-hidden="true">
                screen
              </span>
              <span className="tv-grille" aria-hidden="true" />
              <Knob ch={ch} count={count} onPick={(i) => go(i)} />
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
              <span className="tv-guide-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="tv-guide-name">{c.name}</span>
              {booted && i === ch && auto && (
                <span className="tv-guide-bar" style={{ animationDuration: `${AUTO_MS}ms` }} />
              )}
            </button>
          ))}
        </nav>
      </main>

      {!booted && <Boot onStart={start} />}
    </div>
  );
}
