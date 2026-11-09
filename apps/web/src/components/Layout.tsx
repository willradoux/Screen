import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABEL, isAdmin, isStaff } from '../lib/moderation-rules';
import { Icon, type IconName } from './Icon';
import { SetupBanners } from './SetupBanners';
import { ThemeToggle } from './ThemeToggle';
import { Avatar, Badge, Button } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const desktopLink = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-500/15 text-brand-300'
      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
  }`;

const tabLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[0.7rem] font-medium transition-colors ${
    isActive ? 'text-brand-300' : 'text-zinc-500'
  }`;

/** Evento do navegador que oferece instalar o app (Chrome e Android). */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  if (!prompt) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        void prompt.prompt();
        setPrompt(null);
      }}
    >
      <Icon name="download" /> Instalar app
    </Button>
  );
}

/**
 * Cabeçalho (computador) e barra de abas embaixo (celular), com o conteúdo no meio.
 * Links de painel só para quem tem cargo.
 */
export function Layout() {
  const { user, logout } = useAuth();

  const items: NavItem[] = [
    { to: '/', label: 'Salas', icon: 'videocam', end: true },
    { to: '/reunioes', label: 'Reuniões', icon: 'calendar_month' },
  ];
  if (user && isStaff(user.role)) {
    items.push({ to: '/admin', label: 'Painel', icon: 'dashboard', end: true });
  }
  if (user && isAdmin(user.role)) {
    items.push(
      { to: '/admin/reunioes', label: 'Gerenciar reuniões', icon: 'campaign' },
      { to: '/admin/config', label: 'Configurações', icon: 'settings' },
      { to: '/admin/pessoas', label: 'Pessoas', icon: 'group' },
      { to: '/admin/estatisticas', label: 'Estatísticas', icon: 'bar_chart' },
      { to: '/admin/gravacoes', label: 'Gravações', icon: 'radio_button_checked' },
      { to: '/admin/auditoria', label: 'Auditoria', icon: 'history' },
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-lg font-bold text-zinc-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-on-brand">
              <Icon name="play_arrow" size="1.3rem" />
            </span>
            Screem
          </Link>

          <nav
            aria-label="Principal"
            className="ml-4 hidden flex-1 flex-wrap items-center gap-1 md:flex"
          >
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={desktopLink}>
                <Icon name={i.icon} size="1.15rem" />
                {i.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:block">
              <InstallButton />
            </span>
            <ThemeToggle />
            {user && (
              <>
                <Avatar name={user.displayName} url={user.avatarUrl} size="sm" />
                <div className="hidden text-right leading-tight lg:block">
                  <p className="text-sm font-medium text-zinc-100">{user.displayName}</p>
                  {user.role !== 'MEMBER' && (
                    <Badge tone="scheduled">{ROLE_LABEL[user.role]}</Badge>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  aria-label="Sair"
                  className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <Icon name="logout" size="1.2rem" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 md:py-8 md:pb-10">
        <SetupBanners />
        <Outlet />
      </main>

      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-zinc-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {items.slice(0, 5).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={tabLink}>
              <Icon name={i.icon} size="1.5rem" />
              <span className="truncate">{i.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
