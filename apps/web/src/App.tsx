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
const AdminMeetingsPage = lazy(() =>
  import('./pages/admin/AdminMeetingsPage').then((m) => ({ default: m.AdminMeetingsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AdminHomePage = lazy(() =>
  import('./pages/admin/AdminHomePage').then((m) => ({ default: m.AdminHomePage })),
);
const PeoplePage = lazy(() =>
  import('./pages/admin/PeoplePage').then((m) => ({ default: m.PeoplePage })),
);
const RecordingsPage = lazy(() =>
  import('./pages/admin/RecordingsPage').then((m) => ({ default: m.RecordingsPage })),
);
const StatsPage = lazy(() =>
  import('./pages/admin/StatsPage').then((m) => ({ default: m.StatsPage })),
);
const AuditPage = lazy(() =>
  import('./pages/admin/AuditPage').then((m) => ({ default: m.AuditPage })),
);

function NotFound() {
  return (
    <div className="mx-auto max-w-sm py-16">
      <StatusCard
        icon="info"
        title="Página não encontrada"
        headingLevel={1}
        actions={
          <Link to="/" className="btn btn-primary">
            Voltar para as salas
          </Link>
        }
      >
        <p>O endereço pode ter mudado ou estar errado.</p>
      </StatusCard>
    </div>
  );
}

/**
 * Rotas do Screen. `/r/:roomId` é o link que o bot manda no Discord e não pode mudar
 * (docs/frontend/README.md).
 */
export function App() {
  return (
    <>
      <Backdrop />
      <Intro />
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Pública: apresenta o Screen e ensina a usar, sem exigir login. */}
          <Route path="/features" element={<FeaturesPage />} />
          {StageLab && <Route path="/__lab" element={<StageLab />} />}
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="reunioes" element={<MeetingsPage />} />
              <Route path="preferencias" element={<PreferencesPage />} />
              <Route path="r/:roomId" element={<RoomPage />} />
              <Route element={<RequireStaff />}>
                <Route path="admin" element={<AdminHomePage />} />
              </Route>
              <Route element={<RequireAdmin />}>
                <Route path="admin/reunioes" element={<AdminMeetingsPage />} />
                <Route path="admin/pessoas" element={<PeoplePage />} />
                <Route path="admin/estatisticas" element={<StatsPage />} />
                <Route path="admin/gravacoes" element={<RecordingsPage />} />
                <Route path="admin/config" element={<SettingsPage />} />
                <Route path="admin/auditoria" element={<AuditPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
