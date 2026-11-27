import { LiveLogo } from './LiveLogo';

/**
 * O "bichinho": o bonequinho do Screen vivo (o mesmo do topo) — dois olhos "| |" que seguem o
 * mouse, a piscadinha que dobra o olho direito em "<" e um pulinho (CSS). Usa a cor do texto:
 * na cor do tema no carregamento, claro nos avisos. Parado com movimento reduzido ou animações
 * desligadas. Decorativo.
 */
export function Creature({ className = 'h-12' }: { className?: string }) {
  return (
    <span className={`creature inline-block ${className}`}>
      <LiveLogo color="current" className="h-full w-auto" />
    </span>
  );
}
