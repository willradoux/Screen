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
export function Landscape() {
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
