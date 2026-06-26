import { ChevronRight, LogOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AccessAdminPanel } from './components/access/AccessAdminPanel';
import { AuthPanel } from './components/AuthPanel';
import { BillingPanel } from './components/billing/BillingPanel';
import { ClientRequestsPanel } from './components/client-requests/ClientRequestsPanel';
import { DashboardDataPanel } from './components/DashboardDataPanel';
import { DirectoryPanel } from './components/directories/DirectoryPanel';
import { ImportPanel } from './components/imports/ImportPanel';
import { LogisticsQuotePanel } from './components/logistics/LogisticsQuotePanel';
import { PrintPanel } from './components/print/PrintPanel';
import { WarehouseOpsPanel } from './components/warehouse/WarehouseOpsPanel';
import { fetchMe, type AuthSession } from './lib/api';
import { clearStoredSession, loadStoredSession, storeSession } from './lib/session';
import { canOpenWorkspace, workspaceNav, type WorkspaceId, type WorkspaceNavItem } from './lib/workspaces';

const statusLabel = {
  ready: 'готово',
  'in-progress': 'в работе',
  planned: 'план',
};

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [isRestoring, setRestoring] = useState(Boolean(session));
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<WorkspaceId>('overview');

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

  const availableWorkspaces = useMemo(() => {
    if (!session) {
      return [];
    }

    return workspaceNav.filter((item) => canOpenWorkspace(session.user, item));
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!availableWorkspaces.some((item) => item.id === activeWorkspaceId)) {
      setActiveWorkspaceId('overview');
    }
  }, [activeWorkspaceId, availableWorkspaces, session]);

  function acceptSession(nextSession: AuthSession) {
    setSession(nextSession);
    storeSession(nextSession);
    setActiveWorkspaceId('overview');
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

  const activeWorkspace = availableWorkspaces.find((item) => item.id === activeWorkspaceId) ?? availableWorkspaces[0];

  return (
    <div className="app-layout">
      <aside className="app-sidebar" aria-label="Навигация WMS">
        <div className="app-sidebar__brand">
          <span>LOGOFF</span>
          <strong>WMS</strong>
        </div>

        <nav className="workspace-nav">
          {availableWorkspaces.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeWorkspace.id;

            return (
              <button
                className={isActive ? 'active' : ''}
                key={item.id}
                type="button"
                onClick={() => setActiveWorkspaceId(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace-shell">
        <header className="workspace-header">
          <div className="workspace-header__title">
            <p className="eyebrow">{activeWorkspace.eyebrow}</p>
            <h1>{activeWorkspace.title}</h1>
          </div>

          <div className="workspace-user">
            <div>
              <strong>{session.user.name}</strong>
              <span>{session.user.email}</span>
            </div>
            <span className="status status--ready">{session.user.clientScopeMode}</span>
            <button className="icon-button" type="button" onClick={logout} title="Выйти" aria-label="Выйти">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="workspace-content" aria-label={activeWorkspace.title}>
          <div className="workspace-content__intro">
            <p>{activeWorkspace.description}</p>
            <span className={`status status--${activeWorkspace.status}`}>{statusLabel[activeWorkspace.status]}</span>
          </div>

          {renderWorkspace(activeWorkspace.id, session, availableWorkspaces, setActiveWorkspaceId)}
        </section>

        <footer className="workspace-footer">
          <span>LOGOFF Fulfillment WMS</span>
          <span>{session.user.roleCodes.join(', ') || 'NO ROLE'}</span>
        </footer>
      </main>
    </div>
  );
}

function renderWorkspace(
  activeWorkspaceId: WorkspaceId,
  session: AuthSession,
  availableWorkspaces: WorkspaceNavItem[],
  setActiveWorkspaceId: (id: WorkspaceId) => void,
) {
  switch (activeWorkspaceId) {
    case 'access':
      return <AccessAdminPanel session={session} />;
    case 'directories':
      return <DirectoryPanel session={session} />;
    case 'imports':
      return <ImportPanel session={session} />;
    case 'logistics':
      return <LogisticsQuotePanel session={session} />;
    case 'warehouse':
      return <WarehouseOpsPanel session={session} />;
    case 'requests':
      return <ClientRequestsPanel session={session} />;
    case 'billing':
      return <BillingPanel session={session} />;
    case 'print':
      return <PrintPanel session={session} />;
    case 'data':
      return <DashboardDataPanel session={session} />;
    case 'overview':
    default:
      return <WorkspaceOverview items={availableWorkspaces} onOpen={setActiveWorkspaceId} />;
  }
}

function WorkspaceOverview({ items, onOpen }: { items: WorkspaceNavItem[]; onOpen: (id: WorkspaceId) => void }) {
  return (
    <div className="workspace-tiles">
      {items
        .filter((item) => item.id !== 'overview')
        .map((item) => {
          const Icon = item.icon;

          return (
            <button className="workspace-tile" key={item.id} type="button" onClick={() => onOpen(item.id)}>
              <span className="workspace-tile__icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          );
        })}
    </div>
  );
}
