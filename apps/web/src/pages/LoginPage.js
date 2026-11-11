import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { SplitPanels } from '../components/SplitPanels';
import { AceleraMark } from '../components/AceleraMark';
import { Icon } from '../components/Icon';
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
    if (state.status === 'authenticated')
        return _jsx(Navigate, { to: redirect, replace: true });
    const denied = state.status === 'denied' ? state.code : null;
    const code = errorCode ?? denied;
    const toRoom = redirect.startsWith('/r/');
    return (_jsx(SplitPanels, { center: true, sideLabel: "Screen", side: _jsxs(_Fragment, { children: [_jsxs(Link, { to: "/", "aria-label": "Screen \u2014 in\u00EDcio", className: "hub-brand hub-brand-top", children: [_jsx(LogoMark, { className: "h-8" }), _jsx("span", { children: "screen" })] }), _jsxs("div", { className: "login-side-intro mt-2 flex-1 space-y-4 px-2", children: [_jsx("p", { className: "text-[15px] font-semibold leading-snug text-zinc-50", children: "Lives e reuni\u00F5es da comunidade, direto no navegador." }), _jsx("ul", { className: "space-y-2.5 text-[13px] text-zinc-400", children: [
                                ['videocam', 'Tela, câmera e voz nas calls do Discord'],
                                ['calendar_month', 'Reuniões com aviso e contagem regressiva'],
                                ['lock', 'Só entra quem está no servidor'],
                            ].map(([icon, text]) => (_jsxs("li", { className: "flex items-start gap-2.5", children: [_jsx(Icon, { name: icon, size: "1.05rem", className: "mt-0.5 text-brand-300" }), text] }, text))) })] }), _jsxs("div", { className: "hub-footer", children: [_jsx(AceleraMark, { className: "mx-2 mb-3 h-[14px] w-auto self-start text-zinc-300" }), _jsxs(Link, { to: "/features", className: "hub-link", children: [_jsx(Icon, { name: "info", size: "1.15rem" }), _jsx("span", { className: "flex-1", children: "Como funciona" })] }), _jsxs("div", { className: "flex items-center justify-between px-3 pt-1", children: [_jsx("span", { className: "text-[11px] text-zinc-500", children: "Tema" }), _jsx(ThemeToggle, { withLabel: true })] })] })] }), children: _jsxs("div", { className: "login-main", children: [_jsxs("div", { className: "login-hero rise", children: [_jsx(Creature, { className: "loader-pet h-16" }), _jsxs("div", { children: [_jsx("h1", { className: "login-title", children: toRoom ? 'Falta só entrar' : 'Entre no Screen' }), _jsx("p", { className: "login-sub", children: toRoom
                                        ? 'Entre com o Discord e você volta direto para a sala.'
                                        : 'Use sua conta do Discord. Não precisa criar senha.' })] })] }), _jsxs("div", { className: "rise rise-2 login-action", children: [_jsx("h2", { className: "sr-only", children: "Entrar" }), code && (_jsx(Alert, { tone: "error", title: "N\u00E3o foi poss\u00EDvel entrar", children: messageFor(code) })), _jsxs("a", { href: api.loginUrl(redirect), className: "btn btn-primary btn-lg w-full", children: ["Entrar com Discord", _jsx(Icon, { name: "arrow_forward", size: "1.1rem" })] }), _jsxs("p", { className: "text-xs leading-relaxed text-zinc-500", children: [_jsx("strong", { className: "text-zinc-300", children: "Lives:" }), " voc\u00EA tamb\u00E9m precisa estar no canal de voz da call. ", _jsx("strong", { className: "text-zinc-300", children: "Reuni\u00F5es:" }), " basta estar no servidor."] })] }), _jsxs("section", { "aria-labelledby": "login-what", className: "rise rise-3 login-what", children: [_jsx("h2", { id: "login-what", className: "login-what-title", children: "O que tem no Screen" }), _jsx("ul", { className: "login-cards", children: [
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
                            ].map(([icon, title, text]) => (_jsxs("li", { className: "login-card", children: [_jsx("span", { "aria-hidden": "true", className: "login-card-cover", children: _jsx(Icon, { name: icon, size: "1.8rem" }) }), _jsx("span", { className: "login-card-title", children: title }), _jsx("span", { className: "login-card-text", children: text })] }, title))) })] })] }) }));
}
