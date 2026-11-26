import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { Alert } from '../components/ui';
import { LogoMark } from '../components/Wordmark';
import { tintStyle } from '../lib/personColor';
import { api } from '../lib/api';
import { messageFor } from '../lib/errors';
import { safeRedirect } from '../lib/format';

/**
 * Login (design premium, tela 04): à esquerda uma call de mentira nas cores das pessoas; à
 * direita o logo, a frase e o único botão. A API termina
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
    <div className="login2">
      {/* Uma call de mentira: seis pessoas nas cores pastel, uma falando (contorno lima). */}
      <div className="login2-art" aria-hidden="true">
        <ul className="login2-grid">
          {MOSAIC.map((t, i) => (
            <li key={i} style={tintStyle(t)} data-speaking={i === 1 || undefined}>
              <span />
            </li>
          ))}
        </ul>
      </div>

      <main className="login2-side">
        <div className="login2-body rise">
          <LogoMark className="login2-logo" />
          <h1 className="login2-title">
            {toRoom ? 'Falta só entrar.' : 'As calls do Acelera DEV, no navegador.'}
          </h1>
          <p className="login2-sub">
            {toRoom
              ? 'Entre com o Discord e você volta direto para a sala.'
              : 'Tela, câmera e voz junto com o Discord, sem instalar nada. Funciona no PC e no celular.'}
          </p>
          {code && (
            <Alert tone="error" title="Não foi possível entrar">
              {messageFor(code)}
            </Alert>
          )}
          <a href={api.loginUrl(redirect)} className="login2-cta">
            Entrar com Discord
            <Icon name="arrow_forward" size="1.2rem" />
          </a>
          <p className="login2-note">
            Sem senha nova: você entra com a sua conta do Discord. Nas lives, também precisa estar
            na call de voz.
          </p>
        </div>
        <footer className="login2-foot">
          <span>Acelera DEV</span>
          <span className="flex gap-5">
            <Link to="/features">Como funciona</Link>
            <Link to="/sobre">Conhecer o screen</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}

/** As seis pessoas do mosaico: lilás, ciano, marrom, azul, verde e grafite. */
const MOSAIC = [
  { hue: 280, sat: 0.32 },
  { hue: 190, sat: 0.55 },
  { hue: 14, sat: 0.24 },
  { hue: 218, sat: 0.45 },
  { hue: 112, sat: 0.22 },
  { hue: 240, sat: 0.06 },
];
