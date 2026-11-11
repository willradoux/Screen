import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABEL, isAdmin, isStaff } from '../lib/moderation-rules';
import { Icon } from './Icon';
import { ImmersiveContext } from './immersive';
import { Loader } from './Loader';
import { SetupBanners } from './SetupBanners';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './ui';
import { LogoMark } from './Wordmark';
function useInstallPrompt() {
    const [prompt, setPrompt] = useState(null);
    useEffect(() => {
        const onPrompt = (e) => {
            e.preventDefault();
            setPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        return () => window.removeEventListener('beforeinstallprompt', onPrompt);
    }, []);
    return {
        available: prompt !== null,
        install: () => {
            void prompt?.prompt();
            setPrompt(null);
        },
    };
}
/** Mesma regra do NavLink: exato quando `end`, prefixo quando é uma seção. */
function isItemActive(item, pathname) {
    if (item.end)
        return pathname === item.to;
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
function HubLink({ item, pathname }) {
    const active = isItemActive(item, pathname);
    return (_jsxs(NavLink, { to: item.to, end: item.end, "aria-current": active ? 'page' : undefined, "data-active": active ? 'true' : 'false', className: "hub-link", children: [_jsx(Icon, { name: item.icon, size: "1.15rem" }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: item.label }), active && _jsx("span", { "aria-hidden": "true", className: "hub-dot" })] }));
}
/**
 * Estrutura das páginas antes da chamada: a mesma do Flazo (menu lateral com as páginas,
 * "Administração" para quem tem acesso e, embaixo, a pessoa, o tema e Sair), com a nossa UI —
 * o menu é uma peça preta flutuando sobre o fundo do tema e o conteúdo ocupa o resto da tela.
 * No celular o menu vira uma gaveta, aberta pelo botão do topo. Dentro da sala, a chamada
 * assume a tela inteira e o menu some.
 */
export function Layout() {
    const { user, logout } = useAuth();
    const [immersive, setImmersive] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const footerRef = useRef(null);
    const accountButtonRef = useRef(null);
    // Menu da conta: fecha com Esc (e o foco volta para o cartão) ou clicando fora.
    useEffect(() => {
        if (!accountOpen)
            return;
        const onKey = (e) => {
            if (e.key !== 'Escape')
                return;
            setAccountOpen(false);
            accountButtonRef.current?.focus();
        };
        const onDown = (e) => {
            if (!footerRef.current?.contains(e.target))
                setAccountOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onDown);
        };
    }, [accountOpen]);
    const { available: canInstall, install } = useInstallPrompt();
    const location = useLocation();
    useEffect(() => {
        setDrawer(false);
        setAccountOpen(false);
    }, [location.pathname]);
    // Na chamada o fundo do tema volta a aparecer; fora dela o fundo é liso.
    useEffect(() => {
        document.documentElement.toggleAttribute('data-call', immersive);
        return () => document.documentElement.removeAttribute('data-call');
    }, [immersive]);
    const items = [
        { to: '/', label: 'Salas', icon: 'videocam', end: true },
        { to: '/reunioes', label: 'Reuniões', icon: 'calendar_month' },
        { to: '/preferencias', label: 'Preferências', icon: 'tune' },
    ];
    const admin = [];
    if (user && isStaff(user.role)) {
        admin.push({ to: '/admin', label: 'Painel', icon: 'dashboard', end: true });
    }
    if (user && isAdmin(user.role)) {
        admin.push({ to: '/admin/reunioes', label: 'Gerenciar reuniões', icon: 'campaign' }, { to: '/admin/config', label: 'Configurações', icon: 'settings' }, { to: '/admin/pessoas', label: 'Pessoas', icon: 'group' }, { to: '/admin/estatisticas', label: 'Estatísticas', icon: 'bar_chart' }, { to: '/admin/gravacoes', label: 'Gravações', icon: 'radio_button_checked' }, { to: '/admin/auditoria', label: 'Auditoria', icon: 'history' });
    }
    return (_jsx(ImmersiveContext.Provider, { value: setImmersive, children: _jsxs("div", { className: immersive ? '' : 'hub', children: [!immersive && (_jsxs(_Fragment, { children: [_jsx("a", { href: "#conteudo", className: "skip-link", children: "Pular para o conte\u00FAdo" }), _jsxs("header", { className: "hub-mobilebar surface", children: [_jsxs(NavLink, { to: "/", "aria-label": "Screen \u2014 in\u00EDcio", className: "hub-brand", children: [_jsx(LogoMark, { className: "h-7" }), _jsx("span", { children: "screen" })] }), _jsx("button", { type: "button", "aria-label": drawer ? 'Fechar menu' : 'Abrir menu', "aria-expanded": drawer, "aria-controls": "hub-menu", onClick: () => setDrawer((v) => !v), className: "icon-button", children: _jsx(Icon, { name: drawer ? 'close' : 'menu_open', size: "1.3rem" }) })] }), drawer && (_jsx("div", { "aria-hidden": "true", className: "hub-scrim", onClick: () => setDrawer(false) })), _jsxs("aside", { id: "hub-menu", className: "hub-sidebar surface", "data-open": drawer || undefined, children: [_jsxs(NavLink, { to: "/", "aria-label": "Screen \u2014 in\u00EDcio", className: "hub-brand hub-brand-top", children: [_jsx(LogoMark, { className: "h-8" }), _jsx("span", { children: "screen" })] }), _jsxs("nav", { "aria-label": "Navega\u00E7\u00E3o principal", className: "hub-nav", children: [items.map((item) => (_jsx(HubLink, { item: item, pathname: location.pathname }, item.to))), admin.length > 0 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "hub-group", children: "Administra\u00E7\u00E3o" }), admin.map((item) => (_jsx(HubLink, { item: item, pathname: location.pathname }, item.to)))] }))] }), _jsxs("div", { className: "hub-footer", ref: footerRef, children: [_jsx(HubLink, { item: { to: '/features', label: 'Guia', icon: 'info' }, pathname: location.pathname }), _jsx("div", { id: "hub-account-menu", className: "unfold account-pop", "data-open": accountOpen || undefined, inert: !accountOpen, "aria-hidden": !accountOpen || undefined, children: _jsx("div", { className: "unfold-inner", children: _jsxs("div", { className: "hub-account-menu", role: "group", "aria-label": "Sua conta", children: [_jsxs(NavLink, { to: "/preferencias", className: "hub-link", children: [_jsx(Icon, { name: "tune", size: "1.15rem" }), _jsx("span", { children: "Prefer\u00EAncias" })] }), canInstall && (_jsxs("button", { type: "button", onClick: install, className: "hub-link", children: [_jsx(Icon, { name: "download", size: "1.15rem" }), _jsx("span", { children: "Instalar app" })] })), _jsx(ThemeToggle, { variant: "menu" }), _jsxs("button", { type: "button", onClick: () => void logout(), className: "hub-link hub-logout", children: [_jsx(Icon, { name: "logout", size: "1.15rem" }), _jsx("span", { children: "Sair" })] })] }) }) }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsxs("button", { type: "button", "aria-label": "Sua conta", ref: accountButtonRef, "aria-expanded": accountOpen, "aria-controls": "hub-account-menu", onClick: () => setAccountOpen((v) => !v), className: "hub-account", children: [user ? (_jsx(Avatar, { name: user.displayName, url: user.avatarUrl, size: "sm" })) : (_jsx(Icon, { name: "person", size: "1.2rem" })), user && (_jsxs("span", { className: "min-w-0 text-left leading-tight", children: [_jsx("span", { className: "block truncate text-[13px] font-medium text-white", children: user.displayName }), _jsx("span", { className: "block text-[11px] text-zinc-500", children: ROLE_LABEL[user.role] })] }))] }), _jsx(Icon, { name: accountOpen ? 'keyboard_arrow_down' : 'keyboard_arrow_up', size: "1.1rem", className: "mr-2 text-zinc-500" })] })] })] })] })), _jsxs("main", { id: "conteudo", tabIndex: -1, className: immersive ? '' : 'hub-main surface', children: [!immersive && _jsx(SetupBanners, {}), _jsx(Suspense, { fallback: _jsx(Loader, {}), children: _jsx("div", { className: immersive ? '' : 'page-enter', children: _jsx(Outlet, {}) }, location.pathname) })] })] }) }));
}
