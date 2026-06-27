import { Save } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import {
  createSku,
  fetchClients,
  type AuthSession,
  type ClientSummary,
  type CreateSkuPayload,
  type SkuSummary,
} from '../../lib/api';
import { DirectoryResultCard } from './DirectoryResultCard';

type SkuCreateFormProps = {
  session: AuthSession;
  onCreated?: () => void;
};

const emptySkuForm = {
  clientId: '',
  internalSku: '',
  clientSku: '',
  article: '',
  name: '',
  barcode: '',
  color: '',
  size: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  needsChestnyZnak: false,
};

export function SkuCreateForm({ session, onCreated }: SkuCreateFormProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [form, setForm] = useState(emptySkuForm);
  const [createdSku, setCreatedSku] = useState<SkuSummary | null>(null);
  const [error, setError] = useState('');
  const [isLoadingClients, setLoadingClients] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadClients() {
      setLoadingClients(true);
      setError('');

      try {
        const list = await fetchClients(session.accessToken);
        if (!isActive) {
          return;
        }

        setClients(list);
        setForm((current) => ({ ...current, clientId: current.clientId || list[0]?.id || '' }));
      } catch (caught) {
        if (isActive) {
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить клиентов.');
        }
      } finally {
        if (isActive) {
          setLoadingClients(false);
        }
      }
    }

    void loadClients();

    return () => {
      isActive = false;
    };
  }, [session.accessToken]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setCreatedSku(null);

    try {
      const created = await createSku(session.accessToken, compactPayload(form));
      setCreatedSku(created);
      setForm({ ...emptySkuForm, clientId: form.clientId });
      onCreated?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать SKU.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="directory-form" onSubmit={submit}>
      <div className="directory-subheading">
        <div>
          <h3>Создать номенклатуру вручную</h3>
          <span>Карточка товара привязывается к выбранному клиенту</span>
        </div>
      </div>

      <div className="directory-fields directory-fields--sku">
        <label>
          <span>Клиент</span>
          <select
            value={form.clientId}
            onChange={(event) => setForm({ ...form, clientId: event.target.value })}
            disabled={isLoadingClients}
            required
          >
            {clients.length === 0 ? <option value="">Клиенты не найдены</option> : null}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} - {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Внутренний SKU</span>
          <input value={form.internalSku} onChange={(event) => setForm({ ...form, internalSku: event.target.value })} required />
        </label>
        <label>
          <span>Название</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          <span>Штрихкод</span>
          <input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} />
        </label>
        <label>
          <span>SKU клиента</span>
          <input value={form.clientSku} onChange={(event) => setForm({ ...form, clientSku: event.target.value })} />
        </label>
        <label>
          <span>Артикул</span>
          <input value={form.article} onChange={(event) => setForm({ ...form, article: event.target.value })} />
        </label>
        <label>
          <span>Цвет</span>
          <input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
        </label>
        <label>
          <span>Размер</span>
          <input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} />
        </label>
        <label>
          <span>Длина, см</span>
          <input min="0.01" step="0.01" type="number" value={form.lengthCm} onChange={(event) => setForm({ ...form, lengthCm: event.target.value })} />
        </label>
        <label>
          <span>Ширина, см</span>
          <input min="0.01" step="0.01" type="number" value={form.widthCm} onChange={(event) => setForm({ ...form, widthCm: event.target.value })} />
        </label>
        <label>
          <span>Высота, см</span>
          <input min="0.01" step="0.01" type="number" value={form.heightCm} onChange={(event) => setForm({ ...form, heightCm: event.target.value })} />
        </label>
        <label className="directory-checkbox">
          <input
            checked={form.needsChestnyZnak}
            type="checkbox"
            onChange={(event) => setForm({ ...form, needsChestnyZnak: event.target.checked })}
          />
          <span>Честный знак</span>
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button directory-submit" type="submit" disabled={isSubmitting || !form.clientId}>
        <Save size={16} aria-hidden="true" />
        <span>{isSubmitting ? 'Сохранение' : 'Создать SKU'}</span>
      </button>

      {createdSku ? (
        <DirectoryResultCard
          title="SKU создан"
          lines={[
            `${createdSku.internalSku} - ${createdSku.name}`,
            createdSku.barcodes[0]?.value ? `ШК: ${createdSku.barcodes[0].value}` : 'штрихкод не задан',
          ]}
        />
      ) : null}
    </form>
  );
}

function compactPayload(form: typeof emptySkuForm): CreateSkuPayload {
  return {
    clientId: form.clientId,
    internalSku: form.internalSku.trim(),
    name: form.name.trim(),
    needsChestnyZnak: form.needsChestnyZnak,
    ...optionalString('clientSku', form.clientSku),
    ...optionalString('article', form.article),
    ...optionalString('barcode', form.barcode),
    ...optionalString('color', form.color),
    ...optionalString('size', form.size),
    ...optionalNumber('lengthCm', form.lengthCm),
    ...optionalNumber('widthCm', form.widthCm),
    ...optionalNumber('heightCm', form.heightCm),
  };
}

function optionalString<T extends string>(key: T, value: string): Partial<Record<T, string>> {
  const trimmed = value.trim();
  return trimmed ? ({ [key]: trimmed } as Partial<Record<T, string>>) : {};
}

function optionalNumber<T extends string>(key: T, value: string): Partial<Record<T, number>> {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? ({ [key]: parsed } as Partial<Record<T, number>>) : {};
}
