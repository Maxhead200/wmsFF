import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eraser,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fetchClients,
  fetchServiceClientStockCleanupPreview,
  purgeServiceClientStock,
  type AuthSession,
  type ClientSummary,
  type ServiceClientStockCleanupPreview,
  type ServiceClientStockCleanupResult,
  type ServiceClientStockSummary,
} from '../../lib/api';
import './service-center.css';

type LoadState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T;
  error?: string;
};

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

const serviceModes = [
  {
    title: 'Очистка остатков клиента',
    text: 'Удаляет складские остатки, движения, КИЗы, короба и паллеты выбранного клиента.',
    status: 'Готово',
    active: true,
  },
  {
    title: 'Удаление отдельных элементов',
    text: 'Точечные операции будут добавляться сюда: короб, паллета, движение, заявка, счет.',
    status: 'Контур',
    active: false,
  },
  {
    title: 'Системные режимы',
    text: 'Единое место для будущих блокировок импорта, обслуживания и регламентных действий.',
    status: 'Контур',
    active: false,
  },
] as const;

export function ServiceCenterPanel({ session }: ServiceCenterPanelProps) {
  const [clients, setClients] = useState<LoadState<ClientSummary[]>>({ status: 'idle', data: [] });
  const [selectedClientId, setSelectedClientId] = useState('');
  const [preview, setPreview] = useState<LoadState<ServiceClientStockCleanupPreview | null>>({
    status: 'idle',
    data: null,
  });
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<ServiceClientStockCleanupResult | null>(null);
  const [isPurging, setPurging] = useState(false);

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
    void loadClients();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setPreview({ status: 'idle', data: null });
      return;
    }

    void loadPreview(selectedClientId);
  }, [selectedClientId]);

  async function loadClients() {
    setClients((current) => ({ ...current, status: 'loading', error: undefined }));
    try {
      const loaded = await fetchClients(session.accessToken);
      setClients({ status: 'ready', data: loaded });
      if (!selectedClientId && loaded.length > 0) {
        setSelectedClientId(loaded[0].id);
      }
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
      const loaded = await fetchServiceClientStockCleanupPreview(session.accessToken, clientId);
      setPreview({ status: 'ready', data: loaded });
      setConfirmation('');
    } catch (caught) {
      setPreview((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
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
    } catch (caught) {
      setPreview((current) => ({ ...current, status: 'error', error: errorMessage(caught) }));
    } finally {
      setPurging(false);
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

      <div className="service-modes">
        {serviceModes.map((mode) => (
          <article className={mode.active ? 'service-mode service-mode--active' : 'service-mode'} key={mode.title}>
            <Settings2 size={18} aria-hidden="true" />
            <div>
              <strong>{mode.title}</strong>
              <span>{mode.text}</span>
            </div>
            <small>{mode.status}</small>
          </article>
        ))}
      </div>

      <div className="service-cleanup">
        <div className="service-cleanup__controls">
          <label>
            <span>Клиент</span>
            <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
              {clients.status === 'loading' ? <option value="">Загрузка клиентов...</option> : null}
              {clients.data.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.code} · {client.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={() => loadPreview()} disabled={!selectedClientId}>
            <RefreshCw size={16} aria-hidden="true" />
            Обновить
          </button>
        </div>

        {clients.status === 'error' ? <div className="service-message service-message--error">{clients.error}</div> : null}
        {preview.status === 'error' ? <div className="service-message service-message--error">{preview.error}</div> : null}

        <div className="service-client-card">
          <div>
            <span>Выбранный клиент</span>
            <strong>{selectedClient ? `${selectedClient.code} · ${selectedClient.name}` : 'Клиент не выбран'}</strong>
          </div>
          <span className="status status--ready">{selectedClient?.status ?? '-'}</span>
        </div>

        <div className="service-metrics">
          <Metric icon={<Database size={17} />} label="Единиц на остатке" value={currentSummary.quantity} />
          <Metric icon={<Database size={17} />} label="SKU в остатках" value={currentSummary.uniqueSkusInStock} />
          <Metric icon={<Eraser size={17} />} label="Строк balances" value={currentSummary.balanceRows} />
          <Metric icon={<Eraser size={17} />} label="Движений" value={currentSummary.movements} />
          <Metric icon={<Eraser size={17} />} label="Коробов" value={currentSummary.boxes} />
          <Metric icon={<Eraser size={17} />} label="Паллет" value={currentSummary.pallets} />
          <Metric icon={<Eraser size={17} />} label="КИЗов" value={currentSummary.productMarks} />
        </div>

        <div className="service-warning">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{preview.data?.warning ?? 'Выберите клиента, чтобы увидеть данные для очистки.'}</span>
        </div>

        <div className="service-danger-zone">
          <label>
            <span>Подтверждение</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={`Введите ${preview.data?.confirmationText ?? 'ОЧИСТИТЬ'}`}
            />
          </label>
          <button className="danger-button" type="button" onClick={purgeStock} disabled={!canPurge || isPurging}>
            <Trash2 size={16} aria-hidden="true" />
            Очистить остатки клиента
          </button>
        </div>

        {result ? (
          <div className="service-message service-message--success">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>
              Остатки очищены: balances {result.deleted.balances}, движений {result.deleted.movements}, коробов{' '}
              {result.deleted.boxes}, паллет {result.deleted.pallets}, КИЗов {result.deleted.productMarks}.
            </span>
          </div>
        ) : null}
      </div>
    </section>
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

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить действие.';
}
