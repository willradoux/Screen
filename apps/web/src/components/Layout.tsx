import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABEL, isAdmin, isStaff } from '../lib/moderation-rules';
import { Avatar, Badge, Button } from './ui';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-100'
  }`;

/** Cabeçalho com navegação (links de admin só para admin) e o conteúdo da página. */
export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight text-white">
            Screem
            <span className="ml-2 text-xs font-medium text-brand-300">Acelera DEV</span>
          </Link>

          <nav aria-label="Principal" className="flex flex-1 flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Salas
            </NavLink>
            <NavLink to="/reunioes" className={linkClass}>
              Reuniões
            </NavLink>
            {user && isStaff(user.role) && (
              <NavLink to="/admin" end className={linkClass}>
                Painel
              </NavLink>
            )}
            {user && isAdmin(user.role) && (
              <>
                <NavLink to="/admin/reunioes" className={linkClass}>
                  Gerenciar reuniões
                </NavLink>
                <NavLink to="/admin/config" className={linkClass}>
                  Configurações
                </NavLink>
                <NavLink to="/admin/pessoas" className={linkClass}>
                  Pessoas
                </NavLink>
                <NavLink to="/admin/auditoria" className={linkClass}>
                  Auditoria
                </NavLink>
              </>
            )}
          </nav>

          {user && (
            <div className="flex items-center gap-3">
              <Avatar name={user.displayName} url={user.avatarUrl} size="sm" />
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium text-zinc-100">{user.displayName}</p>
                {user.role !== 'MEMBER' && <Badge tone="scheduled">{ROLE_LABEL[user.role]}</Badge>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => void logout()}>
                Sair
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
