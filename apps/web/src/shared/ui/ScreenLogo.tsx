import { useId } from 'react';

/*
 * Logo do Screen em SVG (o formato da arte original): retângulo de cantos bem redondos com o
 * "|<" vazado. Preto por padrão (usa `currentColor`); o "|<" é um recorte, então mostra o que
 * estiver atrás (o fundo do tema). Medidas em unidades da arte: 302 × 238, cantos de raio 62,
 * traços de 32.
 *
 * As peças têm classes para animar por CSS: `logo-glyph` (o "|<", que olha para os lados) e
 * `logo-eye` (a barra, que pisca).
 */
export const LOGO_W = 302;
export const LOGO_H = 238;

/**
 * Contorno do ladrilho: squircle (canto contínuo, como os ícones da Apple), no lugar de um
 * retângulo de cantos redondos. `r` é o tamanho do canto.
 */
export function squircle(w = LOGO_W, h = LOGO_H, r = 84): string {
  const k = 0.22 * r;
  return [
    `M${r} 0H${w - r}`,
    `C${w - k} 0 ${w} ${k} ${w} ${r}`,
    `V${h - r}`,
    `C${w} ${h - k} ${w - k} ${h} ${w - r} ${h}`,
    `H${r}`,
    `C${k} ${h} 0 ${h - k} 0 ${h - r}`,
    `V${r}`,
    `C0 ${k} ${k} 0 ${r} 0Z`,
  ].join('');
}

export const SQUIRCLE = squircle();

export function ScreenLogo({
  className = 'h-10 w-auto',
  title,
}: {
  className?: string;
  /** Nome para leitores de tela; sem ele o logo é decorativo. */
  title?: string;
}) {
  const id = useId().replace(/:/g, '');
  const mask = `screen-glyph-${id}`;
  const a11y = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const };

  return (
    <svg viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} className={`screen-logo ${className}`} {...a11y}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO_W} height={LOGO_H}>
          <path d={SQUIRCLE} fill="#fff" />
          <g className="logo-glyph">
            <rect className="logo-eye" x="84" y="74" width="32" height="90" rx="16" fill="#000" />
            <path
              className="logo-chev"
              d="M208 97 175 123 208 149"
              fill="none"
              stroke="#000"
              strokeWidth="32"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </mask>
      </defs>
      <path d={SQUIRCLE} fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}
