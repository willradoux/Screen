import { jsx as _jsx } from "react/jsx-runtime";
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { messageFor } from '../lib/errors';
import { isAdmin, isStaff } from '../lib/moderation-rules';
import { Bare } from './Bare';
import { Loader } from './Loader';
import { StatusCard } from './StatusCard';
import { Button } from './ui';
export function FullPageSpinner({ label = 'Carregando' }) {
    return (_jsx(Bare, { center: true, children: _jsx(Loader, { label: label }) }));
}
/** Só passa quem está logado. Anônimos vão para o login e voltam para onde estavam. */
export function RequireAuth() {
    const { state, refresh } = useAuth();
    const location = useLocation();
    switch (state.status) {
        case 'loading':
            return _jsx(FullPageSpinner, {});
        case 'anonymous': {
            const redirect = encodeURIComponent(location.pathname + location.search);
            return _jsx(Navigate, { to: `/login?redirect=${redirect}`, replace: true });
        }
        case 'denied':
            return _jsx(Navigate, { to: `/login?error=${state.code}`, replace: true });
        case 'error':
            return (_jsx(Bare, { center: true, children: _jsx("div", { className: "mx-auto w-full max-w-sm", children: _jsx(StatusCard, { icon: state.code === 'NETWORK_ERROR' ? 'wifi_off' : 'error', tone: "error", title: "N\u00E3o foi poss\u00EDvel carregar sua conta", headingLevel: 1, actions: _jsx(Button, { variant: "primary", onClick: () => void refresh(), children: "Tentar de novo" }), children: _jsx("p", { children: messageFor(state.code, state.message) }) }) }) }));
        case 'authenticated':
            return _jsx(Outlet, {});
    }
}
function Restricted({ text }) {
    return (_jsx("div", { className: "mx-auto max-w-sm py-16", children: _jsx(StatusCard, { icon: "lock", tone: "warning", title: "Acesso restrito", actions: _jsx(Link, { to: "/", className: "btn btn-secondary", children: "Voltar para a p\u00E1gina principal" }), children: _jsx("p", { children: text }) }) }));
}
/** Páginas só de administradores. Quem não é admin vê o motivo e volta para o início (o backend também recusa). */
export function RequireAdmin() {
    const { user } = useAuth();
    if (!user || !isAdmin(user.role)) {
        return _jsx(Restricted, { text: "Esta p\u00E1gina \u00E9 s\u00F3 para administradores do servidor." });
    }
    return _jsx(Outlet, {});
}
/** Painel: administradores e moderadores. Quem não tem o cargo não entra e é mandado de volta ao início. */
export function RequireStaff() {
    const { user } = useAuth();
    if (!user || !isStaff(user.role)) {
        return (_jsx(Restricted, { text: "O painel \u00E9 s\u00F3 para quem tem cargo de administrador ou moderador no servidor." }));
    }
    return _jsx(Outlet, {});
}
