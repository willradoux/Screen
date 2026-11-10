import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { messageFor } from '../lib/errors';
import { isAdmin, isStaff } from '../lib/moderation-rules';
import { Bare } from './Bare';
import { Loader } from './Loader';
import { StatusCard } from './StatusCard';
import { Button } from './ui';

export function FullPageSpinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <Bare center>
      <Loader label={label} />
    </Bare>
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
        <Bare center>
          <div className="mx-auto w-full max-w-sm">
            <StatusCard
              icon={state.code === 'NETWORK_ERROR' ? 'wifi_off' : 'error'}
              tone="error"
              title="Não foi possível carregar sua conta"
              headingLevel={1}
              actions={
                <Button variant="primary" onClick={() => void refresh()}>
                  Tentar de novo
                </Button>
              }
            >
              <p>{messageFor(state.code, state.message)}</p>
            </StatusCard>
          </div>
        </Bare>
      );
    case 'authenticated':
      return <Outlet />;
  }
}

function Restricted({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-sm py-16">
      <StatusCard
        icon="lock"
        tone="warning"
        title="Acesso restrito"
        actions={
          <Link to="/" className="btn btn-secondary">
            Voltar para a página principal
          </Link>
        }
      >
        <p>{text}</p>
      </StatusCard>
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
