import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle2,
  Clock,
  Database,
  Eraser,
  Globe2,
  Monitor,
  Power,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  deleteClient,
  deleteServiceBillingService,
  deleteServiceClientIpRule,
  deleteServiceNomenclature,
  deleteUser,
  fetchClients,
  fetchServiceBillingServices,
  fetchServiceClientStockCleanupPreview,
  fetchServiceClientIpRules,
  fetchServiceTelegramSettings,
  fetchServiceNomenclature,
  fetchServiceOnlineSessions,
  fetchServiceOverview,
  createServiceClientIpRule,
  createUser,
  fetchUsers,
  sendServiceTelegramTest,
  purgeServiceClientStock,
  updateClientStatus,
  updateServiceBillingServiceStatus,
  updateServiceMaintenance,
  updateServiceTelegramSettings,
  createServiceBillingService,
  type AuthSession,
  type BillingUnit,
  type ClientStatus,
  type ClientSummary,
  type NomenclatureSummary,
  type ServiceBillingService,
  type ServiceClientIpRule,
  type ServiceClientStockCleanupPreview,
  type ServiceClientStockCleanupResult,
  type ServiceClientStockSummary,
  type ServiceOnlineSession,
  type ServiceOverview,
  type ServiceTelegramSettings,
  type UserSummary,
} from '../../lib/api';
import { billingUnitOptions } from '../billing/billingMeta';
import './service-center.css';

type LoadState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T;
  error?: string;
};

