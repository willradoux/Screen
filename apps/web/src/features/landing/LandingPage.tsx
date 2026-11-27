import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from './AppLink';
import { useOptionalAuth } from '../auth/AuthProvider';
import { SKIP_INTRO_EVENT } from '../../shared/lib/intro';
import { Icon } from '../../shared/ui/Icon';
import { LiveLogo } from '../../shared/ui/LiveLogo';
import { api } from '../../shared/lib/api';
import '../../styles/landing.css';
import { Boot } from './Boot';
import { CHANNELS, ChannelEnd, ChannelFaq, ChannelFeatures, ChannelIntro } from './channels';
import { Landscape } from './Landscape';
import { lpTheme, nextLpTheme, readLpTheme } from './themes';
import { trackFor } from './tracks';
import { readMode } from '../../shared/lib/theme';
import { motionOff } from './motion';
import { Caption } from './scenes';
import { Knob, Osd } from './tv-parts';
import { Tutorial, markTutorialSeen, tutorialSeen } from './Tutorial';
import { useSound } from './useSound';
import { HOME } from '../../shared/lib/paths';

/*
 * Página de apresentação do Screen (/sobre). A página é uma TV numa paisagem: cada canal é uma
 * parte (abertura, como usa, recursos, dúvidas, chamada final). Troca pelos botões da TV, pelas
 * setas do teclado, pela rodinha do mouse ou arrastando no celular. No começo os canais passam
 * sozinhos; depois que a pessoa mexe, só trocam quando ela quer. Tudo desenhado em CSS/SVG, sem
 * vídeo. Com movimento reduzido, nada passa sozinho e nada anima.
 */

const AUTO_MS = 5200;

