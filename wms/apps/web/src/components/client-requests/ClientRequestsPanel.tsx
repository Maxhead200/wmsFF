import { ClipboardList, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchClientRequests,
  fetchClients,
  updateClientRequestStatus,
  type AuthSession,
  type AuthUser,
  type ClientRequestStatus,
  type ClientRequestSummary,
  type ClientSummary,
} from '../../lib/api';
import { ClientRequestCreateForm } from './ClientRequestCreateForm';
import './client-requests.css';
import { ClientRequestsTable } from './ClientRequestsTable';

type LoadState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T[];
  error?: string;
};

type ClientRequestsPanelProps = {
  session: AuthSession;
};

export function ClientRequestsPanel({ session }: ClientRequestsPanelProps) {
  const canRead = canUse(session.user, 'client-requests:read');
  const canWrite = canUse(session.user, 'client-requests:write');
  const canChangeStatus = canUse(session.user, 'client-requests:status');
  const [requests, setRequests] = useState<LoadState<ClientRequestSummary>>({ status: 'idle', data: [] });
  const [clients, setClients] = useState<LoadState<ClientSummary>>({ status: 'idle', data: [] });
  const [error, setError] = useState<string | null>(null);

  const visibleClients = useMemo(() => clients.data, [clients.data]);

  useEffect(() => {
    if (canRead) {
      void loadData();
    }
  }, [canRead]);

  if (!canRead) {
    return null;
  }

  async function loadData() {
    setError(null);
    setRequests((current) => ({ ...current, status: 'loading', error: undefined }));
    setClients((current) => ({ ...current, status: 'loading', error: undefined }));

    try {
      const [nextRequests, nextClients] = await Promise.all([
        fetchClientRequests(session.accessToken),
        fetchClients(session.accessToken),
      ]);
      setRequests({ status: 'ready', data: nextRequests });
      setClients({ status: 'ready', data: nextClients });
    } catch (caught) {
      const message = errorMessage(caught);
      setRequests((current) => ({ ...current, status: 'error', error: message }));
      setClients((current) => ({ ...current, status: 'error', error: message }));
    }
  }

  async function changeStatus(requestId: string, status: ClientRequestStatus) {
    setError(null);

    try {
      const updated = await updateClientRequestStatus(session.accessToken, requestId, { status });
      setRequests((current) => ({
        ...current,
        data: current.data.map((request) => (request.id === updated.id ? updated : request)),
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function acceptCreated(request: ClientRequestSummary) {
    setRequests((current) => ({
      status: 'ready',
      data: [request, ...current.data],
    }));
  }

  return (
    <section className="client-requests-panel" aria-label="Клиентские заявки">
      <div className="section-heading client-requests-panel__heading">
        <div>
          <p className="eyebrow">Client portal</p>
          <h2>Клиентские заявки</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void loadData()}
          title="Обновить"
          aria-label="Обновить заявки"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {canWrite && clients.status === 'ready' ? (
        <ClientRequestCreateForm clients={visibleClients} session={session} onCreated={acceptCreated} />
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="client-requests-panel__list">
        {renderRequests(requests, canChangeStatus, (requestId, status) => void changeStatus(requestId, status))}
      </div>
    </section>
  );
}

function renderRequests(
  state: LoadState<ClientRequestSummary>,
  canChangeStatus: boolean,
  onStatusChange: (requestId: string, status: ClientRequestStatus) => void,
) {
  if (state.status === 'idle' || (state.status === 'loading' && state.data.length === 0)) {
    return (
      <p className="panel-message">
        <ClipboardList size={22} aria-hidden="true" />
        <span>Загружаю заявки.</span>
      </p>
    );
  }

  if (state.status === 'error') {
    return <p className="panel-message panel-message--error">{state.error ?? 'Не удалось загрузить заявки.'}</p>;
  }

  if (state.data.length === 0) {
    return <p className="panel-message">Заявок пока нет.</p>;
  }

  return (
    <>
      {state.status === 'loading' ? <p className="inline-status">Обновляю заявки.</p> : null}
      <ClientRequestsTable items={state.data} canChangeStatus={canChangeStatus} onStatusChange={onStatusChange} />
    </>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить операцию.';
}
