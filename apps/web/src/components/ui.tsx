import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/*
 * Componentes base do design system (docs/design-system.md). Tudo que é botão, campo, painel,
 * selo ou aviso no produto passa por aqui, para que a mesma função tenha sempre a mesma cara.
 */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-zinc-50 text-zinc-950 hover:bg-zinc-200 active:bg-zinc-300 disabled:bg-zinc-800 disabled:text-zinc-500',
  secondary:
    'border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700 disabled:text-zinc-500',
  danger:
    'bg-red-600 text-white hover:bg-red-500 active:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500',
  ghost:
    'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 active:bg-zinc-700 disabled:text-zinc-600',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed ${
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm'
      } ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md'; label?: string }) {
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span
      role="status"
      aria-label={label ?? 'Carregando'}
      className="inline-flex items-center gap-2.5"
    >
      <svg viewBox="0 0 24 24" className={`${dim} animate-spin`} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" className="stroke-zinc-700" strokeWidth="2.5" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          className="stroke-brand-400"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="text-sm text-zinc-400">{label}</span>}
    </span>
  );
}

const ALERTS = {
  error: { box: 'border-red-500/30 bg-red-500/[0.07]', icon: 'error', color: 'text-red-300' },
  warning: {
    box: 'border-amber-500/30 bg-amber-500/[0.07]',
    icon: 'warning',
    color: 'text-amber-300',
  },
  info: { box: 'border-brand-500/30 bg-brand-500/[0.07]', icon: 'info', color: 'text-brand-300' },
  success: {
    box: 'border-emerald-500/30 bg-emerald-500/[0.07]',
    icon: 'check_circle',
    color: 'text-emerald-300',
  },
} as const satisfies Record<string, { box: string; icon: IconName; color: string }>;

/** Aviso em linha: ícone semântico, título curto e o que fazer. */
export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: keyof typeof ALERTS;
  title?: string;
  children?: ReactNode;
}) {
  const t = ALERTS[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${t.box}`}
    >
      <Icon name={t.icon} size="1.25rem" className={`mt-0.5 ${t.color}`} />
      <div className="min-w-0 text-zinc-200">
        {title && <p className="font-semibold text-zinc-50">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-zinc-300' : ''}>{children}</div>}
      </div>
    </div>
  );
}

/** Painel: superfície com borda fina, sem sombra. Agrupa conteúdo que precisa de moldura. */
export function Card({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-900 p-5 ${className}`} {...rest}>
      {children}
    </section>
  );
}

const BADGES = {
  neutral: 'bg-zinc-800 text-zinc-300',
  live: 'bg-red-500/15 text-red-300',
  open: 'bg-emerald-500/15 text-emerald-300',
  scheduled: 'bg-brand-500/15 text-brand-300',
  warn: 'bg-amber-500/15 text-amber-300',
} as const;

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof BADGES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-md px-1.5 text-xs font-medium ${BADGES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Ponto de estado. `live` pulsa; é o único elemento animado sem ação da pessoa. */
export function StatusDot({ tone }: { tone: 'live' | 'open' | 'idle' | 'scheduled' | 'off' }) {
  const color = {
    live: 'bg-red-500 signal-live',
    open: 'bg-emerald-400',
    idle: 'bg-amber-400',
    scheduled: 'bg-brand-400',
    off: 'bg-zinc-600',
  }[tone];
  return (
    <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-100">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/** Classe única para input, select e textarea: mesma altura, borda e foco em todo o produto. */
export const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 transition-colors hover:border-zinc-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 disabled:cursor-not-allowed disabled:opacity-50';

/** Cabeçalho de página: título à esquerda, ações à direita, descrição opcional embaixo. */
export function PageTitle({
  children,
  action,
  description,
}: {
  children: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-zinc-800 pb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-zinc-50">{children}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-zinc-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Seção dentro de uma página: título pequeno e conteúdo, separados por régua e não por cartão. */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-50">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-zinc-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Estado vazio: diz o que falta e o que fazer. Sem ilustração. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 px-6 py-10 text-center">
      <p className="font-medium text-zinc-100">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-zinc-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-16 w-16 text-xl' }[size];
  if (url) {
    return <img src={url} alt="" className={`${dim} rounded-full object-cover`} />;
  }
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-semibold text-zinc-200`}
    >
      {letters || '?'}
    </span>
  );
}
