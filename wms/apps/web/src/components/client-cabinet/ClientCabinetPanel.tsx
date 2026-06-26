import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchBillingCharges,
  fetchBillingInvoiceDocument,
  fetchBillingInvoices,
  downloadClientRequestFile,
  fetchClientNotifications,
  fetchClientRequestDocument,
  fetchClientRequests,
  fetchClients,
  fetchStockBalances,
  markClientNotificationRead,
  uploadClientRequestFile,
  type AuthSession,
  type BillingChargeSummary,
  type BillingInvoiceDocument,
  type BillingInvoiceSummary,
  type ClientNotificationSummary,
  type ClientRequestFileSummary,
  type ClientRequestDocument,
  type ClientRequestSummary,
  type ClientSummary,
  type StockBalance,
} from '../../lib/api';
import { BillingInvoiceDocumentPreview } from '../billing/BillingInvoiceDocumentPreview';
import { ClientRequestDocumentPreview } from '../client-requests/ClientRequestDocumentPreview';
import './client-cabinet.css';
import { ClientCabinetMetrics } from './ClientCabinetMetrics';
import { ClientCabinetTables } from './ClientCabinetTables';

type CabinetData = {
  clients: ClientSummary[];
  stock: StockBalance[];
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
  notifications: ClientNotificationSummary[];
};

type CabinetState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: CabinetData;
  error?: string;
};

type ClientCabinetPanelProps = {
  session: AuthSession;
};

const emptyData: CabinetData = {
  clients: [],
  stock: [],
  requests: [],
  invoices: [],
  charges: [],
  notifications: [],
};

