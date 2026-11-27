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
 * O dragão: silhueta voando (desenho próprio). As asas batem com CSS; o corpo atravessa o céu
 * devagar, de vez em quando.
 */
function Dragon() {
  return (
    <span className="ls-dragon">
      <svg viewBox="0 0 200 100">
        <path
          className="ls-wing ls-wing-back"
          d="M96 50C86 30 70 14 48 6c12 14 16 24 14 34 8-2 18 2 26 10z"
        />
        <path d="M60 55c20-10 50-10 70-3 10 3 20 2 30-4l12-6-4 8 10-1-14 9c-14 6-29 6-44 4-20 4-40 4-60-2-15-2-30 2-45 10 15-12 30-15 45-15z" />
        <path
          className="ls-wing ls-wing-front"
          d="M110 50c2-20 10-36 26-46-5 16-3 26-7 36-6-2-12 2-16 10z"
        />
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
