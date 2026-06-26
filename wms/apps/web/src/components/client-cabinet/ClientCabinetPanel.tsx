import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchBillingCharges,
  fetchBillingInvoiceDocument,
  fetchBillingInvoices,
  fetchClientRequests,
  fetchClients,
  fetchStockBalances,
  type AuthSession,
  type BillingChargeSummary,
  type BillingInvoiceDocument,
  type BillingInvoiceSummary,
  type ClientRequestSummary,
  type ClientSummary,
  type StockBalance,
} from '../../lib/api';
import { BillingInvoiceDocumentPreview } from '../billing/BillingInvoiceDocumentPreview';
import './client-cabinet.css';
import { ClientCabinetMetrics } from './ClientCabinetMetrics';
import { ClientCabinetTables } from './ClientCabinetTables';

type CabinetData = {
  clients: ClientSummary[];
  stock: StockBalance[];
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
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
};

export function ClientCabinetPanel({ session }: ClientCabinetPanelProps) {
  const [state, setState] = useState<CabinetState>({ status: 'idle', data: emptyData });
  const [selectedClientId, setSelectedClientId] = useState('');
  const [documentPreview, setDocumentPreview] = useState<BillingInvoiceDocument | null>(null);
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
    };
  }, [selectedClientId, state.data]);

  async function loadData() {
    setDocumentError(null);
    setState((current) => ({ ...current, status: 'loading', error: undefined }));

    try {
      // Русский комментарий: кабинет клиента собирает read-only витрину из существующих API,
      // чтобы клиент видел только данные, отфильтрованные серверным client scope.
      const [clients, stock, requests, invoices, charges] = await Promise.all([
        fetchClients(session.accessToken),
        fetchStockBalances(session.accessToken),
        fetchClientRequests(session.accessToken),
        fetchBillingInvoices(session.accessToken),
        fetchBillingCharges(session.accessToken),
      ]);

      setState({
        status: 'ready',
        data: { clients, stock, requests, invoices, charges },
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
            onOpenInvoiceDocument={(invoice) => void openInvoiceDocument(invoice)}
          />
        </>
      ) : null}

      {documentPreview ? (
        <BillingInvoiceDocumentPreview document={documentPreview} onClose={() => setDocumentPreview(null)} />
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
