import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { SplitPanels } from '../components/SplitPanels';
import { AceleraMark } from '../components/AceleraMark';
import { Icon, type IconName } from '../components/Icon';
import { ThemeToggle } from '../components/ThemeToggle';
import { Alert } from '../components/ui';
import { Creature } from '../components/Creature';
import { LogoMark } from '../components/Wordmark';
import { api } from '../lib/api';
import { messageFor } from '../lib/errors';
import { safeRedirect } from '../lib/format';

/**
 * Login: o logo e uma frase direto sobre o fundo, e um vidro com o único botão. A API termina
 * o fluxo do Discord redirecionando para cá com `?error=<CODE>` quando algo dá errado
 * (docs/backend/autenticacao.md). Quem veio de um link de sala volta direto para ela.
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
  const toRoom = redirect.startsWith('/r/');

  return (
    <SplitPanels
      center
      sideLabel="Screen"
      side={
        <>
          <Link to="/" aria-label="Screen — início" className="hub-brand hub-brand-top">
            <LogoMark className="h-8" />
            <span>screen</span>
          </Link>

          <div className="login-side-intro mt-2 flex-1 space-y-4 px-2">
            <p className="text-[15px] font-semibold leading-snug text-zinc-50">
              Lives e reuniões da comunidade, direto no navegador.
            </p>
            <ul className="space-y-2.5 text-[13px] text-zinc-400">
              {[
                ['videocam', 'Tela, câmera e voz nas calls do Discord'],
                ['calendar_month', 'Reuniões com aviso e contagem regressiva'],
                ['lock', 'Só entra quem está no servidor'],
              ].map(([icon, text]) => (
                <li key={text} className="flex items-start gap-2.5">
                  <Icon name={icon as IconName} size="1.05rem" className="mt-0.5 text-brand-300" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="hub-footer">
            <AceleraMark className="mx-2 mb-3 h-[14px] w-auto self-start text-zinc-300" />
            <Link to="/features" className="hub-link">
              <Icon name="info" size="1.15rem" />
              <span className="flex-1">Como funciona</span>
            </Link>
            <div className="flex items-center justify-between px-3 pt-1">
              <span className="text-[11px] text-zinc-500">Tema</span>
              <ThemeToggle withLabel />
            </div>
          </div>
        </>
      }
    >
      <div className="login-main">
        {/* O bichinho, a frase e o único botão. */}
        <div className="login-hero rise">
          <Creature className="loader-pet h-16" />
          <div>
            <h1 className="login-title">{toRoom ? 'Falta só entrar' : 'Entre no Screen'}</h1>
            <p className="login-sub">
              {toRoom
                ? 'Entre com o Discord e você volta direto para a sala.'
                : 'Use sua conta do Discord. Não precisa criar senha.'}
            </p>
          </div>
        </div>

        <div className="rise rise-2 login-action">
          <h2 className="sr-only">Entrar</h2>
          {code && (
            <Alert tone="error" title="Não foi possível entrar">
              {messageFor(code)}
            </Alert>
          )}
          <a href={api.loginUrl(redirect)} className="btn btn-primary btn-lg w-full">
            Entrar com Discord
            <Icon name="arrow_forward" size="1.1rem" />
          </a>
          <p className="text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-300">Lives:</strong> você também precisa estar no canal de
            voz da call. <strong className="text-zinc-300">Reuniões:</strong> basta estar no
            servidor.
          </p>
        </div>

        {/* O que dá para fazer: três cards, no estilo das capas das salas. */}
        <section aria-labelledby="login-what" className="rise rise-3 login-what">
          <h2 id="login-what" className="login-what-title">
            O que tem no Screen
          </h2>
          <ul className="login-cards">
            {(
              [
                [
                  'videocam',
                  'Lives nas calls',
                  'Tela, câmera e voz junto do canal de voz do Discord.',
                ],
                [
                  'calendar_month',
                  'Reuniões',
                  'Com aviso no servidor, lembretes e contagem regressiva.',
                ],
                ['front_hand', 'Pedir a palavra', 'Levante a mão e a moderação libera sua vez.'],
              ] as [IconName, string, string][]
            ).map(([icon, title, text]) => (
              <li key={title} className="login-card">
                <span aria-hidden="true" className="login-card-cover">
                  <Icon name={icon} size="1.8rem" />
                </span>
                <span className="login-card-title">{title}</span>
                <span className="login-card-text">{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SplitPanels>
  );
}
