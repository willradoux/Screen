/** Ilha de pedra flutuando, com cristais no topo e raízes penduradas (SVG simples). */
function Island({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 220 170">
      {/* cristais (brilham na cor do tema) */}
      <path className="ls-crystal" d="M70 58l10-34 10 34z" />
      <path className="ls-crystal" d="M92 60l7-24 7 24z" />
      <path className="ls-crystal" d="M140 60l9-28 9 28z" />
      {/* a pedra: topo reto, base em ponta */}
      <path d="M10 62h200l-14 18-30 10-16 28-26 12-12 36-18-30-30-10-20-26-24-12z" />
      {/* raízes */}
      <path
        d="M70 100c-4 14 2 24-6 38M150 96c6 12 0 22 8 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}

/** Castelo em silhueta no alto da montanha do fundo. */
function Castle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 160 120">
      <path d="M8 120V70h10v-8h6v8h8V40h-4l9-22 9 22h-4v30h10V54h-3l7-16 7 16h-3v16h12V30h-5l11-26 11 26h-5v40h10V56h-3l7-16 7 16h-3v14h8V62h6v8h10v50z" />
      <path className="ls-window" d="M78 52h6v10h-6zM47 60h4v8h-4zM113 64h4v8h-4z" />
    </svg>
  );
}

/**
 * O dragão (desenho próprio, em silhueta): cabeça com chifre e focinho, olho aceso na cor do
 * tema, pescoço em curva, patas recolhidas, cauda longa com ponta de lança e asas de morcego com
 * nervuras e borda recortada. As asas batem com CSS; ele atravessa o céu de tempos em tempos.
 */
function Dragon() {
  return (
    <span className="ls-dragon">
      <svg viewBox="0 0 320 200">
        <g className="ls-wing ls-wing-back">
          <path d="M168 112c-6-26-12-52-22-72-14-12-34-22-54-28 14 18 18 28 18 40 10-2 18 2 22 12 8 2 12 8 14 20 6 8 10 18 12 30z" />
          <path
            className="ls-wing-bone"
            d="M164 110L146 40 92 12M146 40l-36 12M146 40l-14 24M146 40v44"
          />
        </g>
        <path d="M24 146c36-6 68-26 104-34 22-6 48-6 70-4 16 0 24-12 32-24 6-10 12-18 22-22l-4-16 14 12c12 0 26 6 40 16l-12 6c-12 2-22 4-30 6-10 6-18 18-24 30-6 10-16 16-30 18l4 16h-10l-4-14c-16 2-34 2-48 0l2 16h-10l-4-18c-24-4-56 16-88 22z" />
        <path d="M30 146L10 136l8 14-12 12 28-8z" />
        <g className="ls-wing ls-wing-front">
          <path d="M182 110c8-30 14-54 24-72 16-12 38-20 60-26-14 18-18 28-18 40-10-2-18 2-24 12-8 0-14 6-18 18-8 6-12 18-14 32z" />
          <path
            className="ls-wing-bone"
            d="M190 110l16-72 60-26M206 38l42 14M206 38l18 26M206 38v44"
          />
        </g>
        <circle className="ls-dragon-eye" cx="276" cy="68" r="3" />
      </svg>
    </span>
  );
}

/**
 * Cenário: um reino de fantasia no clima synthwave. Céu de crepúsculo com estrelas, sol
 * listrado na cor do tema, montanhas com contorno neon e um castelo no alto, ilhas de pedra
 * flutuando com cristais, um dragão cruzando o céu e o chão de grade andando, com um filtro de
 * VHS por cima. As camadas mexem com o mouse; com som ligado, o sol e a grade pulsam no bumbo.
 * Com movimento reduzido ou animações desligadas, tudo fica parado.
 */
export function Landscape() {
  return (
    <div className="ls" aria-hidden="true">
      <span className="ls-stars" />
      <span className="ls-shoot" />
      <span className="ls-sun" />
      <Dragon />
      <svg className="ls-layer ls-far" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <path d="M0 300V210l90-60 70 40 120-120 110 100 70-40 140 110 120-140 130 110 100-60 140 90 110-70 120 60 160-30v150z" />
      </svg>
      <Castle className="ls-castle" />
      <svg className="ls-layer ls-mid" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <path d="M0 300V250l150-70 130 50 160-110 150 100 110-40 190 90 140-80 160 70 130-50 180 80v110z" />
      </svg>
      <span className="ls-haze" />
      <div className="ls-floor">
        <span className="ls-grid" />
      </div>
      <Island className="ls-island ls-island-l" />
      <Island className="ls-island ls-island-r" />
      <span className="ls-vhs" />
    </div>
  );
}
