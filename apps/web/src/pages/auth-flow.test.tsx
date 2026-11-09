import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { Layout } from '../components/Layout';
import { RequireAdmin, RequireAuth } from '../components/guards';
import { api } from '../lib/api';
import { apiError, makeUser, mockMe } from '../test/helpers';
import { LoginPage } from './LoginPage';

/** Aplicação mínima com as mesmas guardas e layout da real. */
function renderRoutes(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<p>conteúdo da home</p>} />
              <Route path="r/:roomId" element={<p>conteúdo da sala</p>} />
              <Route element={<RequireAdmin />}>
                <Route path="admin/config" element={<p>conteúdo de admin</p>} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('mostra carregando e depois o conteúdo para quem está logado', async () => {
    mockMe(makeUser());
    renderRoutes('/');
    expect(screen.getByRole('status', { name: /carregando/i })).toBeInTheDocument();
    expect(await screen.findByText('conteúdo da home')).toBeInTheDocument();
  });

  it('anônimo vai para o login e o redirect guarda de onde veio', async () => {
    mockMe(apiError(401, 'UNAUTHENTICATED'));
    renderRoutes('/r/kF3x9QzP2mT7vB1nLw0aYc');
    const link = await screen.findByRole('link', { name: /entrar com discord/i });
    expect(link).toHaveAttribute(
      'href',
      'http://localhost:3000/api/v1/auth/discord?redirect=%2Fr%2FkF3x9QzP2mT7vB1nLw0aYc',
    );
  });

  it('quem não está no servidor vê a explicação no login', async () => {
    mockMe(apiError(403, 'NOT_IN_GUILD'));
    renderRoutes('/');
    expect(await screen.findByText(/precisa estar no servidor Acelera DEV/i)).toBeInTheDocument();
  });

  it('conta bloqueada vê o aviso no login', async () => {
    mockMe(apiError(403, 'ACCOUNT_BLOCKED'));
    renderRoutes('/');
    expect(await screen.findByText(/conta está bloqueada/i)).toBeInTheDocument();
  });

  it('erro inesperado oferece tentar de novo, e funciona', async () => {
    const me = mockMe(apiError(502, 'DISCORD_UNAVAILABLE'));
    renderRoutes('/');
    expect(await screen.findByText(/Discord está indisponível/i)).toBeInTheDocument();

    me.mockResolvedValue(makeUser());
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByText('conteúdo da home')).toBeInTheDocument();
  });
});

describe('RequireAdmin e menu', () => {
  it('membro não vê os links de admin e a página de admin é barrada', async () => {
    mockMe(makeUser({ role: 'MEMBER' }));
    renderRoutes('/admin/config');
    expect(await screen.findByText(/Acesso restrito/i)).toBeInTheDocument();
    expect(screen.queryByText('conteúdo de admin')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /auditoria/i })).not.toBeInTheDocument();
  });

  it('moderador também não é admin', async () => {
    mockMe(makeUser({ role: 'MOD' }));
    renderRoutes('/admin/config');
    expect(await screen.findByText(/Acesso restrito/i)).toBeInTheDocument();
    expect(screen.getByText('Moderador')).toBeInTheDocument(); // selo do papel no cabeçalho
  });

  it('admin vê os links e a página', async () => {
    mockMe(makeUser({ role: 'ADMIN' }));
    renderRoutes('/admin/config');
    expect(await screen.findByText('conteúdo de admin')).toBeInTheDocument();
    for (const name of [/gerenciar reuniões/i, /configurações/i, /auditoria/i]) {
      expect(screen.getAllByRole('link', { name })).not.toHaveLength(0);
    }
  });
});

describe('Layout: sair', () => {
  it('chama a API, limpa a sessão e volta ao login', async () => {
    mockMe(makeUser());
    const logout = vi.spyOn(api.auth, 'logout').mockResolvedValue(undefined);
    renderRoutes('/');
    await userEvent.click(await screen.findByRole('button', { name: /sair/i }));
    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole('link', { name: /entrar com discord/i })).toBeInTheDocument();
  });

  it('mesmo se a API de logout falhar, a pessoa sai', async () => {
    mockMe(makeUser());
    vi.spyOn(api.auth, 'logout').mockRejectedValue(apiError(0, 'NETWORK_ERROR'));
    renderRoutes('/');
    await userEvent.click(await screen.findByRole('button', { name: /sair/i }));
    expect(await screen.findByRole('link', { name: /entrar com discord/i })).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it('mostra o erro que a API devolveu em ?error=', async () => {
    mockMe(apiError(401, 'UNAUTHENTICATED'));
    renderRoutes('/login?error=ACCESS_DENIED');
    expect(await screen.findByText(/cancelou a autorização/i)).toBeInTheDocument();
  });

  it('código desconhecido mostra o texto genérico, sem quebrar', async () => {
    mockMe(apiError(401, 'UNAUTHENTICATED'));
    renderRoutes('/login?error=CODIGO_NOVO');
    expect(await screen.findByText(/algo deu errado/i)).toBeInTheDocument();
  });

  it('o redirect do botão só aceita caminhos do próprio site', async () => {
    mockMe(apiError(401, 'UNAUTHENTICATED'));
    renderRoutes('/login?redirect=//evil.com');
    const link = await screen.findByRole('link', { name: /entrar com discord/i });
    expect(link.getAttribute('href')).toBe(
      'http://localhost:3000/api/v1/auth/discord?redirect=%2F',
    );
  });

  it('já logado: segue direto para onde queria ir', async () => {
    mockMe(makeUser());
    renderRoutes('/login?redirect=/r/kF3x9QzP2mT7vB1nLw0aYc');
    await waitFor(() => expect(screen.getByText('conteúdo da sala')).toBeInTheDocument());
  });
});