export function ClientCabinetPanel({ session }: ClientCabinetPanelProps) {
  const [state, setState] = useState<CabinetState>({ status: 'idle', data: emptyData });
  const [selectedClientId, setSelectedClientId] = useState('');
  const [documentPreview, setDocumentPreview] = useState<BillingInvoiceDocument | null>(null);
  const [requestDocumentPreview, setRequestDocumentPreview] = useState<ClientRequestDocument | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || state.data.clients.length === 0) {
      return;
    }

    if (!selectedClientId || !state.data.clients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(state.data.clients[0].id);
    }
  }, [selectedClientId, state]);

  const view = useMemo(() => {
    const clientId = selectedClientId || state.data.clients[0]?.id || '';

    return {
      client: state.data.clients.find((client) => client.id === clientId) ?? null,
      stock: sortByDate(
        state.data.stock.filter((balance) => !clientId || balance.clientId === clientId),
        (balance) => balance.updatedAt,
      ),
      requests: sortByDate(
        state.data.requests.filter((request) => !clientId || request.clientId === clientId),
        (request) => request.createdAt,
      ),
      invoices: sortByDate(
        state.data.invoices.filter((invoice) => !clientId || invoice.clientId === clientId),
        (invoice) => invoice.createdAt,
      ),
      charges: sortByDate(
        state.data.charges.filter((charge) => !clientId || charge.clientId === clientId),
        (charge) => charge.serviceDate,
      ),
      notifications: sortByDate(
        state.data.notifications.filter((notification) => !clientId || notification.clientId === clientId),
        (notification) => notification.createdAt,
      ),
    };
  }, [selectedClientId, state.data]);

  async function loadData() {
    setDocumentError(null);
    setState((current) => ({ ...current, status: 'loading', error: undefined }));

    try {
      // Русский комментарий: кабинет клиента собирает read-only витрину из существующих API,
      // чтобы клиент видел только данные, отфильтрованные серверным client scope.
      const [clients, stock, requests, invoices, charges, notifications] = await Promise.all([
        fetchClients(session.accessToken),
        fetchStockBalances(session.accessToken),
        fetchClientRequests(session.accessToken),
        fetchBillingInvoices(session.accessToken),
        fetchBillingCharges(session.accessToken),
        fetchClientNotifications(session.accessToken),
      ]);

      setState({
        status: 'ready',
        data: { clients, stock, requests, invoices, charges, notifications },
      });
    } catch (caught) {
      setState((current) => ({
        ...current,
        status: 'error',
        error: caught instanceof Error ? caught.message : 'Не удалось загрузить кабинет клиента.',
      }));
    }
  }

  async function openInvoiceDocument(invoice: BillingInvoiceSummary) {
    setDocumentError(null);

    try {
      setDocumentPreview(await fetchBillingInvoiceDocument(session.accessToken, invoice.id));
    } catch (caught) {
      setDocumentError(caught instanceof Error ? caught.message : 'Не удалось открыть документ счета.');
    }
  }

  async function openRequestDocument(request: ClientRequestSummary) {
    setDocumentError(null);

    try {
      setRequestDocumentPreview(await fetchClientRequestDocument(session.accessToken, request.id));
    } catch (caught) {
      setDocumentError(caught instanceof Error ? caught.message : 'Не удалось открыть документ заявки.');
    }
  }

  async function uploadRequestFile(request: ClientRequestSummary, file: File) {
    const uploadedFile = await uploadClientRequestFile(session.accessToken, request.id, file);
    const notifications = await fetchClientNotifications(session.accessToken);

    setState((current) => ({
      ...current,
      data: {
        ...current.data,
        notifications,
        requests: current.data.requests.map((item) =>
          item.id === request.id ? { ...item, files: [uploadedFile, ...item.files] } : item,
        ),
      },
    }));
  }

  async function downloadRequestFile(request: ClientRequestSummary, file: ClientRequestFileSummary) {
    const blob = await downloadClientRequestFile(session.accessToken, request.id, file.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function markNotificationRead(notification: ClientNotificationSummary) {
    const updated = await markClientNotificationRead(session.accessToken, notification.id);

    setState((current) => ({
      ...current,
      data: {
        ...current.data,
        notifications: current.data.notifications.map((item) => (item.id === updated.id ? updated : item)),
      },
    }));
  }

  return (
    <section className="client-cabinet-panel" aria-label="Кабинет клиента">
      <div className="section-heading client-cabinet-panel__heading">
        <div>
          <p className="eyebrow">Client workspace</p>
          <h2>Кабинет клиента</h2>
        </div>
        <div className="client-cabinet-panel__actions">
          {state.data.clients.length > 1 ? (
            <label className="client-cabinet-client-select">
              <span>Клиент</span>
              <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                {state.data.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.code} · {client.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadData()}
            title="Обновить"
            aria-label="Обновить кабинет клиента"
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {state.status === 'idle' || (state.status === 'loading' && state.data.clients.length === 0) ? (
        <p className="panel-message">Загружаю кабинет.</p>
      ) : null}

      {state.status === 'error' ? <p className="panel-message panel-message--error">{state.error}</p> : null}
      {documentError ? <p className="form-error">{documentError}</p> : null}

      {state.status !== 'error' && state.data.clients.length === 0 && state.status !== 'loading' ? (
        <p className="panel-message">Нет доступных клиентов.</p>
      ) : null}

      {view.client ? (
        <>
          {state.status === 'loading' ? <p className="inline-status">Обновляю кабинет.</p> : null}

          <div className="client-cabinet-client">
            <div>
              <span>{view.client.code}</span>
              <strong>{view.client.name}</strong>
            </div>
            <span className="status status--ready">{view.client.status}</span>
          </div>

          <ClientCabinetMetrics stock={view.stock} requests={view.requests} invoices={view.invoices} />
          <ClientCabinetTables
            stock={view.stock}
            requests={view.requests}
            invoices={view.invoices}
            charges={view.charges}
            notifications={view.notifications}
            onOpenRequestDocument={(request) => void openRequestDocument(request)}
            onOpenInvoiceDocument={(invoice) => void openInvoiceDocument(invoice)}
            onUploadRequestFile={uploadRequestFile}
            onDownloadRequestFile={downloadRequestFile}
            onMarkNotificationRead={(notification) => void markNotificationRead(notification)}
          />
        </>
      ) : null}

      {documentPreview ? (
        <BillingInvoiceDocumentPreview document={documentPreview} onClose={() => setDocumentPreview(null)} />
      ) : null}

      {requestDocumentPreview ? (
        <ClientRequestDocumentPreview document={requestDocumentPreview} onClose={() => setRequestDocumentPreview(null)} />
      ) : null}
    </section>
  );
}

function sortByDate<T>(items: T[], getValue: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(getValue(left) ?? '').getTime();
    const rightTime = new Date(getValue(right) ?? '').getTime();
    return rightTime - leftTime;
  });
}
