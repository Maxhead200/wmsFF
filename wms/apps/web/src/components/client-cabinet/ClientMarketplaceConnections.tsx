import { PlugZap, RefreshCw, Save, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createMarketplaceConnection,
  deleteMarketplaceConnection,
  fetchMarketplaceConnections,
  syncMarketplaceProducts,
  updateMarketplaceConnection,
  type ClientSummary,
  type MarketplaceConnectionSummary,
  type MarketplaceType,
} from '../../lib/api';

type ClientMarketplaceConnectionsProps = {
  accessToken: string;
  client: ClientSummary;
};

type MarketplaceForm = {
  id: string;
  marketplace: MarketplaceType;
  accountName: string;
  sellerId: string;
  apiKey: string;
  isActive: boolean;
  comment: string;
};

const marketplaceOptions: Array<{ value: MarketplaceType; label: string }> = [
  { value: 'WILDBERRIES', label: 'Wildberries' },
  { value: 'OZON', label: 'Ozon' },
  { value: 'YANDEX_MARKET', label: 'Яндекс Маркет' },
  { value: 'SBER_MARKET', label: 'СберМегаМаркет' },
  { value: 'OTHER', label: 'Другое' },
];

const emptyForm: MarketplaceForm = {
  id: '',
  marketplace: 'WILDBERRIES',
  accountName: '',
  sellerId: '',
  apiKey: '',
  isActive: true,
  comment: '',
};

