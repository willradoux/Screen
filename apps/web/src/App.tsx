import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { FullPageSpinner, RequireAdmin, RequireAuth } from './components/guards';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MeetingsPage } from './pages/MeetingsPage';

// A sala puxa o LiveKit e o Socket.IO (a maior parte do código) e a administração só
// serve para admins: carregam sob demanda, para login e lista de salas abrirem rápido.
const RoomPage = lazy(() => import('./pages/RoomPage').then((m) => ({ default: m.RoomPage })));
const AdminMeetingsPage = lazy(() =>
  import('./pages/admin/AdminMeetingsPage').then((m) => ({ default: m.AdminMeetingsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AuditPage = lazy(() =>
  import('./pages/admin/AuditPage').then((m) => ({ default: m.AuditPage })),
);

function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-bold text-white">Página não encontrada</h1>
      <Link to="/" className="text-brand-300 underline">
        Voltar para as salas
      </Link>
    </div>
  );
}

/**
 * Rotas do Screem. `/r/:roomId` é o link que o bot manda no Discord e não pode mudar
 * (docs/frontend/README.md).
 */
export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="reunioes" element={<MeetingsPage />} />
            <Route path="r/:roomId" element={<RoomPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="admin/reunioes" element={<AdminMeetingsPage />} />
              <Route path="admin/config" element={<SettingsPage />} />
              <Route path="admin/auditoria" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
