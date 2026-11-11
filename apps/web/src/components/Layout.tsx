import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABEL, isAdmin, isStaff } from '../lib/moderation-rules';
import { Icon, type IconName } from './Icon';
import { ImmersiveContext } from './immersive';
import { Loader } from './Loader';
import { SetupBanners } from './SetupBanners';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './ui';
import { LogoMark } from './Wordmark';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

/** Evento do navegador que oferece instalar o app (Chrome e Android). */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  return {
    available: prompt !== null,
    install: () => {
      void prompt?.prompt();
      setPrompt(null);
    },
  };
}

/** Mesma regra do NavLink: exato quando `end`, prefixo quando é uma seção. */
function isItemActive(item: NavItem, pathname: string) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function HubLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isItemActive(item, pathname);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-current={active ? 'page' : undefined}
      data-active={active ? 'true' : 'false'}
      className="hub-link"
    >
      <Icon name={item.icon} size="1.15rem" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active && <span aria-hidden="true" className="hub-dot" />}
    </NavLink>
  );
}

/**
 * Estrutura das páginas antes da chamada: a mesma do Flazo (menu lateral com as páginas,
 * "Administração" para quem tem acesso e, embaixo, a pessoa, o tema e Sair), com a nossa UI —
 * o menu é uma peça preta flutuando sobre o fundo do tema e o conteúdo ocupa o resto da tela.
 * No celular o menu vira uma gaveta, aberta pelo botão do topo. Dentro da sala, a chamada
 * assume a tela inteira e o menu some.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const [immersive, setImmersive] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  // Menu da conta: fecha com Esc (e o foco volta para o cartão) ou clicando fora.
  useEffect(() => {
    if (!accountOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAccountOpen(false);
      accountButtonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!footerRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [accountOpen]);
  const { available: canInstall, install } = useInstallPrompt();
  const location = useLocation();
  useEffect(() => {
    setDrawer(false);
    setAccountOpen(false);
  }, [location.pathname]);
  // Na chamada o fundo do tema volta a aparecer; fora dela o fundo é liso.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-call', immersive);
    return () => document.documentElement.removeAttribute('data-call');
  }, [immersive]);

  const items: NavItem[] = [
    { to: '/', label: 'Salas', icon: 'videocam', end: true },
    { to: '/reunioes', label: 'Reuniões', icon: 'calendar_month' },
    { to: '/preferencias', label: 'Preferências', icon: 'tune' },
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

  return (
    <ImmersiveContext.Provider value={setImmersive}>
      <div className={immersive ? '' : 'hub'}>
        {!immersive && (
          <>
            <a href="#conteudo" className="skip-link">
              Pular para o conteúdo
            </a>

            {/* Celular: topo enxuto com o botão que abre o menu. */}
            <header className="hub-mobilebar surface">
              <NavLink to="/" aria-label="Screen — início" className="hub-brand">
                <LogoMark className="h-7" />
                <span>screen</span>
              </NavLink>
              <button
                type="button"
                aria-label={drawer ? 'Fechar menu' : 'Abrir menu'}
                aria-expanded={drawer}
                aria-controls="hub-menu"
                onClick={() => setDrawer((v) => !v)}
                className="icon-button"
              >
                <Icon name={drawer ? 'close' : 'menu_open'} size="1.3rem" />
              </button>
            </header>
            {drawer && (
              <div aria-hidden="true" className="hub-scrim" onClick={() => setDrawer(false)} />
            )}

            <aside id="hub-menu" className="hub-sidebar surface" data-open={drawer || undefined}>
              <NavLink to="/" aria-label="Screen — início" className="hub-brand hub-brand-top">
                <LogoMark className="h-8" />
                <span>screen</span>
              </NavLink>

              <nav aria-label="Navegação principal" className="hub-nav">
                {items.map((item) => (
                  <HubLink key={item.to} item={item} pathname={location.pathname} />
                ))}

                {admin.length > 0 && (
                  <>
                    <p className="hub-group">Administração</p>
                    {admin.map((item) => (
                      <HubLink key={item.to} item={item} pathname={location.pathname} />
                    ))}
                  </>
                )}
              </nav>

              <div className="hub-footer" ref={footerRef}>
                {/* O Guia fica à parte, embaixo: ele abre a página de ajuda (fora das telas de uso). */}
                <HubLink
                  item={{ to: '/features', label: 'Guia', icon: 'info' }}
                  pathname={location.pathname}
                />
                {/* O menu da conta flutua logo acima do cartão (não empurra o menu): sai de dentro
                    dele com mola e os itens sobem um a um; fechado, fica fora do teclado e do
                    leitor de tela. */}
                <div
                  id="hub-account-menu"
                  className="unfold account-pop"
                  data-open={accountOpen || undefined}
                  inert={!accountOpen}
                  aria-hidden={!accountOpen || undefined}
                >
                  <div className="unfold-inner">
                    <div className="hub-account-menu" role="group" aria-label="Sua conta">
                      <NavLink to="/preferencias" className="hub-link">
                        <Icon name="tune" size="1.15rem" />
                        <span>Preferências</span>
                      </NavLink>
                      {canInstall && (
                        <button type="button" onClick={install} className="hub-link">
                          <Icon name="download" size="1.15rem" />
                          <span>Instalar app</span>
                        </button>
                      )}
                      <ThemeToggle variant="menu" />
                      <button
                        type="button"
                        onClick={() => void logout()}
                        className="hub-link hub-logout"
                      >
                        <Icon name="logout" size="1.15rem" />
                        <span>Sair</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Sua conta"
                    ref={accountButtonRef}
                    aria-expanded={accountOpen}
                    aria-controls="hub-account-menu"
                    onClick={() => setAccountOpen((v) => !v)}
                    className="hub-account"
                  >
                    {user ? (
                      <Avatar name={user.displayName} url={user.avatarUrl} size="sm" />
                    ) : (
                      <Icon name="person" size="1.2rem" />
                    )}
                    {user && (
                      <span className="min-w-0 text-left leading-tight">
                        <span className="block truncate text-[13px] font-medium text-white">
                          {user.displayName}
                        </span>
                        <span className="block text-[11px] text-zinc-500">
                          {ROLE_LABEL[user.role]}
                        </span>
                      </span>
                    )}
                  </button>
                  <Icon
                    name={accountOpen ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                    size="1.1rem"
                    className="mr-2 text-zinc-500"
                  />
                </div>
              </div>
            </aside>
          </>
        )}

        <main id="conteudo" tabIndex={-1} className={immersive ? '' : 'hub-main surface'}>
          {!immersive && <SetupBanners />}
          <Suspense fallback={<Loader />}>
            {/* Cada tela entra com movimento (a chave troca a cada rota). */}
            <div key={location.pathname} className={immersive ? '' : 'page-enter'}>
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </ImmersiveContext.Provider>
  );
}
