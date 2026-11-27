/*
 * Os mundos do fundo da LP, um por tema (o cenário em landing.css: `data-lp-theme`). Todos são
 * silhuetas em SVG com o contorno neon do tema; o céu, o sol, a grade e o VHS são comuns.
 *
 * - screen (Screen): reino do dragão (o dragão, o castelo e as ilhas ficam em Landscape.tsx)
 * - neon (Synthwave): cidade neon, prédios com janelas acesas e palmeiras
 * - synthwave (Clássico): praia de pôr do sol, mar com o reflexo do sol e palmeiras
 * - brasa (Pôr do sol): deserto, dunas, cactos e uma mesa de pedra
 * - acelera (Acelera): floresta de pinheiros com vaga-lumes
 * - gelo (Gelo): montanhas nevadas com aurora boreal
 */

/** Palmeira em silhueta. */
export function Palm({ className }: { className: string }) {
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

/** Prédios: alturas e janelas fixas (o desenho não muda a cada visita). */
const BUILDINGS = [
  [0, 90, 50],
  [52, 140, 40],
  [94, 70, 60],
  [156, 180, 44],
  [202, 110, 56],
  [260, 150, 38],
  [300, 80, 64],
  [366, 200, 46],
  [414, 120, 52],
  [468, 160, 40],
  [510, 95, 70],
  [582, 135, 48],
] as const;

function City() {
  return (
    <svg className="ls-world ls-city" viewBox="0 0 630 220" preserveAspectRatio="xMidYMax slice">
      {BUILDINGS.map(([x, h, w]) => (
        <g key={x}>
          <rect x={x} y={220 - h} width={w} height={h} />
          {Array.from({ length: Math.floor(h / 22) }, (_, r) =>
            Array.from({ length: Math.floor(w / 14) }, (_, c) =>
              (r * 7 + c * 3 + x) % 5 < 2 ? (
                <rect
                  key={`${r}-${c}`}
                  className="ls-window"
                  x={x + 5 + c * 14}
                  y={220 - h + 8 + r * 22}
                  width="6"
                  height="9"
                />
              ) : null,
            ),
          )}
        </g>
      ))}
    </svg>
  );
}

function Beach() {
  return (
    <>
      {/* O mar no horizonte, com faixas do reflexo do sol. */}
      <span className="ls-world ls-sea" />
      <Palm className="ls-palm ls-palm-l" />
      <Palm className="ls-palm ls-palm-r" />
    </>
  );
}

function Desert() {
  return (
    <>
      <svg className="ls-world ls-dunes" viewBox="0 0 1600 200" preserveAspectRatio="none">
        <path d="M0 200V120c120-40 260-60 420-30 140 26 240-20 380-34 180-18 300 30 460 22 140-8 240-40 340-20v142z" />
      </svg>
      <svg className="ls-world ls-mesa" viewBox="0 0 300 140">
        <path d="M0 140l30-70h20l10-30h120l14 30h30l40 70z" />
      </svg>
      <svg className="ls-world ls-cactus ls-cactus-l" viewBox="0 0 80 160">
        <path d="M34 160V30a6 6 0 0 1 12 0v130zM34 90H18a6 6 0 0 1-6-6V60a6 6 0 0 1 12 0v18h10zM46 70h12V48a6 6 0 0 1 12 0v28a6 6 0 0 1-6 6H46z" />
      </svg>
      <svg className="ls-world ls-cactus ls-cactus-r" viewBox="0 0 80 160">
        <path d="M34 160V30a6 6 0 0 1 12 0v130zM34 90H18a6 6 0 0 1-6-6V60a6 6 0 0 1 12 0v18h10zM46 70h12V48a6 6 0 0 1 12 0v28a6 6 0 0 1-6 6H46z" />
      </svg>
    </>
  );
}

/** Uma fileira de pinheiros (triângulos empilhados), de `count` árvores. */
function Pines({ className, count }: { className: string; count: number }) {
  const w = 1600 / count;
  return (
    <svg className={`ls-world ${className}`} viewBox="0 0 1600 200" preserveAspectRatio="none">
      {Array.from({ length: count }, (_, i) => {
        const x = i * w + ((i * 37) % 20);
        const h = 120 + ((i * 53) % 70);
        return (
          <path
            key={i}
            d={`M${x + w / 2} ${200 - h}l${w * 0.42} ${h * 0.55}h-${w * 0.14}l${w * 0.22} ${h * 0.45}H${x + w * 0.08}l${w * 0.22}-${h * 0.45}h-${w * 0.14}z`}
          />
        );
      })}
    </svg>
  );
}

function Forest() {
  return (
    <>
      <Pines className="ls-pines ls-pines-back" count={18} />
      <Pines className="ls-pines ls-pines-front" count={11} />
      <span className="ls-world ls-fireflies">
        {Array.from({ length: 14 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 71) % 100}%`,
              top: `${20 + ((i * 37) % 60)}%`,
              animationDelay: `${-i * 0.7}s`,
            }}
          />
        ))}
      </span>
    </>
  );
}

function Ice() {
  return (
    <>
      <span className="ls-world ls-aurora" />
      <svg className="ls-world ls-peaks" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <path d="M0 300V190l160-130 120 90 180-150 170 160 120-80 200 170 150-120 180 110 140-90 180 150v100z" />
        {/* neve nos picos */}
        <path
          className="ls-snow"
          d="M130 85l30-25 30 24-14 6-16-8-14 10zM430 34l30-24 30 26-16 8-14-10-18 10zM870 66l30-26 32 30-18 4-14-10-16 8zM1260 72l40-32 34 30-20 4-14-8-22 10z"
        />
      </svg>
      <Pines className="ls-pines ls-pines-front ls-pines-ice" count={13} />
    </>
  );
}

/** O mundo do cenário (além do céu, do sol e da grade, que são de todos). */
export function World({ scene }: { scene: string }) {
  if (scene === 'neon') return <City />;
  if (scene === 'synthwave') return <Beach />;
  if (scene === 'brasa') return <Desert />;
  if (scene === 'acelera') return <Forest />;
  if (scene === 'gelo') return <Ice />;
  return null;
}
