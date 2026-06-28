import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Database,
  Eraser,
  Power,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  deleteClient,
  deleteServiceBillingService,
  deleteServiceNomenclature,
  fetchClients,
  fetchServiceBillingServices,
  fetchServiceClientStockCleanupPreview,
  fetchServiceNomenclature,
  fetchServiceOverview,
  purgeServiceClientStock,
  updateClientStatus,
  updateServiceBillingServiceStatus,
  updateServiceMaintenance,
  createServiceBillingService,
  type AuthSession,
  type BillingUnit,
  type ClientStatus,
  type ClientSummary,
  type NomenclatureSummary,
  type ServiceBillingService,
  type ServiceClientStockCleanupPreview,
  type ServiceClientStockCleanupResult,
  type ServiceClientStockSummary,
  type ServiceOverview,
} from '../../lib/api';
import { billingUnitOptions } from '../billing/billingMeta';
import './service-center.css';

type LoadState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T;
  error?: string;
};

type ServiceTab = 'maintenance' | 'clients' | 'stock' | 'nomenclature' | 'services';

type ServiceCenterPanelProps = {
  session: AuthSession;
};

const emptySummary: ServiceClientStockSummary = {
  balanceRows: 0,
  quantity: 0,
  uniqueSkusInStock: 0,
  movements: 0,
  boxes: 0,
  pallets: 0,
  productMarks: 0,
};

const tabs: Array<{ id: ServiceTab; label: string; icon: typeof Settings2 }> = [
  { id: 'maintenance', label: 'Режим', icon: Power },
  { id: 'clients', label: 'Клиенты', icon: ShieldAlert },
  { id: 'stock', label: 'Остатки', icon: Database },
  { id: 'nomenclature', label: 'Номенклатура', icon: Eraser },
  { id: 'services', label: 'Услуги', icon: Settings2 },
];

