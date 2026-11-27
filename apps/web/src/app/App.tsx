import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Backdrop } from './Backdrop';
import { Intro } from './Intro';
import { Layout } from './Layout';
import { StatusCard } from '../shared/ui/StatusCard';
import { FullPageSpinner, RequireAdmin, RequireAuth, RequireStaff, ToLanding } from './guards';
import { LANDING_URL } from '../shared/lib/config';
import { HomePage } from '../features/rooms/HomePage';
import { FeaturesPage } from '../features/guide/FeaturesPage';
import { GuidePage } from '../features/guide/GuidePage';
import { LoginPage } from '../features/auth/LoginPage';
import { MeetingsPage } from '../features/meetings/MeetingsPage';
import { PreferencesPage } from '../features/preferences/PreferencesPage';

// A sala puxa o LiveKit e o Socket.IO (a maior parte do código) e a administração só
// serve para admins: carregam sob demanda, para login e lista de salas abrirem rápido.
// Laboratório do palco: só em desenvolvimento (o import some do build de produção).
const StageLab = import.meta.env.DEV ? lazy(() => import('../dev/StageLab')) : null;
const loadRoomPage = () => import('../features/call/RoomPage');
const RoomPage = lazy(() => loadRoomPage().then((m) => ({ default: m.RoomPage })));

/**
 * Baixa o código da sala em segundo plano quando o navegador fica ocioso, para entrar numa sala
 * ser na hora (sem esperar o download do LiveKit). Não faz isso com "economia de dados" ligada.
 */
function usePrefetchRoom() {
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    // No celular, preparar a sala em segundo plano disputa o processador com a página aberta.
    if (window.matchMedia?.('(hover: none)').matches) return;
    const go = () => void loadRoomPage().catch(() => undefined);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(go, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(go, 2500);
    return () => window.clearTimeout(id);
  }, []);
}
const AdminMeetingsPage = lazy(() =>
  import('../features/admin/AdminMeetingsPage').then((m) => ({ default: m.AdminMeetingsPage })),
);
const SettingsPage = lazy(() =>
  import('../features/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AdminHomePage = lazy(() =>
  import('../features/admin/AdminHomePage').then((m) => ({ default: m.AdminHomePage })),
);
const PeoplePage = lazy(() =>
  import('../features/admin/PeoplePage').then((m) => ({ default: m.PeoplePage })),
);
// A apresentação é pesada em CSS: carrega só quando alguém abre /sobre.
const LandingPage = lazy(() =>
  import('../features/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const RecordingsPage = lazy(() =>
  import('../features/admin/RecordingsPage').then((m) => ({ default: m.RecordingsPage })),
);
const StatsPage = lazy(() =>
  import('../features/admin/StatsPage').then((m) => ({ default: m.StatsPage })),
);
const AuditPage = lazy(() =>
  import('../features/admin/AuditPage').then((m) => ({ default: m.AuditPage })),
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
  usePrefetchRoom();
  return (
    <>
      <Backdrop />
      <Intro />
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Pública: apresenta o Screen e ensina a usar, sem exigir login. */}
          <Route path="/features" element={<FeaturesPage />} />
          {/* Pública: a página de apresentação do Screen. */}
          <Route path="/sobre" element={LANDING_URL ? <ToLanding /> : <LandingPage />} />
          {StageLab && <Route path="/__lab" element={<StageLab />} />}
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="reunioes" element={<MeetingsPage />} />
              <Route path="preferencias" element={<PreferencesPage />} />
              <Route path="guia" element={<GuidePage />} />
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