export function ClientMarketplaceConnections({ accessToken, client }: ClientMarketplaceConnectionsProps) {
  const [connections, setConnections] = useState<MarketplaceConnectionSummary[]>([]);
  const [form, setForm] = useState<MarketplaceForm>(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === form.id) ?? null,
    [connections, form.id],
  );

  useEffect(() => {
    setForm(emptyForm);
    setMessage('');
    setError('');
    void loadConnections();
  }, [client.id]);

  async function loadConnections() {
    setLoading(true);
    setError('');
    try {
      setConnections(await fetchMarketplaceConnections(accessToken, { clientId: client.id }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить подключения маркетплейсов.');
    } finally {
      setLoading(false);
    }
  }

  function editConnection(connection: MarketplaceConnectionSummary) {
    setForm({
      id: connection.id,
      marketplace: connection.marketplace,
      accountName: connection.accountName ?? '',
      sellerId: connection.sellerId ?? '',
      apiKey: '',
      isActive: connection.isActive,
      comment: connection.comment ?? '',
    });
    setMessage('Для замены ключа вставьте новый API-ключ. Если оставить поле пустым, старый ключ сохранится.');
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        clientId: client.id,
        marketplace: form.marketplace,
        accountName: form.accountName.trim(),
        sellerId: form.sellerId.trim(),
        apiKey: form.apiKey.trim(),
        isActive: form.isActive,
        comment: form.comment.trim(),
      };
      if (form.id) {
        const { apiKey, ...withoutApiKey } = payload;
        const updated = await updateMarketplaceConnection(accessToken, form.id, apiKey ? payload : withoutApiKey);
        setConnections((current) => current.map((connection) => (connection.id === updated.id ? updated : connection)));
        setMessage('Подключение обновлено.');
        if (apiKey) {
          await runProductSync(updated.id, true);
        }
      } else {
        const created = await createMarketplaceConnection(accessToken, payload);
        setConnections((current) => [created, ...current]);
        setMessage('Подключение создано.');
        await runProductSync(created.id, true);
      }
      setForm(emptyForm);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить подключение.');
    } finally {
      setSubmitting(false);
    }
  }

  async function runProductSync(connectionId: string, afterSave = false) {
    setSyncingIds((current) => [...current, connectionId]);
    setError('');
    try {
      const result = await syncMarketplaceProducts(accessToken, connectionId);
      setMessage(
        [
          afterSave ? 'Подключение сохранено, товары синхронизированы.' : 'Товары синхронизированы.',
          `Получено: ${result.productsReceived}. Создано: ${result.created}. Обновлено: ${result.updated}.`,
          result.skipped ? `Пропущено: ${result.skipped}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (caught) {
      if (afterSave) {
        setMessage('Подключение сохранено, но товары не загрузились автоматически.');
      }
      setError(caught instanceof Error ? caught.message : 'Не удалось синхронизировать товары.');
    } finally {
      setSyncingIds((current) => current.filter((id) => id !== connectionId));
    }
  }

  async function removeConnection(connection: MarketplaceConnectionSummary) {
    const confirmed = window.confirm(`Удалить подключение ${marketplaceLabel(connection.marketplace)} для клиента ${client.name}?`);
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const deleted = await deleteMarketplaceConnection(accessToken, connection.id);
      setConnections((current) => current.filter((item) => item.id !== deleted.id));
      if (form.id === deleted.id) {
        setForm(emptyForm);
      }
      setMessage('Подключение удалено.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить подключение.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="client-marketplace-panel" aria-label="API маркетплейсов">
      <div className="client-marketplace-panel__heading">
        <div>
          <h3>API маркетплейсов</h3>
          <span>Wildberries, Ozon и другие подключения клиента</span>
        </div>
        <button className="icon-text-button" type="button" onClick={() => void loadConnections()} disabled={isLoading}>
          <PlugZap size={15} aria-hidden="true" />
          <span>{isLoading ? 'Обновляю' : 'Обновить'}</span>
        </button>
      </div>

      <form className="client-marketplace-form" onSubmit={submit}>
        <label>
          <span>Маркетплейс</span>
          <select value={form.marketplace} onChange={(event) => setForm({ ...form, marketplace: event.target.value as MarketplaceType })}>
            {marketplaceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Название кабинета</span>
          <input value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} />
        </label>
        <label>
          <span>ID продавца / кабинета</span>
          <input value={form.sellerId} onChange={(event) => setForm({ ...form, sellerId: event.target.value })} />
        </label>
        <label>
          <span>{form.id ? 'Новый API-ключ' : 'API-ключ'}</span>
          <input
            value={form.apiKey}
            onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
            placeholder={form.id ? selectedConnection?.apiKeyMask ?? '' : ''}
            required={!form.id}
          />
        </label>
        <label className="client-marketplace-checkbox">
          <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
          <span>Подключение активно</span>
        </label>
        <label>
          <span>Комментарий</span>
          <input value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
        </label>
        <div className="client-marketplace-form__actions">
          <button className="primary-button" type="submit" disabled={isSubmitting || (!form.id && form.apiKey.trim().length < 8)}>
            <Save size={16} aria-hidden="true" />
            <span>{isSubmitting ? 'Сохранение' : form.id ? 'Сохранить' : 'Добавить'}</span>
          </button>
          {form.id ? (
            <button className="icon-text-button" type="button" onClick={() => setForm(emptyForm)} disabled={isSubmitting}>
              Новое подключение
            </button>
          ) : null}
        </div>
      </form>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="client-marketplace-table-wrap">
        <table className="client-marketplace-table">
          <thead>
            <tr>
              <th>Маркетплейс</th>
              <th>Кабинет</th>
              <th>ID</th>
              <th>API-ключ</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 ? (
              <tr>
                <td colSpan={6}>Подключения не добавлены</td>
              </tr>
            ) : null}
            {connections.map((connection) => (
              <tr key={connection.id}>
                <td>{marketplaceLabel(connection.marketplace)}</td>
                <td>{connection.accountName || 'не задан'}</td>
                <td>{connection.sellerId || 'не задан'}</td>
                <td>{connection.apiKeyMask}</td>
                <td>{connection.isActive ? 'Активно' : 'Отключено'}</td>
                <td>
                  <div className="client-marketplace-row-actions">
                    <button className="icon-text-button" type="button" onClick={() => editConnection(connection)}>
                      Редактировать
                    </button>
                    <button
                      className="icon-text-button"
                      type="button"
                      onClick={() => void runProductSync(connection.id)}
                      disabled={syncingIds.includes(connection.id) || !connection.isActive}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      <span>{syncingIds.includes(connection.id) ? 'Загрузка' : 'Синхронизировать товары'}</span>
                    </button>
                    <button className="icon-text-button client-cabinet-danger-button" type="button" onClick={() => void removeConnection(connection)}>
                      <Trash2 size={14} aria-hidden="true" />
                      <span>Удалить</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function marketplaceLabel(type: MarketplaceType) {
  return marketplaceOptions.find((option) => option.value === type)?.label ?? type;
}
