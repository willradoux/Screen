import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABEL, isAdmin, isStaff } from '../lib/moderation-rules';
import { Icon, type IconName } from './Icon';
import { SetupBanners } from './SetupBanners';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './ui';
import { Wordmark } from './Wordmark';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-50'
  }`;

/** Conteúdo de um item de menu: ícone, rótulo e, no item ativo, um ponto azul (o detalhe). */
function NavContent({
  item,
  isActive,
  compact = false,
}: {
  item: NavItem;
  isActive: boolean;
  /** Barra estreita (dentro da sala): só o ícone, com o nome para leitores de tela. */
  compact?: boolean;
}) {
  return (
    <>
      <Icon name={item.icon} size="1.2rem" />
      {compact ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <>
          {item.label}
          {isActive && (
            <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />
          )}
        </>
      )}
    </>
  );
}

const tabLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.6875rem] font-medium transition-colors ${
    isActive ? 'text-brand-400' : 'text-zinc-500'
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
    <button
      type="button"
      onClick={() => {
        void prompt.prompt();
        setPrompt(null);
      }}
      className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
    >
      <Icon name="download" size="1.15rem" />
      Instalar app
    </button>
  );
}

function NavGroup({
  title,
  items,
  compact = false,
}: {
  title?: string;
  items: NavItem[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      {title && !compact && (
        <p className="px-3 pb-1 pt-5 text-xs font-medium text-zinc-500">{title}</p>
      )}
      {compact && title && <div className="mx-3 my-2 border-t border-zinc-800" />}
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          title={compact ? i.label : undefined}
          className={(st) => `${sideLink(st)} ${compact ? 'justify-center px-0' : ''}`}
        >
          {({ isActive }) => <NavContent item={i} isActive={isActive} compact={compact} />}
        </NavLink>
      ))}
    </div>
  );
}

/**
 * Estrutura do app. Computador: barra lateral fixa com a navegação e a conta. Celular: topo
 * enxuto e barra de abas embaixo, com "Mais" para o restante.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);
  // Dentro da sala o menu encolhe para uma faixa de ícones e o palco ganha a largura.
  const compact = location.pathname.startsWith('/r/');

  const main: NavItem[] = [
    { to: '/', label: 'Salas', icon: 'videocam', end: true },
    { to: '/reunioes', label: 'Reuniões', icon: 'calendar_month' },
    { to: '/features', label: 'Guia', icon: 'info' },
    { to: '/preferencias', label: 'Preferências', icon: 'settings' },
  ];
  const admin: NavItem[] = [];
  if (user && isStaff(user.role)) {
    admin.push({ to: '/admin', label: 'Painel', icon: 'dashboard', end: true });
  }
  if (user && isAdmin(user.role)) {
    admin.push(
      { to: '/admin/reunioes', label: 'Gerenciar reuniões', icon: 'campaign' },
      { to: '/admin/config', label: 'Configurações', icon: 'settings' },
      { to: '/admin/pessoas', label: 'Pessoas', icon: 'group' },
      { to: '/admin/estatisticas', label: 'Estatísticas', icon: 'bar_chart' },
      { to: '/admin/gravacoes', label: 'Gravações', icon: 'radio_button_checked' },
      { to: '/admin/auditoria', label: 'Auditoria', icon: 'history' },
    );
  }
  const all = [...main, ...admin];
  const tabs = all.length <= 5 ? all : all.slice(0, 4);
  const overflow = all.length <= 5 ? [] : all.slice(4);

  return (
    <div
      className={`min-h-dvh md:grid ${compact ? 'md:grid-cols-[4.75rem_1fr]' : 'md:grid-cols-[13.5rem_1fr]'}`}
    >
      <aside
        className={`glass sticky top-4 m-4 mr-0 hidden h-[calc(100dvh-2rem)] flex-col rounded-3xl py-5 md:flex ${compact ? 'px-2' : 'px-3'}`}
      >
        <div className={compact ? 'flex justify-center pb-4' : 'px-3 pb-4'}>
          <Wordmark size={compact ? 'sm' : undefined} />
        </div>
        <nav aria-label="Principal" className="flex-1 overflow-y-auto">
          <NavGroup items={main} compact={compact} />
          {admin.length > 0 && <NavGroup title="Administração" items={admin} compact={compact} />}
        </nav>
        <div className="space-y-1 border-t border-zinc-800 pt-3">
          {!compact && <InstallButton />}
          {user && !compact && (
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar name={user.displayName} url={user.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium text-zinc-100">{user.displayName}</p>
                <p className="text-xs text-zinc-500">{ROLE_LABEL[user.role]}</p>
              </div>
              <ThemeToggle />
            </div>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Sair"
            title={compact ? 'Sair' : undefined}
            className={`flex h-9 w-full items-center rounded-lg text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 ${compact ? 'justify-center' : 'gap-3 px-3'}`}
          >
            <Icon name="logout" size="1.15rem" />
            {!compact && 'Sair'}
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="glass sticky top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 mx-3 mt-[calc(env(safe-area-inset-top)+0.75rem)] flex items-center justify-between rounded-full px-5 py-2.5 md:hidden">
          <Wordmark size="sm" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {user && <Avatar name={user.displayName} url={user.avatarUrl} size="sm" />}
          </div>
        </header>

        <main
          className={`mx-auto w-full px-4 ${compact ? 'max-w-[110rem]' : 'max-w-5xl'} pb-36 pt-6 sm:px-6 md:px-10 md:pb-14 md:pt-10`}
        >
          <SetupBanners />
          <Outlet />
        </main>

        <nav
          aria-label="Navegação"
          className="glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto max-w-md overflow-hidden rounded-[2rem] md:hidden"
        >
          {more && (
            <div className="pop-in space-y-0.5 border-b border-zinc-800/60 p-2">
              {overflow.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={sideLink}>
                  {({ isActive }) => <NavContent item={i} isActive={isActive} />}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sair"
                className="flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium text-zinc-400 hover:bg-zinc-800/60"
              >
                <Icon name="logout" size="1.15rem" />
                Sair
              </button>
            </div>
          )}
          <div className="mx-auto flex max-w-xl">
            {tabs.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={tabLink}>
                <Icon name={i.icon} size="1.4rem" />
                <span className="truncate">{i.label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              aria-expanded={more}
              aria-label="Mais opções"
              onClick={() => setMore((v) => !v)}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.6875rem] font-medium text-zinc-500"
            >
              <Icon name="menu_open" size="1.4rem" />
              Mais
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
