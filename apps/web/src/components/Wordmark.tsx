/**
 * Nome do produto como marca tipográfica: "screem" em minúsculas, Bricolage Grotesque pesada e com
 * o espaçamento fechado, terminando num ponto azul (o sinal de "no ar"). Sem símbolo nem ícone.
 */
export function Wordmark({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-4xl' }[size];
  const dot = { sm: 'h-1.5 w-1.5', md: 'h-1.5 w-1.5', lg: 'h-2.5 w-2.5' }[size];
  return (
    <span
      className={`inline-flex items-baseline font-display font-extrabold leading-none tracking-[-0.045em] text-zinc-50 ${text} ${className}`}
    >
      screem
      <span aria-hidden="true" className={`ml-0.5 inline-block rounded-full bg-brand-500 ${dot}`} />
      <span className="sr-only">Screem</span>
    </span>
  );
}
