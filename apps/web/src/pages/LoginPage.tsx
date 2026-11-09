import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ThemeToggle } from '../components/ThemeToggle';
import { Alert } from '../components/ui';
import { Wordmark } from '../components/Wordmark';
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
    <div className="min-h-dvh md:grid md:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-8 md:border-b-0 md:border-r md:px-14 md:py-12">
        <div className="flex items-center justify-between">
          <Wordmark size="md" />
          <span className="md:hidden">
            <ThemeToggle />
          </span>
        </div>
        <div className="my-14 max-w-md space-y-4 md:my-0">
          <h1 className="text-3xl font-semibold text-zinc-50 md:text-4xl">
            Transmita tela e câmera com a comunidade.
          </h1>
          <p className="text-base text-zinc-400">
            Lives nas calls do Discord e reuniões agendadas, direto no navegador. Sem instalar nada.
          </p>
        </div>
        <Link
          to="/features"
          className="text-sm font-medium text-brand-300 underline underline-offset-2"
        >
          Ver o que o Screem faz e como usar
        </Link>
      </section>

      <main className="flex flex-col items-center justify-center px-6 py-14">
        <div className="hidden w-full max-w-sm justify-end pb-10 md:flex">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-zinc-50">Entrar</h2>
            <p className="text-sm text-zinc-400">
              Use sua conta do Discord. Só entra quem está no servidor.
            </p>
          </div>

          {code && (
            <Alert tone="error" title="Não foi possível entrar">
              {messageFor(code)}
            </Alert>
          )}

          <a
            href={api.loginUrl(redirect)}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-400"
          >
            Entrar com Discord
          </a>

          <p className="text-xs text-zinc-500">
            Nas lives, você também precisa estar no canal de voz. Nas reuniões, não.
          </p>
        </div>
      </main>
    </div>
  );
}