type ServiceTab = 'maintenance' | 'sessions' | 'clients' | 'stock' | 'nomenclature' | 'services' | 'telegram' | 'tsd';

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
  { id: 'sessions', label: 'Сессии', icon: Monitor },
  { id: 'clients', label: 'Клиенты', icon: ShieldAlert },
  { id: 'stock', label: 'Остатки', icon: Database },
  { id: 'nomenclature', label: 'Номенклатура', icon: Eraser },
  { id: 'services', label: 'Услуги', icon: Settings2 },
  { id: 'telegram', label: 'Telegram', icon: Bell },
  { id: 'tsd', label: 'ТСД', icon: Smartphone },
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
  const [sessions, setSessions] = useState<LoadState<ServiceOnlineSession[]>>({ status: 'idle', data: [] });
  const [ipRules, setIpRules] = useState<LoadState<ServiceClientIpRule[]>>({ status: 'idle', data: [] });
  const [ipForm, setIpForm] = useState({ ipAddress: '', comment: '' });
  const [telegram, setTelegram] = useState<LoadState<ServiceTelegramSettings | null>>({ status: 'idle', data: null });
  const [telegramForm, setTelegramForm] = useState({ enabled: false, botToken: '', fulfillmentChatIds: '', testChatId: '', testMessage: '' });
  const [serviceForm, setServiceForm] = useState({ code: '', name: '', unit: 'SERVICE' as BillingUnit, defaultPriceRub: '' });
  const [tsdUsers, setTsdUsers] = useState<LoadState<UserSummary[]>>({ status: 'idle', data: [] });
  const [tsdUserForm, setTsdUserForm] = useState({ name: '', email: '', password: '', clientId: '' });

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
    if (activeTab === 'sessions') {
      if (sessions.status === 'idle') {
        void loadSessions();
      }
      if (ipRules.status === 'idle') {
        void loadIpRules();
      }
    }
    if (activeTab === 'telegram' && telegram.status === 'idle') {
      void loadTelegramSettings();
    }
    if (activeTab === 'tsd' && tsdUsers.status === 'idle') {
      void loadTsdUsers();
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

  async function loadSessions() {
    setSessions((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      setSessions({ status: 'ready', data: await fetchServiceOnlineSessions(session.accessToken) });
    } catch (caught) {
      setSessions((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function loadIpRules(clientId = selectedClientId) {
    setIpRules((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      setIpRules({ status: 'ready', data: await fetchServiceClientIpRules(session.accessToken, { clientId: clientId || undefined }) });
    } catch (caught) {
      setIpRules((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function createIpRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClientId) {
      return;
    }

    try {
      const created = await createServiceClientIpRule(session.accessToken, selectedClientId, ipForm);
      setIpRules((current) => ({ ...current, data: [created, ...current.data] }));
      setIpForm({ ipAddress: '', comment: '' });
      setActionMessage('IP добавлен в доступ клиента.');
    } catch (caught) {
      setIpRules((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function loadTelegramSettings() {
    setTelegram((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      const settings = await fetchServiceTelegramSettings(session.accessToken);
      setTelegram({ status: 'ready', data: settings });
      setTelegramForm((current) => ({
        ...current,
        enabled: settings.enabled,
        botToken: '',
        fulfillmentChatIds: settings.fulfillmentChatIds,
      }));
    } catch (caught) {
      setTelegram((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function saveTelegramSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const settings = await updateServiceTelegramSettings(session.accessToken, {
        enabled: telegramForm.enabled,
        botToken: telegramForm.botToken || undefined,
        fulfillmentChatIds: telegramForm.fulfillmentChatIds,
      });
      setTelegram({ status: 'ready', data: settings });
      setTelegramForm((current) => ({ ...current, botToken: '' }));
      setActionMessage('Настройки Telegram сохранены.');
    } catch (caught) {
      setTelegram((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function sendTelegramTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!telegramForm.testChatId.trim()) {
      return;
    }
    try {
      await sendServiceTelegramTest(session.accessToken, {
        chatId: telegramForm.testChatId,
        message: telegramForm.testMessage || undefined,
      });
      setActionMessage('Тестовое сообщение Telegram отправлено.');
    } catch (caught) {
      setTelegram((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function loadTsdUsers() {
    setTsdUsers((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      const users = await fetchUsers(session.accessToken);
      setTsdUsers({ status: 'ready', data: users.filter((user) => user.roles.some((item) => item.role.code === 'TSD')) });
    } catch (caught) {
      setTsdUsers((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function createTsdUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const clientIds = tsdUserForm.clientId ? [tsdUserForm.clientId] : undefined;
      const created = await createUser(session.accessToken, {
        name: tsdUserForm.name,
        email: tsdUserForm.email,
        password: tsdUserForm.password,
        roleCodes: ['OPERATOR', 'TSD'],
        clientIds,
        writableClientIds: clientIds,
      });
      setTsdUsers((current) => ({ ...current, status: 'ready', data: [created, ...current.data] }));
      setTsdUserForm({ name: '', email: '', password: '', clientId: '' });
      setActionMessage('Сотрудник ТСД создан. Логин и пароль можно ввести на ТСД один раз.');
    } catch (caught) {
      setTsdUsers((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function removeTsdUser(user: UserSummary) {
    if (!window.confirm(`Удалить пользователя ТСД ${user.name} (${user.email})?`)) {
      return;
    }

    try {
      await deleteUser(session.accessToken, user.id);
      setTsdUsers((current) => ({ ...current, data: current.data.filter((item) => item.id !== user.id) }));
      setActionMessage('Пользователь ТСД удален. Доступ и активные сессии отключены.');
      void loadOverview();
    } catch (caught) {
      setTsdUsers((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    }
  }

  async function removeIpRule(rule: ServiceClientIpRule) {
    if (!window.confirm(`Удалить IP ${rule.ipAddress} для клиента ${rule.client.code}?`)) {
      return;
    }

    try {
      await deleteServiceClientIpRule(session.accessToken, rule.id);
      setIpRules((current) => ({ ...current, data: current.data.filter((item) => item.id !== rule.id) }));
      setActionMessage('IP удален из доступа клиента.');
    } catch (caught) {
      setIpRules((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
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

      {activeTab === 'sessions' ? (
        <SessionsAndIpPanel
          clients={clients.data}
          ipForm={ipForm}
          ipRules={ipRules}
          selectedClientId={selectedClientId}
          sessions={sessions}
          onIpForm={setIpForm}
          onRefreshSessions={() => void loadSessions()}
          onRefreshIpRules={() => void loadIpRules()}
          onSelectClient={(clientId) => {
            setSelectedClientId(clientId);
            void loadIpRules(clientId);
          }}
          onCreateIpRule={(event) => void createIpRule(event)}
          onDeleteIpRule={(rule) => void removeIpRule(rule)}
        />
      ) : null}

      {activeTab === 'telegram' ? (
        <TelegramSettingsPanel
          form={telegramForm}
          settings={telegram}
          onChange={setTelegramForm}
          onRefresh={() => void loadTelegramSettings()}
          onSave={(event) => void saveTelegramSettings(event)}
          onTest={(event) => void sendTelegramTest(event)}
        />
      ) : null}

      {activeTab === 'tsd' ? (
        <TsdServicePanel
          clients={clients.data}
          form={tsdUserForm}
          users={tsdUsers}
          onChange={setTsdUserForm}
          onCreate={(event) => void createTsdUser(event)}
          onDelete={(user) => void removeTsdUser(user)}
          onRefresh={() => void loadTsdUsers()}
        />
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

function SessionsAndIpPanel({
  clients,
  ipForm,
  ipRules,
  selectedClientId,
  sessions,
  onCreateIpRule,
  onDeleteIpRule,
  onIpForm,
  onRefreshIpRules,
  onRefreshSessions,
  onSelectClient,
}: {
  clients: ClientSummary[];
  ipForm: { ipAddress: string; comment: string };
  ipRules: LoadState<ServiceClientIpRule[]>;
  selectedClientId: string;
  sessions: LoadState<ServiceOnlineSession[]>;
  onCreateIpRule: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteIpRule: (rule: ServiceClientIpRule) => void;
  onIpForm: (form: { ipAddress: string; comment: string }) => void;
  onRefreshIpRules: () => void;
  onRefreshSessions: () => void;
  onSelectClient: (clientId: string) => void;
}) {
  return (
    <div className="service-card">
      <div className="service-card__heading">
        <strong>Пользователи онлайн</strong>
        <button className="secondary-button" type="button" onClick={onRefreshSessions}>
          <RefreshCw size={16} /> Обновить
        </button>
      </div>
      {sessions.status === 'error' ? <div className="service-message service-message--error">{sessions.error}</div> : null}
      <ServiceTable columns={['Пользователь', 'Клиент', 'Приложение', 'Браузер', 'IP', 'Открыта', 'Активность']}>
        {sessions.data.length === 0 ? (
          <tr>
            <td colSpan={7}>Активных сессий нет</td>
          </tr>
        ) : null}
        {sessions.data.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.user.name}</strong>
              <span>{item.user.email}</span>
            </td>
            <td>{sessionClients(item)}</td>
            <td><Monitor size={14} /> {item.appName || '-'}</td>
            <td>{item.browserName || '-'}</td>
            <td><Globe2 size={14} /> {item.ipAddress || '-'}</td>
            <td><Clock size={14} /> {formatSessionAge(item.startedAt)}</td>
            <td>{formatDateTime(item.lastSeenAt)}</td>
          </tr>
        ))}
      </ServiceTable>

      <div className="service-card__heading service-card__heading--sub">
        <strong>Разрешенные IP клиента</strong>
        <button className="secondary-button" type="button" onClick={onRefreshIpRules}>
          <RefreshCw size={16} /> Обновить
        </button>
      </div>
      <div className="service-toolbar">
        <select value={selectedClientId} onChange={(event) => onSelectClient(event.target.value)}>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.code} · {client.name}
            </option>
          ))}
        </select>
        <span className="service-inline-note">Если список пустой, вход с любого IP разрешен.</span>
      </div>
      <form className="service-inline-form service-inline-form--ip" onSubmit={onCreateIpRule}>
        <input
          required
          placeholder="IP-адрес"
          value={ipForm.ipAddress}
          onChange={(event) => onIpForm({ ...ipForm, ipAddress: event.target.value })}
        />
        <input
          placeholder="Комментарий"
          value={ipForm.comment}
          onChange={(event) => onIpForm({ ...ipForm, comment: event.target.value })}
        />
        <button className="primary-button" type="submit">Добавить IP</button>
      </form>
      {ipRules.status === 'error' ? <div className="service-message service-message--error">{ipRules.error}</div> : null}
      <ServiceTable columns={['Клиент', 'IP', 'Комментарий', 'Добавлен', 'Действие']}>
        {ipRules.data.length === 0 ? (
          <tr>
            <td colSpan={5}>IP-ограничений нет</td>
          </tr>
        ) : null}
        {ipRules.data.map((rule) => (
          <tr key={rule.id}>
            <td>{rule.client.code} · {rule.client.name}</td>
            <td>{rule.ipAddress}</td>
            <td>{rule.comment || '-'}</td>
            <td>{formatDateTime(rule.createdAt)}</td>
            <td><button className="danger-link" type="button" onClick={() => onDeleteIpRule(rule)}>Удалить</button></td>
          </tr>
        ))}
      </ServiceTable>
    </div>
  );
}

function TelegramSettingsPanel({
  form,
  settings,
  onChange,
  onRefresh,
  onSave,
  onTest,
}: {
  form: { enabled: boolean; botToken: string; fulfillmentChatIds: string; testChatId: string; testMessage: string };
  settings: LoadState<ServiceTelegramSettings | null>;
  onChange: (form: { enabled: boolean; botToken: string; fulfillmentChatIds: string; testChatId: string; testMessage: string }) => void;
  onRefresh: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onTest: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="service-card">
      <div className="service-card__heading">
        <strong>Telegram-уведомления</strong>
        <button className="secondary-button" type="button" onClick={onRefresh}>
          <RefreshCw size={16} /> Обновить
        </button>
      </div>
      {settings.status === 'error' ? <div className="service-message service-message--error">{settings.error}</div> : null}
      <form className="service-form-grid" onSubmit={onSave}>
        <label className="service-field service-field--checkbox">
          <input checked={form.enabled} type="checkbox" onChange={(event) => onChange({ ...form, enabled: event.target.checked })} />
          <span>Включить отправку уведомлений</span>
        </label>
        <label className="service-field">
          <span>API token бота</span>
          <input
            autoComplete="off"
            placeholder={settings.data?.hasBotToken ? 'Токен сохранен, новый вводить не обязательно' : '123456:ABC...'}
            type="password"
            value={form.botToken}
            onChange={(event) => onChange({ ...form, botToken: event.target.value })}
          />
        </label>
        <label className="service-field">
          <span>Chat ID фулфилмента</span>
          <input
            placeholder="Один или несколько chat_id через запятую"
            value={form.fulfillmentChatIds}
            onChange={(event) => onChange({ ...form, fulfillmentChatIds: event.target.value })}
          />
          <small>
            Как узнать: напишите боту любое сообщение, затем откройте ссылку getUpdates с API token бота и возьмите значение message.chat.id. Для группы сначала добавьте бота в группу.
          </small>
        </label>
        <button className="primary-button" type="submit">
          <CheckCircle2 size={16} /> Сохранить Telegram
        </button>
      </form>

      <div className="service-inline-note">
        Клиентский chat_id указывается в кабинете клиента. Бот Telegram может писать только пользователю или группе, где его уже запустили или добавили.
      </div>

      <form className="service-inline-form" onSubmit={onTest}>
        <input
          required
          placeholder="chat_id для теста"
          value={form.testChatId}
          onChange={(event) => onChange({ ...form, testChatId: event.target.value })}
        />
        <input
          placeholder="Текст теста"
          value={form.testMessage}
          onChange={(event) => onChange({ ...form, testMessage: event.target.value })}
        />
        <button className="secondary-button" type="submit">
          <Send size={16} /> Отправить тест
        </button>
      </form>
    </div>
  );
}

function TsdServicePanel({
  clients,
  form,
  users,
  onChange,
  onCreate,
  onDelete,
  onRefresh,
}: {
  clients: ClientSummary[];
  form: { name: string; email: string; password: string; clientId: string };
  users: LoadState<UserSummary[]>;
  onChange: (form: { name: string; email: string; password: string; clientId: string }) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (user: UserSummary) => void;
  onRefresh: () => void;
}) {
  const appUrl = `${window.location.origin}/tsd-app`;
  return (
    <div className="service-card">
      <div className="service-card__heading">
        <strong>Приложение ТСД</strong>
        <button className="secondary-button" type="button" onClick={() => window.open('/downloads/logoff-tsd.apk', '_blank', 'noopener,noreferrer')}>
          <Smartphone size={16} /> Скачать APK
        </button>
      </div>
      <div className="service-warning">
        <Smartphone size={18} />
        Установите APK на Android-ТСД, войдите логином сотрудника и проверьте код устройства. Резервная веб-версия: {appUrl}
      </div>

      <form className="service-inline-form" onSubmit={onCreate}>
        <input required placeholder="Имя сотрудника" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
        <input required placeholder="Логин сотрудника" autoComplete="username" value={form.email} onChange={(event) => onChange({ ...form, email: event.target.value })} />
        <input required minLength={10} placeholder="Пароль от 10 символов" type="text" value={form.password} onChange={(event) => onChange({ ...form, password: event.target.value })} />
        <select value={form.clientId} onChange={(event) => onChange({ ...form, clientId: event.target.value })}>
          <option value="">Все клиенты</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <button className="primary-button" type="submit">Создать сотрудника</button>
      </form>

      <div className="service-card__heading service-card__heading--sub">
        <strong>Сотрудники и операторы ТСД</strong>
        <button className="secondary-button" type="button" onClick={onRefresh}>
          <RefreshCw size={16} /> Обновить
        </button>
      </div>
      {users.status === 'error' ? <div className="service-message service-message--error">{users.error}</div> : null}
      <ServiceTable columns={['Имя', 'Логин', 'Статус', 'Клиенты', 'Действия']}>
        {users.data.length === 0 ? (
          <tr>
            <td colSpan={5}>Операторы ТСД не созданы</td>
          </tr>
        ) : null}
        {users.data.map((user) => (
          <tr key={user.id}>
            <td>{user.name}</td>
            <td>{user.email}</td>
            <td>{user.status}</td>
            <td>{user.clientScopes.length ? user.clientScopes.map((scope) => scope.client.name).join(', ') : 'Все клиенты'}</td>
            <td>
              <button className="danger-link" type="button" onClick={() => onDelete(user)}>
                <Trash2 size={14} /> Удалить
              </button>
            </td>
          </tr>
        ))}
      </ServiceTable>
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

function sessionClients(session: ServiceOnlineSession) {
  const clients = session.user.clientScopes.map((scope) => `${scope.client.code} · ${scope.client.name}`);
  return clients.length ? clients.join(', ') : 'Внутренний пользователь';
}

function formatSessionAge(value: string) {
  const startedAt = new Date(value).getTime();
  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} ч ${restMinutes} мин` : `${hours} ч`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить действие.';
}