export function ServiceCenterPanel({ session }: ServiceCenterPanelProps) {
  const [activeTab, setActiveTab] = useState<ServiceTab>('maintenance');
  const [overview, setOverview] = useState<LoadState<ServiceOverview | null>>({ status: 'idle', data: null });
  const [clients, setClients] = useState<LoadState<ClientSummary[]>>({ status: 'idle', data: [] });
  const [selectedClientId, setSelectedClientId] = useState('');
  const [preview, setPreview] = useState<LoadState<ServiceClientStockCleanupPreview | null>>({ status: 'idle', data: null });
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<ServiceClientStockCleanupResult | null>(null);
  const [isPurging, setPurging] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('В WMS идут сервисные работы. Вход временно закрыт.');
  const [actionMessage, setActionMessage] = useState('');
  const [nomenclatureSearch, setNomenclatureSearch] = useState('');
  const [nomenclature, setNomenclature] = useState<LoadState<NomenclatureSummary[]>>({ status: 'idle', data: [] });
  const [services, setServices] = useState<LoadState<ServiceBillingService[]>>({ status: 'idle', data: [] });
  const [serviceForm, setServiceForm] = useState({ code: '', name: '', unit: 'SERVICE' as BillingUnit, defaultPriceRub: '' });

  const selectedClient = useMemo(
    () => clients.data.find((client) => client.id === selectedClientId) ?? null,
    [clients.data, selectedClientId],
  );
  const currentSummary = preview.data?.summary ?? emptySummary;
  const canPurge =
    Boolean(selectedClientId) &&
    preview.status === 'ready' &&
    confirmation === preview.data?.confirmationText &&
    currentSummary.quantity + currentSummary.balanceRows + currentSummary.movements + currentSummary.boxes + currentSummary.pallets > 0;

  useEffect(() => {
    void loadOverview();
    void loadClients();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setPreview({ status: 'idle', data: null });
      return;
    }
    void loadPreview(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    if (overview.data?.maintenance.message) {
      setMaintenanceMessage(overview.data.maintenance.message);
    }
  }, [overview.data?.maintenance.message]);

  useEffect(() => {
    if (activeTab === 'nomenclature' && nomenclature.status === 'idle') {
      void loadNomenclature();
    }
    if (activeTab === 'services' && services.status === 'idle') {
      void loadServices();
    }
  }, [activeTab]);

  async function loadOverview() {
    setOverview((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      setOverview({ status: 'ready', data: await fetchServiceOverview(session.accessToken) });
    } catch (caught) {
      setOverview((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function loadClients() {
    setClients((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      const loaded = await fetchClients(session.accessToken);
      setClients({ status: 'ready', data: loaded });
      setSelectedClientId((current) => (loaded.some((client) => client.id === current) ? current : loaded[0]?.id ?? ''));
    } catch (caught) {
      setClients({ status: 'error', data: [], error: errorMessage(caught) });
    }
  }

  async function loadPreview(clientId = selectedClientId) {
    if (!clientId) {
      return;
    }

    setPreview((current) => ({ ...current, status: 'loading', error: undefined }));
    setResult(null);
    try {
      setPreview({ status: 'ready', data: await fetchServiceClientStockCleanupPreview(session.accessToken, clientId) });
      setConfirmation('');
    } catch (caught) {
      setPreview((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function toggleMaintenance(enabled: boolean) {
    setActionMessage('');
    try {
      const maintenance = await updateServiceMaintenance(session.accessToken, { enabled, message: maintenanceMessage });
      setOverview((current) =>
        current.data ? { status: 'ready', data: { ...current.data, maintenance } } : current,
      );
      setActionMessage(enabled ? 'Режим обслуживания включен.' : 'Режим обслуживания выключен.');
    } catch (caught) {
      setOverview((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function purgeStock() {
    if (!selectedClientId || !canPurge) {
      return;
    }

    setPurging(true);
    setResult(null);
    try {
      const purged = await purgeServiceClientStock(session.accessToken, selectedClientId, confirmation);
      setResult(purged);
      setPreview({
        status: 'ready',
        data: {
          client: purged.client,
          summary: purged.after,
          confirmationText: preview.data?.confirmationText ?? 'ОЧИСТИТЬ',
          warning: preview.data?.warning ?? '',
        },
      });
      setConfirmation('');
      void loadOverview();
    } catch (caught) {
      setPreview((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    } finally {
      setPurging(false);
    }
  }

  async function updateClient(status: ClientStatus) {
    if (!selectedClient) {
      return;
    }

    setActionMessage('');
    try {
      const updated = await updateClientStatus(session.accessToken, selectedClient.id, status);
      setClients((current) => ({ ...current, data: current.data.map((client) => (client.id === updated.id ? updated : client)) }));
      setActionMessage(status === 'ACTIVE' ? 'Клиент активирован.' : 'Клиент заблокирован.');
    } catch (caught) {
      setClients((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function removeClient() {
    if (!selectedClient || !window.confirm(`Удалить клиента ${selectedClient.code} - ${selectedClient.name}?`)) {
      return;
    }

    setActionMessage('');
    try {
      const deleted = await deleteClient(session.accessToken, selectedClient.id);
      const nextClients = clients.data.filter((client) => client.id !== deleted.id);
      setClients({ status: 'ready', data: nextClients });
      setSelectedClientId(nextClients[0]?.id ?? '');
      setActionMessage(`Клиент ${deleted.code} удален.`);
      void loadOverview();
    } catch (caught) {
      setClients((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function loadNomenclature() {
    setNomenclature((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      setNomenclature({ status: 'ready', data: await fetchServiceNomenclature(session.accessToken, { search: nomenclatureSearch }) });
    } catch (caught) {
      setNomenclature((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function removeNomenclature(item: NomenclatureSummary) {
    if (!window.confirm(`Удалить номенклатуру ${item.internalSku} - ${item.name}?`)) {
      return;
    }
    try {
      await deleteServiceNomenclature(session.accessToken, item.id);
      setNomenclature((current) => ({ ...current, data: current.data.filter((row) => row.id !== item.id) }));
      setActionMessage('Номенклатура удалена.');
      void loadOverview();
    } catch (caught) {
      setNomenclature((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function loadServices() {
    setServices((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      setServices({ status: 'ready', data: await fetchServiceBillingServices(session.accessToken) });
    } catch (caught) {
      setServices((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await createServiceBillingService(session.accessToken, {
        code: serviceForm.code,
        name: serviceForm.name,
        unit: serviceForm.unit,
        defaultPriceRub: serviceForm.defaultPriceRub ? Number(serviceForm.defaultPriceRub) : undefined,
      });
      setServices((current) => ({ ...current, data: [created, ...current.data] }));
      setServiceForm({ code: '', name: '', unit: 'SERVICE', defaultPriceRub: '' });
      setActionMessage('Услуга создана.');
      void loadOverview();
    } catch (caught) {
      setServices((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function toggleService(service: ServiceBillingService) {
    try {
      const updated = await updateServiceBillingServiceStatus(session.accessToken, service.id, !service.isActive);
      setServices((current) => ({
        ...current,
        data: current.data.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      }));
    } catch (caught) {
      setServices((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function removeService(service: ServiceBillingService) {
    if (!window.confirm(`Удалить услугу ${service.code} - ${service.name}?`)) {
      return;
    }
    try {
      await deleteServiceBillingService(session.accessToken, service.id);
      setServices((current) => ({ ...current, data: current.data.filter((item) => item.id !== service.id) }));
      setActionMessage('Услуга удалена.');
      void loadOverview();
    } catch (caught) {
      setServices((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  return (
    <section className="service-panel" aria-label="Сервисное меню">
      <div className="panel-heading service-panel__heading">
        <div>
          <p className="eyebrow">Сервисное меню</p>
          <h2>Управление системными данными</h2>
        </div>
        <ShieldAlert size={22} aria-hidden="true" />
      </div>

      <div className="service-tabs" role="tablist" aria-label="Раздел сервисного меню">
        {tabs.map((tab) => (
          <button className={activeTab === tab.id ? 'active' : ''} key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
            <tab.icon size={16} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {renderOverview(overview.data)}
      {overview.status === 'error' ? <div className="service-message service-message--error">{overview.error}</div> : null}
      {actionMessage ? <div className="service-message service-message--success"><CheckCircle2 size={18} />{actionMessage}</div> : null}

      {activeTab === 'maintenance' ? (
        <div className="service-card">
          <div className="service-card__heading">
            <strong>Блокировка входа пользователей</strong>
            <span className={overview.data?.maintenance.enabled ? 'status status--planned' : 'status status--ready'}>
              {overview.data?.maintenance.enabled ? 'Включена' : 'Выключена'}
            </span>
          </div>
          <label className="service-field">
            <span>Сообщение при входе</span>
            <input value={maintenanceMessage} onChange={(event) => setMaintenanceMessage(event.target.value)} />
          </label>
          <div className="service-actions">
            <button className="danger-button" type="button" onClick={() => void toggleMaintenance(true)}>
              <Ban size={16} /> Закрыть вход
            </button>
            <button className="secondary-button" type="button" onClick={() => void toggleMaintenance(false)}>
              <CheckCircle2 size={16} /> Открыть вход
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'clients' ? (
        <ServiceClientsTable
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={setSelectedClientId}
          onRefresh={loadClients}
          onStatus={(status) => void updateClient(status)}
          onDelete={() => void removeClient()}
        />
      ) : null}

      {activeTab === 'stock' ? (
        <StockCleanup
          clients={clients.data}
          selectedClientId={selectedClientId}
          selectedClient={selectedClient}
          preview={preview}
          confirmation={confirmation}
          result={result}
          isPurging={isPurging}
          currentSummary={currentSummary}
          canPurge={canPurge}
          onSelect={setSelectedClientId}
          onRefresh={() => loadPreview()}
          onConfirmation={setConfirmation}
          onPurge={() => void purgeStock()}
        />
      ) : null}

      {activeTab === 'nomenclature' ? (
        <div className="service-card">
          <div className="service-toolbar">
            <input placeholder="Поиск по названию, артикулу, штрихкоду" value={nomenclatureSearch} onChange={(event) => setNomenclatureSearch(event.target.value)} />
            <button className="secondary-button" type="button" onClick={() => void loadNomenclature()}>
              <RefreshCw size={16} /> Показать
            </button>
          </div>
          {nomenclature.status === 'error' ? <div className="service-message service-message--error">{nomenclature.error}</div> : null}
          <ServiceTable columns={['SKU', 'Название', 'Штрихкод', 'Артикул', 'Действие']}>
            {nomenclature.data.map((item) => (
              <tr key={item.id}>
                <td>{item.internalSku}</td>
                <td>{item.name}</td>
                <td>{item.barcode || '-'}</td>
                <td>{item.article || '-'}</td>
                <td>
                  <button className="danger-link" type="button" onClick={() => void removeNomenclature(item)}>Удалить</button>
                </td>
              </tr>
            ))}
          </ServiceTable>
        </div>
      ) : null}

      {activeTab === 'services' ? (
        <div className="service-card">
          <form className="service-inline-form" onSubmit={(event) => void createService(event)}>
            <input required placeholder="Код" value={serviceForm.code} onChange={(event) => setServiceForm({ ...serviceForm, code: event.target.value })} />
            <input required placeholder="Название услуги" value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} />
            <select value={serviceForm.unit} onChange={(event) => setServiceForm({ ...serviceForm, unit: event.target.value as BillingUnit })}>
              {billingUnitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input min="0" step="0.01" type="number" placeholder="Цена" value={serviceForm.defaultPriceRub} onChange={(event) => setServiceForm({ ...serviceForm, defaultPriceRub: event.target.value })} />
            <button className="primary-button" type="submit">Создать</button>
          </form>
          {services.status === 'error' ? <div className="service-message service-message--error">{services.error}</div> : null}
          <ServiceTable columns={['Код', 'Услуга', 'Ед.', 'Цена', 'Используется', 'Действия']}>
            {services.data.map((service) => (
              <tr key={service.id}>
                <td>{service.code}</td>
                <td>{service.name}</td>
                <td>{service.unit}</td>
                <td>{service.defaultPriceRub ?? '-'}</td>
                <td>{(service._count?.charges ?? 0) + (service._count?.clientPrices ?? 0)}</td>
                <td>
                  <button className="secondary-link" type="button" onClick={() => void toggleService(service)}>
                    {service.isActive ? 'Отключить' : 'Включить'}
                  </button>
                  <button className="danger-link" type="button" onClick={() => void removeService(service)}>Удалить</button>
                </td>
              </tr>
            ))}
          </ServiceTable>
        </div>
      ) : null}
    </section>
  );
}

function renderOverview(overview: ServiceOverview | null) {
  if (!overview) {
    return null;
  }

  return (
    <div className="service-metrics">
      <Metric icon={<Database size={17} />} label="Клиентов" value={overview.counters.clients} />
      <Metric icon={<Database size={17} />} label="Пользователей" value={overview.counters.users} />
      <Metric icon={<Database size={17} />} label="Номенклатура" value={overview.counters.nomenclature} />
      <Metric icon={<Database size={17} />} label="SKU" value={overview.counters.skus} />
      <Metric icon={<Database size={17} />} label="Услуги" value={overview.counters.services} />
      <Metric icon={<Database size={17} />} label="Остаток, шт" value={overview.counters.stockQuantity} />
    </div>
  );
}

function ServiceClientsTable({
  clients,
  selectedClientId,
  onSelect,
  onRefresh,
  onStatus,
  onDelete,
}: {
  clients: LoadState<ClientSummary[]>;
  selectedClientId: string;
  onSelect: (clientId: string) => void;
  onRefresh: () => void;
  onStatus: (status: ClientStatus) => void;
  onDelete: () => void;
}) {
  const selected = clients.data.find((client) => client.id === selectedClientId);
  return (
    <div className="service-card">
      <div className="service-card__heading">
        <strong>Управление клиентами</strong>
        <button className="secondary-button" type="button" onClick={onRefresh}><RefreshCw size={16} /> Обновить</button>
      </div>
      {clients.status === 'error' ? <div className="service-message service-message--error">{clients.error}</div> : null}
      <ServiceTable columns={['Код', 'Название', 'ИНН', 'Статус', 'Менеджер']}>
        {clients.data.map((client) => (
          <tr className={client.id === selectedClientId ? 'is-selected' : ''} key={client.id} onClick={() => onSelect(client.id)}>
            <td>{client.code}</td>
            <td>{client.name}</td>
            <td>{client.inn || '-'}</td>
            <td>{clientStatusLabel(client.status)}</td>
            <td>{client.fulfillmentManager?.name || '-'}</td>
          </tr>
        ))}
      </ServiceTable>
      <div className="service-actions">
        <button className="secondary-button" type="button" disabled={!selected || selected.status === 'ACTIVE'} onClick={() => onStatus('ACTIVE')}>Активировать</button>
        <button className="secondary-button" type="button" disabled={!selected || selected.status === 'PAUSED'} onClick={() => onStatus('PAUSED')}>Заблокировать</button>
        <button className="danger-button" type="button" disabled={!selected} onClick={onDelete}><Trash2 size={16} /> Удалить клиента</button>
      </div>
    </div>
  );
}

function StockCleanup(props: {
  clients: ClientSummary[];
  selectedClientId: string;
  selectedClient: ClientSummary | null;
  preview: LoadState<ServiceClientStockCleanupPreview | null>;
  confirmation: string;
  result: ServiceClientStockCleanupResult | null;
  isPurging: boolean;
  currentSummary: ServiceClientStockSummary;
  canPurge: boolean;
  onSelect: (clientId: string) => void;
  onRefresh: () => void;
  onConfirmation: (value: string) => void;
  onPurge: () => void;
}) {
  return (
    <div className="service-card">
      <div className="service-cleanup__controls">
        <label>
          <span>Клиент</span>
          <select value={props.selectedClientId} onChange={(event) => props.onSelect(event.target.value)}>
            {props.clients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.name}</option>)}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={props.onRefresh} disabled={!props.selectedClientId}><RefreshCw size={16} /> Обновить</button>
      </div>
      {props.preview.status === 'error' ? <div className="service-message service-message--error">{props.preview.error}</div> : null}
      <div className="service-metrics">
        <Metric icon={<Database size={17} />} label="Единиц" value={props.currentSummary.quantity} />
        <Metric icon={<Database size={17} />} label="SKU" value={props.currentSummary.uniqueSkusInStock} />
        <Metric icon={<Eraser size={17} />} label="Balances" value={props.currentSummary.balanceRows} />
        <Metric icon={<Eraser size={17} />} label="Движений" value={props.currentSummary.movements} />
        <Metric icon={<Eraser size={17} />} label="Коробов" value={props.currentSummary.boxes} />
        <Metric icon={<Eraser size={17} />} label="Паллет" value={props.currentSummary.pallets} />
      </div>
      <div className="service-warning"><AlertTriangle size={18} />{props.preview.data?.warning ?? 'Выберите клиента для очистки.'}</div>
      <div className="service-danger-zone">
        <label>
          <span>Подтверждение</span>
          <input value={props.confirmation} onChange={(event) => props.onConfirmation(event.target.value)} placeholder={`Введите ${props.preview.data?.confirmationText ?? 'ОЧИСТИТЬ'}`} />
        </label>
        <button className="danger-button" type="button" onClick={props.onPurge} disabled={!props.canPurge || props.isPurging}><Trash2 size={16} /> Очистить остатки</button>
      </div>
      {props.result ? <div className="service-message service-message--success"><CheckCircle2 size={18} />Остатки клиента очищены.</div> : null}
    </div>
  );
}

function ServiceTable({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div className="service-table-wrap">
      <table className="service-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <article className="service-metric">
      {icon}
      <span>{label}</span>
      <strong>{new Intl.NumberFormat('ru-RU').format(value)}</strong>
    </article>
  );
}

function clientStatusLabel(status: ClientStatus) {
  const labels: Record<ClientStatus, string> = {
    ACTIVE: 'Активен',
    PAUSED: 'Заблокирован',
    ARCHIVED: 'В архиве',
  };
  return labels[status];
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить действие.';
}
