import { Ban, CheckCircle2, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  deleteClient,
  fetchBillingCharges,
  fetchBillingInvoiceDocument,
  fetchBillingInvoices,
  fetchBillingReconciliation,
  fetchBillingServiceHistory,
  downloadClientRequestFile,
  fetchClientNotifications,
  fetchClientNotificationPreferences,
  fetchClientRequestDocument,
  fetchClientRequests,
  fetchClientRequestTimeline,
  fetchClients,
  fetchStockBalances,
  updateClient,
  updateClientStatus,
  markClientNotificationRead,
  updateClientNotificationPreference,
  uploadClientRequestFile,
  createClientRequestComment,
  type AuthSession,
  type BillingChargeSummary,
  type BillingInvoiceDocument,
  type BillingInvoiceSummary,
  type BillingReconciliation,
  type BillingReconciliationClient,
  type BillingReconciliationInvoice,
  type BillingServiceHistory,
  type BillingServiceHistoryGroup,
  type ClientNotificationPreferenceSummary,
  type ClientNotificationSummary,
  type ClientRequestFileSummary,
  type ClientRequestDocument,
  type ClientRequestSummary,
  type ClientRequestTimeline,
  type ClientKind,
  type ClientSummary,
  type ClientStatus,
  type StockBalance,
  type UpdateClientPayload,
} from '../../lib/api';
import { BillingInvoiceDocumentPreview } from '../billing/BillingInvoiceDocumentPreview';
import { ClientRequestDocumentPreview } from '../client-requests/ClientRequestDocumentPreview';
import './client-cabinet.css';
import { ClientCabinetExports } from './ClientCabinetExports';
import { ClientCabinetMetrics, type ClientCabinetMetricTarget } from './ClientCabinetMetrics';
import { ClientCabinetTables } from './ClientCabinetTables';
import { ClientCabinetFilterPresets } from './ClientCabinetFilterPresets';
import {
  ClientCabinetFilters,
  emptyClientCabinetFilters,
  type ClientCabinetFiltersValue,
} from './ClientCabinetFilters';
import { formatCabinetMoney, formatCabinetNumber } from './clientCabinetFormat';
import { ClientRequestTimelineModal } from './ClientRequestTimelineModal';

type CabinetData = {
  clients: ClientSummary[];
  stock: StockBalance[];
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
  reconciliation: BillingReconciliation | null;
  serviceHistory: BillingServiceHistory | null;
  notifications: ClientNotificationSummary[];
  notificationPreferences: ClientNotificationPreferenceSummary[];
};

type CabinetState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: CabinetData;
  error?: string;
};

type ClientCabinetPanelProps = {
  session: AuthSession;
};

type ClientCabinetClientSummary = {
  client: ClientSummary;
  skuCount: number;
  totalQuantity: number;
  activeRequests: number;
  debtRub: number;
};

type ClientManagementForm = {
  clientKind: ClientKind;
  name: string;
  legalName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
  actualAddress: string;
  phone: string;
  email: string;
  bankName: string;
  bankBik: string;
  bankAccount: string;
  correspondentAccount: string;
};

const clientKindOptions: Array<{ value: ClientKind; label: string }> = [
  { value: 'LEGAL_ENTITY', label: 'Юридическое лицо' },
  { value: 'INDIVIDUAL_ENTREPRENEUR', label: 'Индивидуальный предприниматель' },
  { value: 'SELF_EMPLOYED', label: 'Самозанятый' },
  { value: 'INDIVIDUAL', label: 'Физическое лицо' },
];

const emptyData: CabinetData = {
  clients: [],
  stock: [],
  requests: [],
  invoices: [],
  charges: [],
  reconciliation: null,
  serviceHistory: null,
  notifications: [],
  notificationPreferences: [],
};

