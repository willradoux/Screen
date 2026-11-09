import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Alert, Card } from '../components/ui';
import { api } from '../lib/api';
import { messageFor } from '../lib/errors';
import { safeRedirect } from '../lib/format';

/**
 * Tela de login. A API termina o fluxo do Discord redirecionando para cá com
 * `?error=<CODE>` quando algo dá errado (docs/backend/autenticacao.md).
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const { state } = useAuth();
  const redirect = safeRedirect(params.get('redirect'));
  const errorCode = params.get('error');

  // Já logado: segue para onde queria ir.
  if (state.status === 'authenticated') return <Navigate to={redirect} replace />;

  const denied = state.status === 'denied' ? state.code : null;
  const code = errorCode ?? denied;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">Screem</h1>
          <p className="mt-1 text-sm text-brand-300">Acelera DEV</p>
        </div>

        <p className="text-zinc-400">
          Transmita sua tela e câmera com a comunidade e participe das reuniões do servidor. Entre
          com sua conta do Discord para continuar.
        </p>

        {code && (
          <Alert tone="error" title="Não foi possível entrar">
            {messageFor(code)}
          </Alert>
        )}

        <a
          href={api.loginUrl(redirect)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 font-semibold text-on-brand transition-colors hover:bg-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          Entrar com Discord
        </a>

        <p className="text-xs text-zinc-500">
          Só entra quem está no servidor. Nas lives, você também precisa estar no canal de voz.
        </p>
        <Link to="/features" className="text-sm font-medium text-brand-300 underline">
          Ver o que o Screem faz e como usar
        </Link>
      </Card>
    </div>
  );
}