/** Marca do GitHub (o desenho oficial do gato, em uma cor só). */
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function LandingPage() {
  // Na LP separada não há login do app: quem clica em Entrar passa pelo Discord e cai nas salas.
  const logged = useOptionalAuth()?.state.status === 'authenticated';
  const [ch, setCh] = useState(0);
  const [booted, setBooted] = useState(false);
  const [auto, setAuto] = useState(() => !motionOff());
  const root = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);
  const touchY = useRef<number | null>(null);
  const hovered = useRef<Element | null>(null);
  const count = CHANNELS.length;
  // Tema (o mesmo do site): muda o céu, o neon, a TV e a música. O botão do topo troca os dois.
  const [theme, setTheme] = useState(readLpTheme);
  const themeInfo = lpTheme(theme);
  const track = useMemo(() => trackFor(theme, readMode()), [theme]);
  const sound = useSound(root, track);

  // Quem caiu aqui vindo do endereço principal não vê a abertura do app por cima do carregamento.
  useEffect(() => {
    window.dispatchEvent(new Event(SKIP_INTRO_EVENT));
  }, []);
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

  // Indicador de volume na tela (aparece um instante quando mexe no som).
  const [osd, setOsd] = useState(0);
  const flashOsd = () => setOsd((n) => n + 1);

  // Tutorial: aparece sozinho na primeira vez; o "?" do topo abre de novo.
  const [help, setHelp] = useState(false);

  const start = (withSound: boolean) => {
    setBooted(true);
    if (!tutorialSeen()) setHelp(true);
    if (withSound) void sound.turn(true);
  };

  const current = CHANNELS[ch]!;
  const Scene = current.Scene;

  return (
    <div
      ref={root}
      className="lp"
      data-lp-theme={themeInfo.scene}
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
      <Landscape scene={themeInfo.scene} />

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
            className="lp-icon-btn lp-theme-btn"
            aria-label={`Tema: ${themeInfo.label} (música: ${track.name}). Trocar o tema`}
            title="Trocar o tema"
            onClick={() => {
              setTheme(nextLpTheme(theme));
              fx('channel');
            }}
          >
            <span
              aria-hidden="true"
              className="lp-theme-dot"
              style={{
                background: `linear-gradient(135deg, ${themeInfo.swatch[0]}, ${themeInfo.swatch[1]})`,
              }}
            />
            <span className="lp-icon-label">{themeInfo.label}</span>
          </button>
          <a
            href="https://github.com/willradoux/Screen"
            target="_blank"
            rel="noreferrer"
            className="lp-icon-btn"
            aria-label="Código do Screen no GitHub (abre em outra aba)"
          >
            <GithubMark />
            <span className="lp-icon-label">GitHub</span>
          </a>
          <button
            type="button"
            className="lp-icon-btn"
            aria-label="Como usar esta página"
            onClick={() => setHelp(true)}
          >
            <span aria-hidden="true" className="lp-help-mark">
              ?
            </span>
          </button>
          {logged ? (
            <AppLink to={HOME} className="lp-btn lp-btn-small">
              Salas
            </AppLink>
          ) : (
            <a href={api.loginUrl(HOME)} className="lp-btn lp-btn-small">
              Entrar
            </a>
          )}
        </div>
      </header>

      <main className="lp-stage">
        <div className="tv">
          <div className="tv-ears" aria-hidden="true">
            <span className="tv-ear tv-ear-l">
              <i />
            </span>
            <span className="tv-ear tv-ear-r">
              <i />
            </span>
            <span className="tv-ears-base" />
          </div>
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
                        <Caption title={current.name} text={current.caption ?? ''} />
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
                  <Osd on={sound.on} volume={sound.volume} flash={osd} />
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
              <div className="tv-controls">
                <div className="tv-pair" role="group" aria-label="Volume">
                  <span className="tv-pair-label" aria-hidden="true">
                    VOL
                  </span>
                  <button
                    type="button"
                    aria-label="Diminuir o volume"
                    disabled={sound.volume === 0}
                    onClick={() => {
                      sound.changeVolume(-1);
                      flashOsd();
                    }}
                  >
                    <Icon name="remove" size="1.1rem" />
                  </button>
                  <button
                    type="button"
                    aria-label="Aumentar o volume"
                    disabled={sound.on && sound.volume === 10}
                    onClick={() => {
                      sound.changeVolume(1);
                      flashOsd();
                    }}
                  >
                    <Icon name="add" size="1.1rem" />
                  </button>
                </div>
                <div className="tv-pair" role="group" aria-label="Canal">
                  <span className="tv-pair-label" aria-hidden="true">
                    CH
                  </span>
                  <button type="button" aria-label="Canal anterior" onClick={() => go(ch - 1)}>
                    <Icon name="keyboard_arrow_up" size="1.2rem" />
                  </button>
                  <button type="button" aria-label="Próximo canal" onClick={() => go(ch + 1)}>
                    <Icon name="keyboard_arrow_down" size="1.2rem" />
                  </button>
                </div>
                <button
                  type="button"
                  className="tv-sound"
                  data-on={sound.on || undefined}
                  aria-pressed={sound.on}
                  aria-label={sound.on ? 'Desligar o som' : 'Ligar o som'}
                  onClick={() => {
                    sound.toggle();
                    flashOsd();
                  }}
                >
                  <span className="tv-led" aria-hidden="true" />
                  <Icon name={sound.on ? 'volume_up' : 'volume_off'} size="1.05rem" />
                  <span className="tv-sound-label" aria-hidden="true">
                    SOM
                  </span>
                </button>
              </div>
            </div>
          </div>
          <span className="tv-foot tv-foot-l" aria-hidden="true" />
          <span className="tv-foot tv-foot-r" aria-hidden="true" />
          <span className="tv-shadow" aria-hidden="true" />
        </div>
      </main>

      {!booted && <Boot onStart={start} />}
      {booted && help && (
        <Tutorial
          onClose={() => {
            markTutorialSeen();
            setHelp(false);
          }}
        />
      )}
    </div>
  );
}
