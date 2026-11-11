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

export function ScreenLogo({
  className = 'h-10 w-auto',
  title,
  brand = false,
}: {
  className?: string;
  /** Com as cores do ícone do Screen (laranja para rosa) em vez da cor do texto. */
  brand?: boolean;
  /** Nome para leitores de tela; sem ele o logo é decorativo. */
  title?: string;
}) {
  const id = useId().replace(/:/g, '');
  const mask = `screen-glyph-${id}`;
  const fill = `screen-fill-${id}`;
  const a11y = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const };

  return (
    <svg viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} className={`screen-logo ${className}`} {...a11y}>
      <defs>
        {brand && (
          <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb347" />
            <stop offset="1" stopColor="#ff4f93" />
          </linearGradient>
        )}
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO_W} height={LOGO_H}>
          <rect width={LOGO_W} height={LOGO_H} rx="62" fill="#fff" />
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
      <rect
        width={LOGO_W}
        height={LOGO_H}
        rx="62"
        fill={brand ? `url(#${fill})` : 'currentColor'}
        mask={`url(#${mask})`}
      />
    </svg>
  );
}
