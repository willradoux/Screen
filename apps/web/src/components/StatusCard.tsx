import type { ReactNode } from 'react';
import { Creature } from './Creature';
import { Icon, type IconName } from './Icon';
import { Spinner } from './ui';

type Tone = 'neutral' | 'info' | 'wait' | 'warning' | 'error';

/**
 * Tela de estado (erro, espera, bloqueio, sala encerrada…): uma peça centralizada com ícone
 * grande na cor do caso, título em negrito, o que aconteceu, o que fazer e os botões.
 * `waiting` mostra um "verificando…" quando a tela resolve sozinha (fora da call, lotada).
 */
export function StatusCard({
  icon,
  tone = 'neutral',
  title,
  children,
  waiting,
  actions,
  headingLevel = 2,
}: {
  icon: IconName;
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  /** Texto do "verificando…" (a tela resolve sozinha). */
  waiting?: string;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section role={tone === 'error' ? 'alert' : undefined} className="status-card surface rise">
      {tone === 'wait' ? (
        <span className="mb-1 text-zinc-100" aria-hidden="true">
          <Creature className="h-12" />
        </span>
      ) : (
        <span className="status-icon" data-tone={tone} aria-hidden="true">
          <Icon name={icon} size="1.6rem" />
        </span>
      )}
      <Heading className="text-xl font-bold leading-tight text-zinc-50">{title}</Heading>
      {children && (
        <div className="space-y-1 text-[14px] leading-relaxed text-zinc-400">{children}</div>
      )}
      {waiting && (
        <div className="status-waiting">
          <Spinner size="sm" label={waiting} />
        </div>
      )}
      {actions && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{actions}</div>
      )}
    </section>
  );
}
