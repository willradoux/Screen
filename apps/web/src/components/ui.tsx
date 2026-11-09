import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-on-brand hover:bg-brand-400 disabled:bg-brand-500/40',
  secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:text-zinc-500',
  danger: 'bg-red-600 text-on-brand hover:bg-red-500 disabled:bg-red-600/40',
  ghost: 'text-zinc-300 hover:bg-zinc-800 disabled:text-zinc-600',
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed ${
        size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-4 py-2'
      } ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md'; label?: string }) {
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  return (
    <span
      role="status"
      aria-label={label ?? 'Carregando'}
      className="inline-flex items-center gap-2"
    >
      <span
        className={`${dim} animate-spin rounded-full border-2 border-zinc-600 border-t-brand-400`}
      />
      {label && <span className="text-sm text-zinc-400">{label}</span>}
    </span>
  );
}

const ALERTS = {
  error: 'border-red-500/40 bg-red-500/10 text-red-200',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  info: 'border-brand-500/40 bg-brand-500/10 text-indigo-100',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: keyof typeof ALERTS;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${ALERTS[tone]}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-sm p-5 ${className}`}
    >
      {children}
    </section>
  );
}

const BADGES = {
  neutral: 'bg-zinc-800 text-zinc-300',
  live: 'bg-red-500/20 text-red-300',
  open: 'bg-emerald-500/20 text-emerald-300',
  scheduled: 'bg-brand-500/20 text-indigo-200',
  warn: 'bg-amber-500/20 text-amber-200',
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGES[tone]}`}
    >
      {children}
    </span>
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
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-200">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-50';

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-zinc-50">{children}</h1>
      {action}
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
      className={`${dim} inline-flex items-center justify-center rounded-full bg-brand-500/30 font-semibold text-indigo-100`}
    >
      {letters || '?'}
    </span>
  );
}
