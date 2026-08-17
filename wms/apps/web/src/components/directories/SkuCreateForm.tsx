import { Save } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  createNomenclatureItem,
  type AuthSession,
  type CreateNomenclaturePayload,
  type NomenclatureSummary,
} from '../../lib/api';
import { DirectoryResultCard } from './DirectoryResultCard';

type SkuCreateFormProps = {
  session: AuthSession;
  onCreated?: () => void;
};

const emptySkuForm = {
  internalSku: '',
  article: '',
  name: '',
  barcode: '',
  printName: '',
  unit: 'шт',
  itemType: '',
  color: '',
  size: '',
  needsChestnyZnak: false,
};

export function SkuCreateForm({ session, onCreated }: SkuCreateFormProps) {
  const [form, setForm] = useState(emptySkuForm);
  const [createdSku, setCreatedSku] = useState<NomenclatureSummary | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setCreatedSku(null);

    try {
      const created = await createNomenclatureItem(session.accessToken, compactPayload(form));
      setCreatedSku(created);
      setForm(emptySkuForm);
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
          <span>Карточка товара создается в общем справочнике</span>
        </div>
      </div>

      <div className="directory-fields directory-fields--sku">
        <label>
          <span>Внутренний SKU</span>
          <input value={form.internalSku} onChange={(event) => setForm({ ...form, internalSku: event.target.value })} />
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
          <span>Наименование для печати</span>
          <input value={form.printName} onChange={(event) => setForm({ ...form, printName: event.target.value })} />
        </label>
        <label>
          <span>Артикул</span>
          <input value={form.article} onChange={(event) => setForm({ ...form, article: event.target.value })} />
        </label>
        <label>
          <span>Единица хранения</span>
          <input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
        </label>
        <label>
          <span>Тип номенклатуры</span>
          <input value={form.itemType} onChange={(event) => setForm({ ...form, itemType: event.target.value })} />
        </label>
        <label>
          <span>Цвет</span>
          <input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
        </label>
        <label>
          <span>Размер</span>
          <input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} />
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

      <button className="primary-button directory-submit" type="submit" disabled={isSubmitting}>
        <Save size={16} aria-hidden="true" />
        <span>{isSubmitting ? 'Сохранение' : 'Создать номенклатуру'}</span>
      </button>

      {createdSku ? (
        <DirectoryResultCard
          title="Номенклатура создана"
          lines={[
            `${createdSku.internalSku} - ${createdSku.name}`,
            createdSku.barcode ? `ШК: ${createdSku.barcode}` : 'штрихкод не задан',
          ]}
        />
      ) : null}
    </form>
  );
}

function compactPayload(form: typeof emptySkuForm): CreateNomenclaturePayload {
  return {
    name: form.name.trim(),
    needsChestnyZnak: form.needsChestnyZnak,
    ...optionalString('internalSku', form.internalSku),
    ...optionalString('article', form.article),
    ...optionalString('barcode', form.barcode),
    ...optionalString('printName', form.printName),
    ...optionalString('unit', form.unit),
    ...optionalString('itemType', form.itemType),
    ...optionalString('color', form.color),
    ...optionalString('size', form.size),
  };
}

function optionalString<T extends string>(key: T, value: string): Partial<Record<T, string>> {
  const trimmed = value.trim();
  return trimmed ? ({ [key]: trimmed } as Partial<Record<T, string>>) : {};
}
