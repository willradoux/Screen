import { ScreenLogo } from './ScreenLogo';
/** Ícone do Screen (SVG, nas cores do tema) com o "|<" piscando de vez em quando. Decorativo. */
export function LogoMark({ className = 'h-8' }: { className?: string }) {
  return <ScreenLogo brand className={`brand-logo w-auto shrink-0 select-none ${className}`} />;
}

/**
 * Marca: badge + "screem" em minúsculas, peso firme e espaçamento fechado. A cor do texto é
 * herdada.
 */
export function Wordmark({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const mark = { sm: 'h-6', md: 'h-8', lg: 'h-11' }[size];
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-3xl' }[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={mark} />
      <span className={`font-semibold leading-none tracking-[-0.04em] text-current ${text}`}>
        screen
      </span>
    </span>
  );
}