export function ClientCabinetPanel({ session }: ClientCabinetPanelProps) {
  const [state, setState] = useState<CabinetState>({ status: 'idle', data: emptyData });
  const [selectedClientId, setSelectedClientId] = useState('');
  const [documentPreview, setDocumentPreview] = useState<BillingInvoiceDocument | null>(null);
  const [requestDocumentPreview, setRequestDocumentPreview] = useState<ClientRequestDocument | null>(null);
  const [requestTimeline, setRequestTimeline] = useState<ClientRequestTimeline | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ClientCabinetFiltersValue>(emptyClientCabinetFilters);
  const [stockSearch, setStockSearch] = useState('');
  const [activeSection, setActiveSection] = useState<ClientCabinetMetricTarget>('skus');
  const [editingClientId, setEditingClientId] = useState('');
  const [managementForm, setManagementForm] = useState<ClientManagementForm | null>(null);
  const [managementMessage, setManagementMessage] = useState('');
  const [managementError, setManagementError] = useState('');
  const [isManagingClient, setManagingClient] = useState(false);

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

    const stock = sortByDate(
      state.data.stock.filter((balance) => !clientId || balance.clientId === clientId),
      (balance) => balance.updatedAt,
    );
    const visibleStock = stock.filter((balance) => stockMatchesSearch(balance, stockSearch, isInternalUser(session.user)));
    const requests = sortByDate(
      state.data.requests
        .filter((request) => !clientId || request.clientId === clientId)
        .filter((request) => requestMatchesFilters(request, filters)),
      (request) => request.createdAt,
    );
    const invoices = sortByDate(
      state.data.invoices
        .filter((invoice) => !clientId || invoice.clientId === clientId)
        .filter((invoice) => invoiceMatchesFilters(invoice, filters)),
      (invoice) => invoice.createdAt,
    );
    const charges = sortByDate(
      state.data.charges
        .filter((charge) => !clientId || charge.clientId === clientId)
        .filter((charge) => chargeMatchesFilters(charge, filters)),
      (charge) => charge.serviceDate,
    );
    const notifications = sortByDate(
      state.data.notifications
        .filter((notification) => !clientId || notification.clientId === clientId)
        .filter((notification) => notificationMatchesFilters(notification, filters)),
      (notification) => notification.createdAt,
    );

    return {
      client: state.data.clients.find((client) => client.id === clientId) ?? null,
      stock,
      visibleStock,
      requests,
      invoices,
      charges,
      reconciliation: filterReconciliation(state.data.reconciliation, clientId, filters),
      serviceHistory: filterServiceHistory(state.data.serviceHistory, clientId, filters),
      notifications,
      notificationPreferences: state.data.notificationPreferences.filter(
        (preference) => !clientId || preference.clientId === clientId,
      ),
      clientCards: state.data.clients.map((client) => buildClientSummary(client, state.data)),
      filterTotals: {
        requests: requests.length,
        invoices: invoices.length,
        charges: charges.length,
        notifications: notifications.length,
        files: requests.reduce((total, request) => total + request.files.length, 0),
      },
    };
  }, [filters, selectedClientId, session.user, state.data, stockSearch]);

  async function loadData() {
    setDocumentError(null);
    setState((current) => ({ ...current, status: 'loading', error: undefined }));

    try {
      // Русский комментарий: кабинет клиента собирает read-only витрину из существующих API,
      // чтобы клиент видел только данные, отфильтрованные серверным client scope.
      const [
        clients,
        stock,
        requests,
        invoices,
        charges,
        reconciliation,
        serviceHistory,
        notifications,
        notificationPreferences,
      ] = await Promise.all([
        fetchClients(session.accessToken),
        fetchStockBalances(session.accessToken),
        fetchClientRequests(session.accessToken),
        fetchBillingInvoices(session.accessToken),
        fetchBillingCharges(session.accessToken),
        fetchBillingReconciliation(session.accessToken),
        fetchBillingServiceHistory(session.accessToken),
        fetchClientNotifications(session.accessToken),
        fetchClientNotificationPreferences(session.accessToken),
      ]);

      setState({
        status: 'ready',
        data: {
          clients,
          stock,
          requests,
          invoices,
          charges,
          reconciliation,
          serviceHistory,
          notifications,
          notificationPreferences,
        },
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

  async function openRequestTimeline(request: ClientRequestSummary) {
    setDocumentError(null);

    try {
      setRequestTimeline(await fetchClientRequestTimeline(session.accessToken, request.id));
    } catch (caught) {
      setDocumentError(caught instanceof Error ? caught.message : 'Не удалось открыть историю заявки.');
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

  async function toggleNotificationPreference(preference: ClientNotificationPreferenceSummary, isEnabled: boolean) {
    const updated = await updateClientNotificationPreference(session.accessToken, {
      clientId: preference.clientId,
      eventType: preference.eventType,
      isEnabled,
    });

    setState((current) => {
      const replaced = current.data.notificationPreferences.some(
        (item) => item.clientId === updated.clientId && item.eventType === updated.eventType,
      );

      return {
        ...current,
        data: {
          ...current.data,
          notificationPreferences: replaced
            ? current.data.notificationPreferences.map((item) =>
                item.clientId === updated.clientId && item.eventType === updated.eventType ? updated : item,
              )
            : [...current.data.notificationPreferences, updated],
        },
      };
    });
  }

  async function addTimelineComment(body: string) {
    if (!requestTimeline) {
      throw new Error('История заявки не открыта.');
    }

    const comment = await createClientRequestComment(session.accessToken, requestTimeline.request.id, { body });
    const [nextTimeline, notifications] = await Promise.all([
      fetchClientRequestTimeline(session.accessToken, requestTimeline.request.id),
      fetchClientNotifications(session.accessToken),
    ]);
    setRequestTimeline(nextTimeline);
    setState((current) => ({
      ...current,
      data: {
        ...current.data,
        notifications,
      },
    }));

    return comment;
  }

  function navigateToSection(target: ClientCabinetMetricTarget) {
    setActiveSection(target);
    window.setTimeout(() => {
      document.getElementById(`client-cabinet-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
    setStockSearch('');
    setActiveSection('skus');
    setEditingClientId('');
    setManagementForm(null);
    setManagementError('');
    setManagementMessage('');
  }

  function startClientEdit(client: ClientSummary) {
    setEditingClientId(client.id);
    setManagementForm(formFromClient(client));
    setManagementError('');
    setManagementMessage('');
  }

  function cancelClientEdit() {
    setEditingClientId('');
    setManagementForm(null);
    setManagementError('');
  }

  async function saveClientEdit() {
    if (!view.client || !managementForm) {
      return;
    }

    setManagingClient(true);
    setManagementError('');
    setManagementMessage('');
    try {
      const updated = await updateClient(session.accessToken, view.client.id, compactClientPayload(managementForm));
      replaceClient(updated);
      setEditingClientId('');
      setManagementForm(null);
      setManagementMessage('Клиент сохранен.');
    } catch (caught) {
      setManagementError(caught instanceof Error ? caught.message : 'Не удалось сохранить клиента.');
    } finally {
      setManagingClient(false);
    }
  }

  async function changeClientStatus(client: ClientSummary, status: ClientStatus) {
    setManagingClient(true);
    setManagementError('');
    setManagementMessage('');
    try {
      const updated = await updateClientStatus(session.accessToken, client.id, status);
      replaceClient(updated);
      setManagementMessage(status === 'ACTIVE' ? 'Клиент активирован.' : 'Клиент заблокирован.');
    } catch (caught) {
      setManagementError(caught instanceof Error ? caught.message : 'Не удалось изменить статус клиента.');
    } finally {
      setManagingClient(false);
    }
  }

  async function removeClient(client: ClientSummary) {
    const confirmed = window.confirm(`Удалить клиента ${client.code} - ${client.name}? Если у клиента есть рабочие данные, WMS не даст удалить его.`);
    if (!confirmed) {
      return;
    }

    setManagingClient(true);
    setManagementError('');
    setManagementMessage('');
    try {
      const deleted = await deleteClient(session.accessToken, client.id);
      setState((current) => {
        const clients = current.data.clients.filter((item) => item.id !== deleted.id);
        return {
          ...current,
          data: {
            ...current.data,
            clients,
          },
        };
      });
      const nextClientId = state.data.clients.find((item) => item.id !== deleted.id)?.id ?? '';
      setSelectedClientId(nextClientId);
      setEditingClientId('');
      setManagementForm(null);
      setManagementMessage(`Клиент ${deleted.code} - ${deleted.name} удален.`);
    } catch (caught) {
      setManagementError(caught instanceof Error ? caught.message : 'Не удалось удалить клиента.');
    } finally {
      setManagingClient(false);
    }
  }

  function replaceClient(client: ClientSummary) {
    setState((current) => ({
      ...current,
      data: {
        ...current.data,
        clients: current.data.clients.map((item) => (item.id === client.id ? client : item)),
      },
    }));
  }

  const showClientOverview = isInternalUser(session.user) && state.data.clients.length > 1;
  const canManageClients = canUse(session.user, 'clients:write');

  return (
    <section className="client-cabinet-panel" aria-label="Кабинет клиента">
      <div className="section-heading client-cabinet-panel__heading">
        <div>
          <p className="eyebrow">Кабинет клиента</p>
          <h2>Кабинет клиента</h2>
        </div>
        <div className="client-cabinet-panel__actions">
          {state.data.clients.length > 1 ? (
            <label className="client-cabinet-client-select">
              <span>Клиент</span>
              <select value={selectedClientId} onChange={(event) => selectClient(event.target.value)}>
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

          {showClientOverview ? (
            <ClientCabinetClientCards
              cards={view.clientCards}
              selectedClientId={view.client.id}
              onSelect={selectClient}
            />
          ) : null}

          <div className="client-cabinet-client">
            <div>
              <span>{view.client.code}</span>
              <strong>{view.client.name}</strong>
            </div>
            <div className="client-cabinet-client__actions">
              <span className={`client-cabinet-status client-cabinet-status--${view.client.status.toLowerCase()}`}>
                {clientStatusLabel(view.client.status)}
              </span>
              {canManageClients ? (
                <>
                  <button
                    className="icon-text-button"
                    disabled={isManagingClient}
                    onClick={() => startClientEdit(view.client!)}
                    type="button"
                  >
                    <Pencil size={15} aria-hidden="true" />
                    <span>Редактировать</span>
                  </button>
                  {view.client.status === 'ACTIVE' ? (
                    <button
                      className="icon-text-button"
                      disabled={isManagingClient}
                      onClick={() => void changeClientStatus(view.client!, 'PAUSED')}
                      type="button"
                    >
                      <Ban size={15} aria-hidden="true" />
                      <span>Заблокировать</span>
                    </button>
                  ) : (
                    <button
                      className="icon-text-button"
                      disabled={isManagingClient}
                      onClick={() => void changeClientStatus(view.client!, 'ACTIVE')}
                      type="button"
                    >
                      <CheckCircle2 size={15} aria-hidden="true" />
                      <span>Активировать</span>
                    </button>
                  )}
                  <button
                    className="icon-text-button client-cabinet-danger-button"
                    disabled={isManagingClient}
                    onClick={() => void removeClient(view.client!)}
                    type="button"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    <span>Удалить</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {managementError ? <p className="form-error">{managementError}</p> : null}
          {managementMessage ? <p className="form-success">{managementMessage}</p> : null}
          {canManageClients && editingClientId === view.client.id && managementForm ? (
            <ClientCabinetClientEditor
              form={managementForm}
              isSubmitting={isManagingClient}
              onCancel={cancelClientEdit}
              onChange={(patch) => setManagementForm((current) => (current ? { ...current, ...patch } : current))}
              onSave={() => void saveClientEdit()}
            />
          ) : null}

          <ClientCabinetMetrics
            stock={view.stock}
            requests={view.requests}
            invoices={view.invoices}
            reconciliation={view.reconciliation}
            onNavigate={navigateToSection}
          />
          <ClientCabinetFilters value={filters} totals={view.filterTotals} onChange={setFilters} />
          <ClientCabinetFilterPresets
            userId={session.user.id}
            clientId={view.client.id}
            value={filters}
            onApply={setFilters}
          />
          <ClientCabinetExports
            accessToken={session.accessToken}
            client={view.client}
            filters={filters}
            requests={view.requests}
            invoices={view.invoices}
            charges={view.charges}
            serviceHistory={view.serviceHistory}
          />
          <ClientCabinetTables
            client={view.client}
            currentUser={session.user}
            stock={view.stock}
            visibleStock={view.visibleStock}
            stockSearch={stockSearch}
            onStockSearchChange={setStockSearch}
            requests={view.requests}
            invoices={view.invoices}
            charges={view.charges}
            reconciliation={view.reconciliation}
            serviceHistory={view.serviceHistory}
            notifications={view.notifications}
            notificationPreferences={view.notificationPreferences}
            activeSection={activeSection}
            onSectionChange={navigateToSection}
            onOpenRequestDocument={(request) => void openRequestDocument(request)}
            onOpenRequestTimeline={(request) => void openRequestTimeline(request)}
            onOpenInvoiceDocument={(invoice) => void openInvoiceDocument(invoice)}
            onUploadRequestFile={uploadRequestFile}
            onDownloadRequestFile={downloadRequestFile}
            onMarkNotificationRead={(notification) => void markNotificationRead(notification)}
            onToggleNotificationPreference={(preference, isEnabled) =>
              void toggleNotificationPreference(preference, isEnabled)
            }
          />
        </>
      ) : null}

      {documentPreview ? (
        <BillingInvoiceDocumentPreview document={documentPreview} onClose={() => setDocumentPreview(null)} />
      ) : null}

      {requestDocumentPreview ? (
        <ClientRequestDocumentPreview document={requestDocumentPreview} onClose={() => setRequestDocumentPreview(null)} />
      ) : null}

      {requestTimeline ? (
        <ClientRequestTimelineModal
          timeline={requestTimeline}
          onClose={() => setRequestTimeline(null)}
          onAddComment={addTimelineComment}
        />
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

function ClientCabinetClientCards({
  cards,
  selectedClientId,
  onSelect,
}: {
  cards: ClientCabinetClientSummary[];
  selectedClientId: string;
  onSelect: (clientId: string) => void;
}) {
  return (
    <div className="client-cabinet-client-cards" aria-label="Клиенты в работе">
      {cards.map((card) => (
        <button
          key={card.client.id}
          className={`client-cabinet-client-card${card.client.id === selectedClientId ? ' is-active' : ''}`}
          type="button"
          onClick={() => onSelect(card.client.id)}
        >
          <span>{card.client.code}</span>
          <strong>{card.client.name}</strong>
          <div>
            <small>SKU {formatCabinetNumber(card.skuCount)}</small>
            <small>Остатки {formatCabinetNumber(card.totalQuantity)}</small>
            <small>Заявки {formatCabinetNumber(card.activeRequests)}</small>
            <small>К оплате {formatCabinetMoney(card.debtRub)} ₽</small>
          </div>
        </button>
      ))}
    </div>
  );
}

function ClientCabinetClientEditor({
  form,
  isSubmitting,
  onCancel,
  onChange,
  onSave,
}: {
  form: ClientManagementForm;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (patch: Partial<ClientManagementForm>) => void;
  onSave: () => void;
}) {
  return (
    <div className="client-cabinet-client-editor">
      <div className="client-cabinet-client-editor__heading">
        <div>
          <h3>Редактирование клиента</h3>
          <span>реквизиты можно сохранить без ИНН, если его пока нет</span>
        </div>
        <button className="icon-button" onClick={onCancel} type="button" title="Закрыть" aria-label="Закрыть редактирование">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="client-cabinet-client-editor__grid">
        <label>
          <span>Тип клиента</span>
          <select value={form.clientKind} onChange={(event) => onChange({ clientKind: event.target.value as ClientKind })}>
            {clientKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Название</span>
          <input value={form.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label>
          <span>Юр. название</span>
          <input value={form.legalName} onChange={(event) => onChange({ legalName: event.target.value })} />
        </label>
        <label>
          <span>ИНН</span>
          <input value={form.inn} onChange={(event) => onChange({ inn: event.target.value })} />
        </label>
        <label>
          <span>КПП</span>
          <input value={form.kpp} onChange={(event) => onChange({ kpp: event.target.value })} />
        </label>
        <label>
          <span>ОГРН</span>
          <input value={form.ogrn} onChange={(event) => onChange({ ogrn: event.target.value })} />
        </label>
        <label>
          <span>Телефон</span>
          <input value={form.phone} onChange={(event) => onChange({ phone: event.target.value })} />
        </label>
        <label>
          <span>Почта</span>
          <input type="email" value={form.email} onChange={(event) => onChange({ email: event.target.value })} />
        </label>
        <label>
          <span>Юр. адрес</span>
          <input value={form.legalAddress} onChange={(event) => onChange({ legalAddress: event.target.value })} />
        </label>
        <label>
          <span>Факт. адрес</span>
          <input value={form.actualAddress} onChange={(event) => onChange({ actualAddress: event.target.value })} />
        </label>
        <label>
          <span>Банк</span>
          <input value={form.bankName} onChange={(event) => onChange({ bankName: event.target.value })} />
        </label>
        <label>
          <span>БИК</span>
          <input value={form.bankBik} onChange={(event) => onChange({ bankBik: event.target.value })} />
        </label>
        <label>
          <span>Расчетный счет</span>
          <input value={form.bankAccount} onChange={(event) => onChange({ bankAccount: event.target.value })} />
        </label>
        <label>
          <span>Корр. счет</span>
          <input value={form.correspondentAccount} onChange={(event) => onChange({ correspondentAccount: event.target.value })} />
        </label>
      </div>
      <div className="client-cabinet-client-editor__actions">
        <button className="primary-button" disabled={isSubmitting || !form.name.trim()} onClick={onSave} type="button">
          <Save size={16} aria-hidden="true" />
          <span>{isSubmitting ? 'Сохранение' : 'Сохранить'}</span>
        </button>
        <button className="icon-text-button" disabled={isSubmitting} onClick={onCancel} type="button">
          Отменить
        </button>
      </div>
    </div>
  );
}

function buildClientSummary(client: ClientSummary, data: CabinetData): ClientCabinetClientSummary {
  const stock = data.stock.filter((balance) => balance.clientId === client.id);
  const invoices = data.invoices.filter((invoice) => invoice.clientId === client.id && invoice.status !== 'CANCELLED');

  return {
    client,
    skuCount: new Set(stock.map((balance) => balance.skuId)).size,
    totalQuantity: stock.reduce((sum, balance) => sum + Number(balance.quantity), 0),
    activeRequests: data.requests.filter(
      (request) => request.clientId === client.id && !['DONE', 'CANCELLED', 'REJECTED'].includes(request.status),
    ).length,
    debtRub: invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.totalRub) - Number(invoice.paidRub)), 0),
  };
}

function formFromClient(client: ClientSummary): ClientManagementForm {
  return {
    clientKind: client.clientKind,
    name: client.name,
    legalName: client.legalName ?? '',
    inn: client.inn ?? '',
    kpp: client.kpp ?? '',
    ogrn: client.ogrn ?? '',
    legalAddress: client.legalAddress ?? '',
    actualAddress: client.actualAddress ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    bankName: client.bankName ?? '',
    bankBik: client.bankBik ?? '',
    bankAccount: client.bankAccount ?? '',
    correspondentAccount: client.correspondentAccount ?? '',
  };
}

function compactClientPayload(form: ClientManagementForm): UpdateClientPayload {
  return {
    clientKind: form.clientKind,
    name: form.name.trim(),
    legalName: form.legalName.trim(),
    inn: form.inn.trim(),
    kpp: form.kpp.trim(),
    ogrn: form.ogrn.trim(),
    legalAddress: form.legalAddress.trim(),
    actualAddress: form.actualAddress.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    bankName: form.bankName.trim(),
    bankBik: form.bankBik.trim(),
    bankAccount: form.bankAccount.trim(),
    correspondentAccount: form.correspondentAccount.trim(),
  };
}

function clientStatusLabel(status: ClientStatus) {
  const labels: Record<ClientStatus, string> = {
    ACTIVE: 'Активен',
    PAUSED: 'Заблокирован',
    ARCHIVED: 'В архиве',
  };
  return labels[status];
}

function canUse(user: AuthSession['user'], permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}

function isInternalUser(user: AuthSession['user']) {
  return user.clientScopeMode === 'ALL' || !user.roleCodes.includes('CLIENT');
}

function filterServiceHistory(
  history: BillingServiceHistory | null,
  clientId: string,
  filters: ClientCabinetFiltersValue,
): BillingServiceHistory | null {
  if (!history) {
    return null;
  }

  // Русский комментарий: история услуг фильтруется по агрегированным датам группы; точные строки остаются в таблице начислений.
  const groups = history.groups
    .filter((group) => !clientId || group.clientId === clientId)
    .filter((group) => serviceHistoryGroupMatchesFilters(group, filters));

  return {
    ...history,
    totals: groups.reduce(
      (totals, group) => ({
        chargesCount: totals.chargesCount + group.chargesCount,
        totalRub: roundMoney(totals.totalRub + group.totalRub),
        draftRub: roundMoney(totals.draftRub + group.draftRub),
        approvedRub: roundMoney(totals.approvedRub + group.approvedRub),
        cancelledRub: roundMoney(totals.cancelledRub + group.cancelledRub),
      }),
      { chargesCount: 0, totalRub: 0, draftRub: 0, approvedRub: 0, cancelledRub: 0 },
    ),
    groups,
  };
}

function filterReconciliation(
  report: BillingReconciliation | null,
  clientId: string,
  filters: ClientCabinetFiltersValue,
): BillingReconciliation | null {
  if (!report) {
    return null;
  }

  const clients = report.clients
    .filter((item) => !clientId || item.client.id === clientId)
    .map((item) => rebuildReconciliationClient(item, item.invoices.filter((invoice) => periodMatchesRange(invoice.periodFrom, invoice.periodTo, filters))))
    .filter((item) => item.invoicesCount > 0);

  return {
    ...report,
    totals: clients.reduce(
      (totals, item) => ({
        invoicesCount: totals.invoicesCount + item.invoicesCount,
        openInvoicesCount: totals.openInvoicesCount + item.openInvoicesCount,
        paidInvoicesCount: totals.paidInvoicesCount + item.paidInvoicesCount,
        overdueInvoicesCount: totals.overdueInvoicesCount + item.overdueInvoicesCount,
        totalRub: roundMoney(totals.totalRub + item.totalRub),
        paidRub: roundMoney(totals.paidRub + item.paidRub),
        debtRub: roundMoney(totals.debtRub + item.debtRub),
        overdueRub: roundMoney(totals.overdueRub + item.overdueRub),
      }),
      {
        invoicesCount: 0,
        openInvoicesCount: 0,
        paidInvoicesCount: 0,
        overdueInvoicesCount: 0,
        totalRub: 0,
        paidRub: 0,
        debtRub: 0,
        overdueRub: 0,
      },
    ),
    clients,
  };
}

function rebuildReconciliationClient(
  item: BillingReconciliationClient,
  invoices: BillingReconciliationInvoice[],
): BillingReconciliationClient {
  const openInvoices = invoices.filter((invoice) => invoice.remainingRub > 0 && invoice.status !== 'PAID');
  const overdueInvoices = invoices.filter((invoice) => invoice.overdueDays > 0);
  const invoiceDates = invoices
    .map((invoice) => invoice.issuedAt ?? invoice.periodTo)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    ...item,
    invoices,
    invoicesCount: invoices.length,
    openInvoicesCount: openInvoices.length,
    paidInvoicesCount: invoices.filter((invoice) => invoice.status === 'PAID').length,
    overdueInvoicesCount: overdueInvoices.length,
    totalRub: invoices.reduce((sum, invoice) => roundMoney(sum + invoice.totalRub), 0),
    paidRub: invoices.reduce((sum, invoice) => roundMoney(sum + invoice.paidRub), 0),
    debtRub: invoices.reduce((sum, invoice) => roundMoney(sum + invoice.remainingRub), 0),
    overdueRub: overdueInvoices.reduce((sum, invoice) => roundMoney(sum + invoice.remainingRub), 0),
    nearestDueDate:
      openInvoices
        .map((invoice) => invoice.dueDate)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null,
    latestInvoiceDate: invoiceDates[invoiceDates.length - 1] ?? null,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function stockMatchesSearch(balance: StockBalance, search: string, canSeeStoragePlaces: boolean) {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const values = [
    balance.sku.internalSku,
    balance.sku.clientSku,
    balance.sku.article,
    balance.sku.name,
    ...balance.sku.barcodes.map((barcode) => barcode.value),
    balance.status,
    String(balance.quantity),
  ];
  if (canSeeStoragePlaces) {
    values.push(balance.box?.code ?? null, balance.pallet?.code ?? null);
  }

  return values.some((value) => value?.toLowerCase().includes(query));
}

function requestMatchesFilters(request: ClientRequestSummary, filters: ClientCabinetFiltersValue) {
  if (filters.requestStatus && request.status !== filters.requestStatus) {
    return false;
  }

  if (filters.fileState === 'WITH_FILES' && request.files.length === 0) {
    return false;
  }

  if (filters.fileState === 'WITHOUT_FILES' && request.files.length > 0) {
    return false;
  }

  return dateMatchesRange(request.createdAt, filters);
}

function invoiceMatchesFilters(invoice: BillingInvoiceSummary, filters: ClientCabinetFiltersValue) {
  if (filters.invoiceStatus && invoice.status !== filters.invoiceStatus) {
    return false;
  }

  return periodMatchesRange(invoice.periodFrom, invoice.periodTo, filters);
}

function chargeMatchesFilters(charge: BillingChargeSummary, filters: ClientCabinetFiltersValue) {
  if (filters.chargeStatus && charge.status !== filters.chargeStatus) {
    return false;
  }

  return dateMatchesRange(charge.serviceDate, filters);
}

function notificationMatchesFilters(notification: ClientNotificationSummary, filters: ClientCabinetFiltersValue) {
  if (filters.notificationState === 'READ' && !notification.isRead) {
    return false;
  }

  if (filters.notificationState === 'UNREAD' && notification.isRead) {
    return false;
  }

  return dateMatchesRange(notification.createdAt, filters);
}

function serviceHistoryGroupMatchesFilters(group: BillingServiceHistoryGroup, filters: ClientCabinetFiltersValue) {
  if (filters.chargeStatus && group.latestStatus !== filters.chargeStatus) {
    return false;
  }

  return periodMatchesRange(group.firstServiceDate, group.lastServiceDate, filters);
}

function dateMatchesRange(value: string | null | undefined, filters: Pick<ClientCabinetFiltersValue, 'dateFrom' | 'dateTo'>) {
  if (!filters.dateFrom && !filters.dateTo) {
    return true;
  }

  if (!value) {
    return false;
  }

  const date = value.slice(0, 10);
  if (filters.dateFrom && date < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && date > filters.dateTo) {
    return false;
  }

  return true;
}

function periodMatchesRange(
  periodFrom: string,
  periodTo: string,
  filters: Pick<ClientCabinetFiltersValue, 'dateFrom' | 'dateTo'>,
) {
  if (!filters.dateFrom && !filters.dateTo) {
    return true;
  }

  const start = periodFrom.slice(0, 10);
  const end = periodTo.slice(0, 10);

  if (filters.dateFrom && end < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && start > filters.dateTo) {
    return false;
  }

  return true;
}
