import {
  Box,
  ImageOff,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  deleteSku,
  fetchClients,
  fetchMarketplaceConnections,
  fetchSku,
  fetchSkus,
  syncMarketplaceProducts,
  updateSku,
  type AuthSession,
  type AuthUser,
  type ClientSummary,
  type MarketplaceConnectionSummary,
  type MarketplaceType,
  type SkuDetail,
  type SkuSummary,
  type UpdateSkuPayload,
} from '../../lib/api';
import './catalog.css';

type CatalogPanelProps = {
  session: AuthSession;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type SkuForm = {
  internalSku: string;
  clientSku: string;
  article: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  color: string;
  size: string;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  needsChestnyZnak: boolean;
  isUnmarked: boolean;
  needsLabel: boolean;
  needsRelabel: boolean;
};

const marketplaceLabels: Record<MarketplaceType, string> = {
  WILDBERRIES: 'Wildberries',
  OZON: 'Ozon',
  YANDEX_MARKET: 'Яндекс Маркет',
  SBER_MARKET: 'СберМегаМаркет',
  OTHER: 'Другое',
};

export function CatalogPanel({ session }: CatalogPanelProps) {
  const canRead = canUse(session.user, 'skus:read');
  const canWrite = canUse(session.user, 'skus:write');
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientState, setClientState] = useState<LoadState>('idle');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [skus, setSkus] = useState<SkuSummary[]>([]);
  const [skuState, setSkuState] = useState<LoadState>('idle');
  const [connections, setConnections] = useState<MarketplaceConnectionSummary[]>([]);
  const [selectedSku, setSelectedSku] = useState<SkuDetail | null>(null);
  const [form, setForm] = useState<SkuForm | null>(null);
  const [isEditing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  useEffect(() => {
    if (!canRead) {
      return;
    }

    let isActive = true;
    async function loadClients() {
      setClientState('loading');
      setError('');
      try {
        const list = await fetchClients(session.accessToken);
        if (!isActive) {
          return;
        }
        setClients(list);
        setSelectedClientId((current) => current || list[0]?.id || '');
        setClientState('ready');
      } catch (caught) {
        if (isActive) {
          setClientState('error');
          setError(errorMessage(caught, 'Не удалось загрузить клиентов.'));
        }
      }
    }

    void loadClients();
    return () => {
      isActive = false;
    };
  }, [canRead, session.accessToken]);

  useEffect(() => {
    if (!selectedClientId || !canRead) {
      return;
    }

    let isActive = true;
    async function loadCatalog() {
      setSkuState('loading');
      setError('');
      try {
        const [nextSkus, nextConnections] = await Promise.all([
          fetchSkus(session.accessToken, { clientId: selectedClientId, search: appliedSearch || undefined }),
          fetchMarketplaceConnections(session.accessToken, { clientId: selectedClientId }),
        ]);
        if (!isActive) {
          return;
        }
        setSkus(nextSkus);
        setConnections(nextConnections);
        setSkuState('ready');
      } catch (caught) {
        if (isActive) {
          setSkuState('error');
          setError(errorMessage(caught, 'Не удалось загрузить каталог.'));
        }
      }
    }

    void loadCatalog();
    return () => {
      isActive = false;
    };
  }, [appliedSearch, canRead, reloadKey, selectedClientId, session.accessToken]);

  if (!canRead) {
    return null;
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  async function openSku(skuId: string) {
    setError('');
    setMessage('');
    try {
      const detail = await fetchSku(session.accessToken, skuId);
      setSelectedSku(detail);
      setForm(formFromSku(detail));
      setEditing(false);
    } catch (caught) {
      setError(errorMessage(caught, 'Не удалось открыть карточку товара.'));
    }
  }

  async function runProductSync(connectionId: string) {
    setSyncingIds((current) => [...current, connectionId]);
    setError('');
    setMessage('');
    try {
      const result = await syncMarketplaceProducts(session.accessToken, connectionId);
      setMessage(
        `Товары синхронизированы. Получено: ${result.productsReceived}. Создано: ${result.created}. Обновлено: ${result.updated}.`,
      );
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setError(errorMessage(caught, 'Не удалось синхронизировать товары.'));
    } finally {
      setSyncingIds((current) => current.filter((id) => id !== connectionId));
    }
  }

  async function saveSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSku || !form || !canWrite) {
      return;
    }

    setError('');
    setMessage('');
    try {
      const updated = await updateSku(session.accessToken, selectedSku.id, payloadFromForm(form));
      setSelectedSku(updated);
      setForm(formFromSku(updated));
      setEditing(false);
      setSkus((current) => current.map((sku) => (sku.id === updated.id ? updated : sku)));
      setMessage('Карточка товара сохранена.');
    } catch (caught) {
      setError(errorMessage(caught, 'Не удалось сохранить карточку товара.'));
    }
  }

  async function removeSku() {
    if (!selectedSku || !canWrite) {
      return;
    }

    const confirmed = window.confirm(`Удалить товар ${selectedSku.name}?`);
    if (!confirmed) {
      return;
    }

    setError('');
    setMessage('');
    try {
      await deleteSku(session.accessToken, selectedSku.id);
      setSkus((current) => current.filter((sku) => sku.id !== selectedSku.id));
      setSelectedSku(null);
      setForm(null);
      setMessage('Карточка товара удалена.');
    } catch (caught) {
      setError(errorMessage(caught, 'Не удалось удалить карточку товара.'));
    }
  }

  return (
    <section className="catalog-panel" aria-label="Каталог товаров">
      <div className="section-heading catalog-panel__heading">
        <div>
          <p className="eyebrow">Каталог</p>
          <h2>Товары клиентов</h2>
        </div>
        <button className="icon-button" type="button" onClick={() => setReloadKey((current) => current + 1)} title="Обновить каталог">
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="catalog-toolbar">
        <label>
          <span>Клиент</span>
          <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} disabled={clientState === 'loading'}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} · {client.name}
              </option>
            ))}
          </select>
        </label>

        <form className="catalog-search" onSubmit={applySearch}>
          <label>
            <span>Поиск</span>
            <div>
              <Search size={16} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, SKU, артикул или штрихкод" />
            </div>
          </label>
          <button className="icon-text-button" type="submit">
            <Search size={16} aria-hidden="true" />
            <span>Найти</span>
          </button>
        </form>
      </div>

      {selectedClient ? (
        <div className="catalog-marketplaces">
          <div>
            <strong>{selectedClient.name}</strong>
            <span>Подключения маркетплейсов и принудительная выгрузка товаров</span>
          </div>
          <div className="catalog-marketplaces__actions">
            {connections.length === 0 ? <span className="catalog-muted">API не подключено</span> : null}
            {connections.map((connection) => (
              <button
                className="icon-text-button"
                disabled={!connection.isActive || syncingIds.includes(connection.id)}
                key={connection.id}
                onClick={() => void runProductSync(connection.id)}
                type="button"
                title={connection.apiKeyMask}
              >
                <RefreshCw size={15} aria-hidden="true" />
                <span>
                  {syncingIds.includes(connection.id) ? 'Загружаю' : 'Выгрузить'} {marketplaceLabel(connection.marketplace)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="catalog-table-wrap">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Фото</th>
              <th>Товар</th>
              <th>Маркетплейс</th>
              <th>Штрихкод</th>
              <th>Габариты</th>
              <th>Литраж</th>
              <th>Признаки</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((sku) => (
              <tr key={sku.id} onClick={() => void openSku(sku.id)} tabIndex={0}>
                <td>
                  <SkuPhoto sku={sku} />
                </td>
                <td>
                  <strong>{sku.name}</strong>
                  <span>{[sku.internalSku, sku.article, sku.brand].filter(Boolean).join(' · ') || '-'}</span>
                </td>
                <td>
                  <strong>{sku.marketplace ? marketplaceLabel(sku.marketplace) : 'WMS'}</strong>
                  <span>{sku.marketplaceOfferId || sku.clientSku || '-'}</span>
                </td>
                <td>{primaryBarcode(sku) || '-'}</td>
                <td>{formatDimensions(sku)}</td>
                <td>{formatNumber(sku.volumeLiters, 'л')}</td>
                <td>{skuFlags(sku).join(', ') || '-'}</td>
              </tr>
            ))}
            {skus.length === 0 ? (
              <tr>
                <td colSpan={7}>{skuState === 'loading' ? 'Загрузка каталога...' : 'Товары не найдены'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedSku && form ? (
        <SkuModal
          canWrite={canWrite}
          form={form}
          isEditing={isEditing}
          onChange={setForm}
          onClose={() => {
            setSelectedSku(null);
            setForm(null);
          }}
          onDelete={() => void removeSku()}
          onEdit={() => setEditing(true)}
          onSave={(event) => void saveSku(event)}
          sku={selectedSku}
        />
      ) : null}
    </section>
  );
}

function SkuModal({
  canWrite,
  form,
  isEditing,
  onChange,
  onClose,
  onDelete,
  onEdit,
  onSave,
  sku,
}: {
  canWrite: boolean;
  form: SkuForm;
  isEditing: boolean;
  onChange: (form: SkuForm) => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  sku: SkuDetail;
}) {
  return (
    <div className="catalog-modal-backdrop" role="presentation">
      <section className="catalog-modal" aria-label="Карточка товара" role="dialog" aria-modal="true">
        <header className="catalog-modal__header">
          <div>
            <span>{sku.marketplace ? marketplaceLabel(sku.marketplace) : 'Карточка WMS'}</span>
            <h3>{sku.name}</h3>
          </div>
          <div className="catalog-modal__actions">
            {canWrite && !isEditing ? (
              <button className="icon-text-button" type="button" onClick={onEdit}>
                <Pencil size={15} aria-hidden="true" />
                <span>Редактировать</span>
              </button>
            ) : null}
            {canWrite ? (
              <button className="icon-text-button catalog-danger-button" type="button" onClick={onDelete}>
                <Trash2 size={15} aria-hidden="true" />
                <span>Удалить</span>
              </button>
            ) : null}
            <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть карточку">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="catalog-modal__body">
          <aside className="catalog-modal__media">
            <SkuPhoto sku={sku} large />
            <div className="catalog-photo-strip">
              {sku.marketplacePhotos.slice(0, 8).map((photo) => (
                <img alt={sku.name} key={photo} src={photo} />
              ))}
              {sku.marketplacePhotos.length === 0 ? <span>Фото из API пока нет</span> : null}
            </div>
          </aside>

          <form className="catalog-card-form" onSubmit={onSave}>
            <div className="catalog-card-form__grid">
              <TextField disabled={!isEditing} label="Название" value={form.name} onChange={(value) => onChange({ ...form, name: value })} />
              <TextField disabled={!isEditing} label="Внутренний SKU" value={form.internalSku} onChange={(value) => onChange({ ...form, internalSku: value })} />
              <TextField disabled={!isEditing} label="SKU клиента" value={form.clientSku} onChange={(value) => onChange({ ...form, clientSku: value })} />
              <TextField disabled={!isEditing} label="Артикул" value={form.article} onChange={(value) => onChange({ ...form, article: value })} />
              <TextField disabled={!isEditing} label="Штрихкод" value={form.barcode} onChange={(value) => onChange({ ...form, barcode: value })} />
              <TextField disabled={!isEditing} label="Бренд" value={form.brand} onChange={(value) => onChange({ ...form, brand: value })} />
              <TextField disabled={!isEditing} label="Категория" value={form.category} onChange={(value) => onChange({ ...form, category: value })} />
              <TextField disabled={!isEditing} label="Цвет" value={form.color} onChange={(value) => onChange({ ...form, color: value })} />
              <TextField disabled={!isEditing} label="Размер" value={form.size} onChange={(value) => onChange({ ...form, size: value })} />
              <TextField disabled={!isEditing} label="Вес, г" value={form.weightGrams} onChange={(value) => onChange({ ...form, weightGrams: value })} />
              <TextField disabled={!isEditing} label="Длина, см" value={form.lengthCm} onChange={(value) => onChange({ ...form, lengthCm: value })} />
              <TextField disabled={!isEditing} label="Ширина, см" value={form.widthCm} onChange={(value) => onChange({ ...form, widthCm: value })} />
              <TextField disabled={!isEditing} label="Высота, см" value={form.heightCm} onChange={(value) => onChange({ ...form, heightCm: value })} />
            </div>

            <div className="catalog-card-form__checks">
              <CheckboxField disabled={!isEditing} label="Честный ЗНАК" checked={form.needsChestnyZnak} onChange={(value) => onChange({ ...form, needsChestnyZnak: value })} />
              <CheckboxField disabled={!isEditing} label="Без маркировки" checked={form.isUnmarked} onChange={(value) => onChange({ ...form, isUnmarked: value })} />
              <CheckboxField disabled={!isEditing} label="Нужна этикетка" checked={form.needsLabel} onChange={(value) => onChange({ ...form, needsLabel: value })} />
              <CheckboxField disabled={!isEditing} label="Нужна перемаркировка" checked={form.needsRelabel} onChange={(value) => onChange({ ...form, needsRelabel: value })} />
            </div>

            <section className="catalog-detail-section">
              <h4>Характеристики из API</h4>
              {sku.marketplaceCharacteristics.length ? (
                <dl className="catalog-characteristics">
                  {sku.marketplaceCharacteristics.map((item) => (
                    <div key={`${item.name}-${item.value}`}>
                      <dt>{item.name}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="catalog-muted">Характеристики из маркетплейса пока не загружены.</p>
              )}
            </section>

            <section className="catalog-detail-section">
              <h4>Остатки по местам хранения</h4>
              <div className="catalog-stock-list">
                {(sku.balances ?? []).map((balance) => (
                  <div key={balance.id}>
                    <Box size={15} aria-hidden="true" />
                    <span>{balance.box?.code || balance.pallet?.code || 'Без места'}</span>
                    <strong>{balance.quantity} шт.</strong>
                  </div>
                ))}
                {(sku.balances ?? []).length === 0 ? <p className="catalog-muted">Остатков по товару сейчас нет.</p> : null}
              </div>
            </section>

            <section className="catalog-detail-section">
              <h4>Сырые данные маркетплейса</h4>
              <pre className="catalog-json">{JSON.stringify(sku.marketplacePayload ?? {}, null, 2)}</pre>
            </section>

            {isEditing ? (
              <div className="catalog-card-form__actions">
                <button className="primary-button" type="submit">
                  <Save size={16} aria-hidden="true" />
                  <span>Сохранить</span>
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}

function TextField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CheckboxField({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label>
      <input disabled={disabled} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SkuPhoto({ large = false, sku }: { large?: boolean; sku: SkuSummary }) {
  const photo = sku.marketplacePhotos[0];
  if (!photo) {
    return (
      <span className={large ? 'catalog-photo catalog-photo--large catalog-photo--empty' : 'catalog-photo catalog-photo--empty'}>
        <ImageOff size={large ? 30 : 18} aria-hidden="true" />
      </span>
    );
  }

  return <img className={large ? 'catalog-photo catalog-photo--large' : 'catalog-photo'} alt={sku.name} src={photo} />;
}

function formFromSku(sku: SkuDetail): SkuForm {
  return {
    internalSku: sku.internalSku,
    clientSku: sku.clientSku ?? '',
    article: sku.article ?? '',
    barcode: primaryBarcode(sku),
    name: sku.name,
    brand: sku.brand ?? '',
    category: sku.category ?? '',
    color: sku.color ?? '',
    size: sku.size ?? '',
    weightGrams: valueToText(sku.weightGrams),
    lengthCm: valueToText(sku.lengthCm),
    widthCm: valueToText(sku.widthCm),
    heightCm: valueToText(sku.heightCm),
    needsChestnyZnak: sku.needsChestnyZnak,
    isUnmarked: sku.isUnmarked,
    needsLabel: sku.needsLabel,
    needsRelabel: sku.needsRelabel,
  };
}

function payloadFromForm(form: SkuForm): UpdateSkuPayload {
  return {
    internalSku: form.internalSku.trim(),
    clientSku: form.clientSku.trim(),
    article: form.article.trim(),
    barcode: form.barcode.trim(),
    name: form.name.trim(),
    brand: form.brand.trim(),
    category: form.category.trim(),
    color: form.color.trim(),
    size: form.size.trim(),
    weightGrams: parseOptionalNumber(form.weightGrams),
    lengthCm: parseOptionalNumber(form.lengthCm),
    widthCm: parseOptionalNumber(form.widthCm),
    heightCm: parseOptionalNumber(form.heightCm),
    needsChestnyZnak: form.needsChestnyZnak,
    isUnmarked: form.isUnmarked,
    needsLabel: form.needsLabel,
    needsRelabel: form.needsRelabel,
  };
}

function primaryBarcode(sku: SkuSummary) {
  return sku.barcodes.find((barcode) => barcode.isPrimary)?.value ?? sku.barcodes[0]?.value ?? '';
}

function formatDimensions(sku: SkuSummary) {
  if (!sku.lengthCm || !sku.widthCm || !sku.heightCm) {
    return '-';
  }

  return `${sku.lengthCm} × ${sku.widthCm} × ${sku.heightCm} см`;
}

function formatNumber(value: string | number | null, suffix: string) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return `${value} ${suffix}`;
}

function skuFlags(sku: SkuSummary) {
  return [
    sku.needsChestnyZnak ? 'ЧЗ' : '',
    sku.isUnmarked ? 'без маркировки' : '',
    sku.needsLabel ? 'этикетка' : '',
    sku.needsRelabel ? 'перемаркировка' : '',
  ].filter(Boolean);
}

function valueToText(value: string | number | null) {
  return value === null || value === undefined ? '' : String(value);
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function marketplaceLabel(type: MarketplaceType) {
  return marketplaceLabels[type] ?? type;
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}
