import { PlusCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createBillingService,
  type AuthSession,
  type BillingServiceSummary,
  type BillingUnit,
} from '../../lib/api';
import { billingUnitOptions } from './billingMeta';

type BillingServiceFormProps = {
  session: AuthSession;
  onCreated: (service: BillingServiceSummary) => void;
};

export function BillingServiceForm({ session, onCreated }: BillingServiceFormProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<BillingUnit>('SERVICE');
  const [defaultPriceRub, setDefaultPriceRub] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const service = await createBillingService(session.accessToken, {
        code,
        name,
        unit,
        defaultPriceRub: defaultPriceRub ? Number(defaultPriceRub) : undefined,
      });
      onCreated(service);
      setCode('');
      setName('');
      setDefaultPriceRub('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать услугу.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="billing-form" onSubmit={(event) => void submit(event)}>
      <div className="billing-fields billing-fields--service">
        <label>
          <span>Код</span>
          <input required value={code} onChange={(event) => setCode(event.target.value)} />
        </label>

        <label>
          <span>Название</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label>
          <span>Единица</span>
          <select value={unit} onChange={(event) => setUnit(event.target.value as BillingUnit)}>
            {billingUnitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Цена, ₽</span>
          <input
            min="0"
            step="0.01"
            type="number"
            value={defaultPriceRub}
            onChange={(event) => setDefaultPriceRub(event.target.value)}
          />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button billing-submit" disabled={isSubmitting} type="submit">
        <PlusCircle size={16} aria-hidden="true" />
        <span>{isSubmitting ? 'Создаю' : 'Создать услугу'}</span>
      </button>
    </form>
  );
}
