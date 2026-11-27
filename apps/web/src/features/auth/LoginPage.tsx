import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Icon } from '../../shared/ui/Icon';
import { Alert } from '../../shared/ui/ui';
import { LogoMark } from '../../shared/ui/Wordmark';
import { tintStyle } from '../../shared/lib/personColor';
import { api } from '../../shared/lib/api';
import { messageFor } from '../../shared/lib/errors';
import { safeRedirect } from '../../shared/lib/format';
import { isRoomPath } from '../../shared/lib/paths';

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
  const toRoom = isRoomPath(redirect);

  return (
    <div className="login2">
      {/* Uma call do Screen com o pessoal da comunidade: cada um na sua cor, o Marujo falando. */}
      <div className="login2-art" aria-hidden="true">
        <ul className="login2-grid">
          {CALL.map((p) => (
            <li key={p.name} style={tintStyle(p.tint)} data-speaking={p.speaking || undefined}>
              <span className="login2-face">{p.name.slice(0, 1)}</span>
              <span className="login2-name">
                {p.speaking && <i className="login2-dot" />}
                {p.name}
              </span>
              <span className="login2-mic" data-on={p.mic || undefined}>
                <Icon name={p.mic ? 'mic' : 'mic_off'} size="1rem" />
              </span>
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

/** Quem aparece na call do login: gente da comunidade Acelera DEV. */
const CALL = [
  { name: 'PC', tint: { hue: 112, sat: 0.22 }, mic: true, speaking: false },
  { name: 'Marujo', tint: { hue: 280, sat: 0.32 }, mic: true, speaking: true },
  { name: 'Scharp', tint: { hue: 14, sat: 0.24 }, mic: false, speaking: false },
  { name: 'Flazo', tint: { hue: 218, sat: 0.45 }, mic: false, speaking: false },
  { name: 'Will', tint: { hue: 190, sat: 0.55 }, mic: true, speaking: false },
  { name: 'Duds', tint: { hue: 6, sat: 0.5 }, mic: false, speaking: false },
];
