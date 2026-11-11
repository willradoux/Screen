import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Backdrop } from './components/Backdrop';
import { Intro } from './components/Intro';
import { Layout } from './components/Layout';
import { StatusCard } from './components/StatusCard';
import { FullPageSpinner, RequireAdmin, RequireAuth, RequireStaff } from './components/guards';
import { HomePage } from './pages/HomePage';
import { FeaturesPage } from './pages/FeaturesPage';
import { LoginPage } from './pages/LoginPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { PreferencesPage } from './pages/PreferencesPage';
// A sala puxa o LiveKit e o Socket.IO (a maior parte do código) e a administração só
// serve para admins: carregam sob demanda, para login e lista de salas abrirem rápido.
// Laboratório do palco: só em desenvolvimento (o import some do build de produção).
const StageLab = import.meta.env.DEV ? lazy(() => import('./dev/StageLab')) : null;
const RoomPage = lazy(() => import('./pages/RoomPage').then((m) => ({ default: m.RoomPage })));
const AdminMeetingsPage = lazy(() => import('./pages/admin/AdminMeetingsPage').then((m) => ({ default: m.AdminMeetingsPage })));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AdminHomePage = lazy(() => import('./pages/admin/AdminHomePage').then((m) => ({ default: m.AdminHomePage })));
const PeoplePage = lazy(() => import('./pages/admin/PeoplePage').then((m) => ({ default: m.PeoplePage })));
const RecordingsPage = lazy(() => import('./pages/admin/RecordingsPage').then((m) => ({ default: m.RecordingsPage })));
const StatsPage = lazy(() => import('./pages/admin/StatsPage').then((m) => ({ default: m.StatsPage })));
const AuditPage = lazy(() => import('./pages/admin/AuditPage').then((m) => ({ default: m.AuditPage })));
function NotFound() {
    return (_jsx("div", { className: "mx-auto max-w-sm py-16", children: _jsx(StatusCard, { icon: "info", title: "P\u00E1gina n\u00E3o encontrada", headingLevel: 1, actions: _jsx(Link, { to: "/", className: "btn btn-primary", children: "Voltar para as salas" }), children: _jsx("p", { children: "O endere\u00E7o pode ter mudado ou estar errado." }) }) }));
}
/**
 * Rotas do Screen. `/r/:roomId` é o link que o bot manda no Discord e não pode mudar
 * (docs/frontend/README.md).
 */
export function App() {
    return (_jsxs(_Fragment, { children: [_jsx(Backdrop, {}), _jsx(Intro, {}), _jsx(Suspense, { fallback: _jsx(FullPageSpinner, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/features", element: _jsx(FeaturesPage, {}) }), StageLab && _jsx(Route, { path: "/__lab", element: _jsx(StageLab, {}) }), _jsx(Route, { element: _jsx(RequireAuth, {}), children: _jsxs(Route, { element: _jsx(Layout, {}), children: [_jsx(Route, { index: true, element: _jsx(HomePage, {}) }), _jsx(Route, { path: "reunioes", element: _jsx(MeetingsPage, {}) }), _jsx(Route, { path: "preferencias", element: _jsx(PreferencesPage, {}) }), _jsx(Route, { path: "r/:roomId", element: _jsx(RoomPage, {}) }), _jsx(Route, { element: _jsx(RequireStaff, {}), children: _jsx(Route, { path: "admin", element: _jsx(AdminHomePage, {}) }) }), _jsxs(Route, { element: _jsx(RequireAdmin, {}), children: [_jsx(Route, { path: "admin/reunioes", element: _jsx(AdminMeetingsPage, {}) }), _jsx(Route, { path: "admin/pessoas", element: _jsx(PeoplePage, {}) }), _jsx(Route, { path: "admin/estatisticas", element: _jsx(StatsPage, {}) }), _jsx(Route, { path: "admin/gravacoes", element: _jsx(RecordingsPage, {}) }), _jsx(Route, { path: "admin/config", element: _jsx(SettingsPage, {}) }), _jsx(Route, { path: "admin/auditoria", element: _jsx(AuditPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] }) })] }) })] }));
}
