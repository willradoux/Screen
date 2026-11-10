import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Avatar } from './ui';

export interface Person {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Capa do widget: o degradê do tema com granulado, selos em cima e, se houver, as pessoas
 * sobrepondo a borda de baixo (como um cartão de perfil).
 * `tone`: `live` (no ar), `idle` (em espera, mais apagada) ou `off` (encerrada, sem cor).
 */
export function WidgetCover({
  tone = 'live',
  left,
  right,
  people,
}: {
  tone?: 'live' | 'idle' | 'off';
  left?: ReactNode;
  right?: ReactNode;
  people?: Person[];
}) {
  return (
    <div className="widget-cover" data-tone={tone}>
      <div className="widget-chips">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">{left}</span>
        <span className="flex items-center gap-1.5">{right}</span>
      </div>
      {people && people.length > 0 && <AvatarStack people={people} />}
    </div>
  );
}

/** Avatares empilhados; passa de `max`, mostra "+N". */
export function AvatarStack({ people, max = 5 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <ul className="avatar-stack" aria-label={`${people.length} na call`}>
      {shown.map((p) => (
        <li key={p.userId} title={p.displayName ?? p.userId}>
          <Avatar name={p.displayName ?? '?'} url={p.avatarUrl} size="md" />
        </li>
      ))}
      {rest > 0 && (
        <li>
          <span className="avatar-more">+{rest}</span>
        </li>
      )}
    </ul>
  );
}

/** Selo escuro em cima da capa (tipo da sala, por exemplo). */
export function CoverChip({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <span className="cover-chip">
      {icon && <Icon name={icon} size="0.9rem" />}
      {children}
    </span>
  );
}

/** Um número do widget: ícone na cor do tema, valor em negrito e o rótulo embaixo. */
export function WidgetStat({
  icon,
  value,
  label,
}: {
  icon: IconName;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <Icon name={icon} size="1.1rem" className="shrink-0 text-brand-300" />
      <div className="min-w-0 leading-tight">
        <p className="tabular truncate text-[13px] font-bold text-zinc-50">{value}</p>
        <p className="text-[11px] text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

/** Número grande com rótulo e ícone (resumos de painel e estatísticas). */
export function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: IconName;
  label: string;
  value: string;
  /** Uma linha de contexto embaixo do número. */
  hint?: string;
}) {
  return (
    <div className="surface p-4">
      <p className="flex items-center gap-2 text-[13px] text-zinc-400">
        <Icon name={icon} size="1.05rem" className="text-brand-300" />
        {label}
      </p>
      <p className="tabular mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-zinc-50 sm:text-3xl">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
