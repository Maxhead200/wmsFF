import { Calculator, RefreshCw } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import {
  fetchLogisticsTariffSets,
  quoteLogistics,
  type AuthSession,
  type AuthUser,
  type LogisticsQuoteResult,
  type LogisticsTariffSetSummary,
} from '../../lib/api';
import './logistics.css';
import { LogisticsQuoteResultCard } from './LogisticsQuoteResultCard';

type LogisticsQuotePanelProps = {
  session: AuthSession;
};

type QuantityMode = 'boxes' | 'pallets';

const defaultQuoteDate = new Date().toISOString().slice(0, 10);

export function LogisticsQuotePanel({ session }: LogisticsQuotePanelProps) {
  const [tariffs, setTariffs] = useState<LogisticsTariffSetSummary[]>([]);
  const [tariffSetId, setTariffSetId] = useState('');
  const [origin, setOrigin] = useState('МОСКВА');
  const [destination, setDestination] = useState('');
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('boxes');
  const [quantity, setQuantity] = useState('1');
  const [quoteDate, setQuoteDate] = useState(defaultQuoteDate);
  const [result, setResult] = useState<LogisticsQuoteResult | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadTariffs();
  }, [session.accessToken]);

  if (!canUse(session.user, 'logistics:read')) {
    return null;
  }

  async function loadTariffs() {
    setLoading(true);
    setError('');

    try {
      const nextTariffs = await fetchLogisticsTariffSets(session.accessToken);
      setTariffs(nextTariffs);
      setTariffSetId((current) => current || nextTariffs[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить наборы тарифов.');
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setResult(null);

    try {
      const parsedQuantity = Number(quantity);
      // Русский комментарий: backend принимает ровно один параметр количества, поэтому режим формы разворачиваем в boxes или pallets.
      const quote = await quoteLogistics(session.accessToken, {
        origin: origin.trim(),
        destination: destination.trim(),
        quoteDate: quoteDate || undefined,
        tariffSetId: tariffSetId || undefined,
        ...(quantityMode === 'boxes' ? { boxes: parsedQuantity } : { pallets: parsedQuantity }),
      });
      setResult(quote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось рассчитать логистику.');
    } finally {
      setSubmitting(false);
    }
  }

  const parsedQuantity = Number(quantity);
  const canSubmit = Boolean(origin.trim() && destination.trim() && Number.isInteger(parsedQuantity) && parsedQuantity > 0);

  return (
    <section className="logistics-panel" aria-label="Расчет логистики">
      <div className="section-heading logistics-panel__heading">
        <div>
          <p className="eyebrow">Logistics quote</p>
          <h2>Расчет логистики</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void loadTariffs()}
          title="Обновить тарифы"
          aria-label="Обновить тарифы"
          disabled={isLoading}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      <form className="quote-form" onSubmit={submit}>
        <div className="quote-fields">
          <label>
            <span>Набор тарифов</span>
            <select value={tariffSetId} onChange={(event) => setTariffSetId(event.target.value)} disabled={isLoading}>
              <option value="">Активный по дате</option>
              {tariffs.map((tariff) => (
                <option key={tariff.id} value={tariff.id}>
                  {tariff.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Откуда</span>
            <input value={origin} onChange={(event) => setOrigin(event.target.value)} required />
          </label>
          <label>
            <span>Куда</span>
            <input value={destination} onChange={(event) => setDestination(event.target.value)} required />
          </label>
          <label>
            <span>Дата</span>
            <input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
          </label>
        </div>

        <div className="quote-quantity-row">
          <div className="quote-mode" role="tablist" aria-label="Единица расчета">
            <button className={quantityMode === 'boxes' ? 'active' : ''} type="button" onClick={() => setQuantityMode('boxes')}>
              Короба
            </button>
            <button
              className={quantityMode === 'pallets' ? 'active' : ''}
              type="button"
              onClick={() => setQuantityMode('pallets')}
            >
              Паллеты
            </button>
          </div>
          <label>
            <span>Количество</span>
            <input min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <button className="primary-button quote-submit" type="submit" disabled={!canSubmit || isSubmitting}>
            <Calculator size={16} aria-hidden="true" />
            <span>{isSubmitting ? 'Расчет' : 'Рассчитать'}</span>
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
      </form>

      {result ? <LogisticsQuoteResultCard result={result} /> : null}
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
