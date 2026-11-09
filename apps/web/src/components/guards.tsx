import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { messageFor } from '../lib/errors';
import { isAdmin, isStaff } from '../lib/moderation-rules';
import { Loader } from './Loader';
import { Alert, Button } from './ui';

export function FullPageSpinner({ label = 'Carregando' }: { label?: string }) {
  return <Loader label={label} />;
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

function Restricted({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16">
      <Alert tone="warning" title="Acesso restrito">
        {text}
      </Alert>
      <Link
        to="/"
        className="inline-block rounded-lg bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
      >
        Voltar para a página principal
      </Link>
    </div>
  );
}

/** Páginas só de administradores. Quem não é admin vê o motivo e volta para o início (o backend também recusa). */
export function RequireAdmin() {
  const { user } = useAuth();
  if (!user || !isAdmin(user.role)) {
    return <Restricted text="Esta página é só para administradores do servidor." />;
  }
  return <Outlet />;
}

/** Painel: administradores e moderadores. Quem não tem o cargo não entra e é mandado de volta ao início. */
export function RequireStaff() {
  const { user } = useAuth();
  if (!user || !isStaff(user.role)) {
    return (
      <Restricted text="O painel é só para quem tem cargo de administrador ou moderador no servidor." />
    );
  }
  return <Outlet />;
}
