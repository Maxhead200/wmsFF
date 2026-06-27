import { RefreshCw, Search } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { fetchClients, fetchSkus, type AuthSession, type ClientSummary, type SkuSummary } from '../../lib/api';

type SkuDirectoryTableProps = {
  session: AuthSession;
  reloadKey: number;
};

export function SkuDirectoryTable({ session, reloadKey }: SkuDirectoryTableProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [localReloadKey, setLocalReloadKey] = useState(0);
  const [skus, setSkus] = useState<SkuSummary[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadClients() {
      try {
        const list = await fetchClients(session.accessToken);
        if (!isActive) {
          return;
        }

        setClients(list);
        setClientId((current) => current || list[0]?.id || '');
      } catch (caught) {
        if (isActive) {
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить клиентов.');
        }
      }
    }

    void loadClients();

    return () => {
      isActive = false;
    };
  }, [session.accessToken]);

  useEffect(() => {
    let isActive = true;

    async function loadSkus() {
      setLoading(true);
      setError('');
      try {
        const list = await fetchSkus(session.accessToken, {
          clientId: clientId || undefined,
          search: appliedSearch || undefined,
        });
        if (isActive) {
          setSkus(list);
        }
      } catch (caught) {
        if (isActive) {
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить номенклатуру.');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadSkus();

    return () => {
      isActive = false;
    };
  }, [appliedSearch, clientId, localReloadKey, reloadKey, session.accessToken]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  return (
    <div className="client-table-block">
      <div className="directory-subheading">
        <div>
          <h3>Номенклатура</h3>
          <span>Последние 100 карточек по выбранному клиенту</span>
        </div>
      </div>

      <form className="sku-table-toolbar" onSubmit={applySearch}>
        <label className="directory-select-row">
          <span>Клиент</span>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Все доступные клиенты</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} - {client.name}
              </option>
            ))}
          </select>
        </label>

        <label className="directory-select-row">
          <span>Поиск</span>
          <div className="sku-search-box">
            <Search size={16} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название, SKU или штрихкод"
            />
          </div>
        </label>

        <button className="icon-text-button" type="submit">
          <Search size={16} aria-hidden="true" />
          Найти
        </button>
        <button className="icon-text-button" type="button" onClick={() => setLocalReloadKey((current) => current + 1)}>
          <RefreshCw size={16} aria-hidden="true" />
          Обновить
        </button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="client-table-scroll">
        <table className="client-directory-table sku-directory-table">
          <thead>
            <tr>
              <th>Внутренний SKU</th>
              <th>Наименование</th>
              <th>Артикул</th>
              <th>Штрихкод</th>
              <th>Цвет</th>
              <th>Размер</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((sku) => (
              <tr key={sku.id}>
                <td>{sku.internalSku}</td>
                <td>{sku.name}</td>
                <td>{sku.article || '-'}</td>
                <td>{sku.barcodes[0]?.value || '-'}</td>
                <td>{sku.color || '-'}</td>
                <td>{sku.size || '-'}</td>
              </tr>
            ))}
            {skus.length === 0 ? (
              <tr>
                <td colSpan={6}>{isLoading ? 'Загрузка...' : 'Номенклатура не найдена'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
