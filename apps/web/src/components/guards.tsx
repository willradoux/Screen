import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { messageFor } from '../lib/errors';
import { isAdmin } from '../lib/moderation-rules';
import { Alert, Button, Spinner } from './ui';

export function FullPageSpinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

/** Só passa quem está logado. Anônimos vão para o login e voltam para onde estavam. */
export function RequireAuth() {
  const { state, refresh } = useAuth();
  const location = useLocation();

  switch (state.status) {
    case 'loading':
      return <FullPageSpinner />;
    case 'anonymous': {
      const redirect = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/login?redirect=${redirect}`} replace />;
    }
    case 'denied':
      return <Navigate to={`/login?error=${state.code}`} replace />;
    case 'error':
      return (
        <div className="mx-auto max-w-md space-y-4 py-16">
          <Alert tone="error" title="Não foi possível carregar sua conta">
            {messageFor(state.code, state.message)}
          </Alert>
          <Button variant="primary" onClick={() => void refresh()}>
            Tentar de novo
          </Button>
        </div>
      );
    case 'authenticated':
      return <Outlet />;
  }
}

/** Páginas de administração. Quem não é admin vê um aviso (o backend também recusa). */
export function RequireAdmin() {
  const { user } = useAuth();
  if (!user || !isAdmin(user.role)) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Alert tone="warning" title="Acesso restrito">
          Esta página é só para administradores do servidor.
        </Alert>
      </div>
    );
  }
  return <Outlet />;
}
