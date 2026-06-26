import { Boxes, Database, Printer, Smartphone, Upload, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AccessAdminPanel } from './components/access/AccessAdminPanel';
import { AuthPanel } from './components/AuthPanel';
import { DashboardDataPanel } from './components/DashboardDataPanel';
import { DirectoryPanel } from './components/directories/DirectoryPanel';
import { ImportPanel } from './components/imports/ImportPanel';
import { LogisticsQuotePanel } from './components/logistics/LogisticsQuotePanel';
import { ModuleBoard } from './components/ModuleBoard';
import { UserBar } from './components/UserBar';
import { WarehouseOpsPanel } from './components/warehouse/WarehouseOpsPanel';
import { fetchMe, type AuthSession } from './lib/api';
import { mvpModules } from './lib/modules';
import { clearStoredSession, loadStoredSession, storeSession } from './lib/session';

const metrics = [
  { label: 'Остатки', value: 'WMS ledger', icon: Database },
  { label: 'Клиенты', value: '20+ ready', icon: UsersRound },
  { label: 'Короба', value: 'box-first', icon: Boxes },
  { label: 'Импорт', value: 'XLSX preview', icon: Upload },
  { label: 'ТСД', value: 'Kotlin online', icon: Smartphone },
  { label: 'Печать', value: 'TSC TSPL', icon: Printer },
];

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [isRestoring, setRestoring] = useState(Boolean(session));

  useEffect(() => {
    let isActive = true;

    async function restore() {
      if (!session?.accessToken) {
        setRestoring(false);
        return;
      }

      try {
        const user = await fetchMe(session.accessToken);
        if (isActive) {
          const nextSession = { ...session, user };
          setSession(nextSession);
          storeSession(nextSession);
        }
      } catch {
        clearStoredSession();
        if (isActive) {
          setSession(null);
        }
      } finally {
        if (isActive) {
          setRestoring(false);
        }
      }
    }

    void restore();

    return () => {
      isActive = false;
    };
  }, []);

  function acceptSession(nextSession: AuthSession) {
    setSession(nextSession);
    storeSession(nextSession);
  }

  function logout() {
    clearStoredSession();
    setSession(null);
  }

  if (isRestoring) {
    return (
      <main className="auth-shell">
        <section className="auth-panel auth-panel--loading" aria-live="polite">
          <p className="eyebrow">LOGOFF Fulfillment</p>
          <h1>Проверка сессии</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return <AuthPanel onSession={acceptSession} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LOGOFF Fulfillment</p>
          <h1>WMS операционный контур</h1>
        </div>
        <button className="primary-button" type="button">Новая приёмка</button>
      </header>

      <UserBar user={session.user} onLogout={logout} />

      <section className="metrics-grid" aria-label="Состояние MVP">
        {metrics.map((metric) => (
          <article className="metric-tile" key={metric.label}>
            <metric.icon size={20} aria-hidden="true" />
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          </article>
        ))}
      </section>

      <AccessAdminPanel session={session} />

      <DirectoryPanel session={session} />

      <ImportPanel session={session} />

      <LogisticsQuotePanel session={session} />

      <WarehouseOpsPanel session={session} />

      <DashboardDataPanel session={session} />

      <ModuleBoard modules={mvpModules} />
    </main>
  );
}
