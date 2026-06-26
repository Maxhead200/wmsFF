import { Calculator, RefreshCw } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import {
  assignLogisticsDeliveryTrip,
  fetchClientRequests,
  fetchClients,
  fetchLogisticsCarriers,
  fetchLogisticsDeliveryRequests,
  fetchLogisticsTariffSets,
  fetchLogisticsTrips,
  finalizeLogisticsDeliveryQuote,
  generateLogisticsDeliveryBillingCharge,
  quoteLogistics,
  updateLogisticsDeliveryStatus,
  type AuthSession,
  type AuthUser,
  type ClientRequestSummary,
  type ClientSummary,
  type LogisticsCarrierSummary,
  type LogisticsDeliveryRequestSummary,
  type LogisticsDeliveryStatus,
  type LogisticsQuoteResult,
  type LogisticsTariffSetSummary,
  type LogisticsTripSummary,
  type FinalizeLogisticsDeliveryQuotePayload,
} from '../../lib/api';
import './logistics.css';
import { LogisticsDeliveryForm } from './LogisticsDeliveryForm';
import { LogisticsDeliveryRequestsTable } from './LogisticsDeliveryRequestsTable';
import { LogisticsQuoteResultCard } from './LogisticsQuoteResultCard';
import { LogisticsTripsPanel } from './LogisticsTripsPanel';

type LogisticsQuotePanelProps = {
  session: AuthSession;
};

type QuantityMode = 'boxes' | 'pallets';

const DEFAULT_LOGISTICS_ORIGIN = 'Москва';
const defaultQuoteDate = new Date().toISOString().slice(0, 10);

export function LogisticsQuotePanel({ session }: LogisticsQuotePanelProps) {
  const [tariffs, setTariffs] = useState<LogisticsTariffSetSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientRequests, setClientRequests] = useState<ClientRequestSummary[]>([]);
  const [deliveryRequests, setDeliveryRequests] = useState<LogisticsDeliveryRequestSummary[]>([]);
  const [carriers, setCarriers] = useState<LogisticsCarrierSummary[]>([]);
  const [trips, setTrips] = useState<LogisticsTripSummary[]>([]);
  const [tariffSetId, setTariffSetId] = useState('');
  const [destination, setDestination] = useState('');
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('boxes');
  const [quantity, setQuantity] = useState('1');
  const [quoteDate, setQuoteDate] = useState(defaultQuoteDate);
  const [result, setResult] = useState<LogisticsQuoteResult | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadData();
  }, [session.accessToken]);

  if (!canUse(session.user, 'logistics:read')) {
    return null;
  }

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [nextTariffs, nextClients, nextClientRequests, nextDeliveryRequests, nextCarriers, nextTrips] = await Promise.all([
        fetchLogisticsTariffSets(session.accessToken),
        fetchClients(session.accessToken),
        fetchClientRequests(session.accessToken),
        fetchLogisticsDeliveryRequests(session.accessToken),
        fetchLogisticsCarriers(session.accessToken),
        fetchLogisticsTrips(session.accessToken),
      ]);
      setTariffs(nextTariffs);
      setClients(nextClients);
      setClientRequests(nextClientRequests);
      setDeliveryRequests(nextDeliveryRequests);
      setCarriers(nextCarriers);
      setTrips(nextTrips);
      setTariffSetId((current) => current || nextTariffs[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить логистику.');
    } finally {
      setLoading(false);
    }
  }

  function acceptDeliveryRequest(request: LogisticsDeliveryRequestSummary) {
    setDeliveryRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
  }

  async function changeDeliveryStatus(deliveryId: string, status: LogisticsDeliveryStatus) {
    setError('');

    try {
      const updated = await updateLogisticsDeliveryStatus(session.accessToken, deliveryId, { status });
      setDeliveryRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить статус доставки.');
    }
  }

  async function generateBillingCharge(deliveryId: string) {
    setError('');

    try {
      const updated = await generateLogisticsDeliveryBillingCharge(session.accessToken, deliveryId);
      setDeliveryRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать начисление доставки.');
    }
  }

  async function finalizeQuote(deliveryId: string, payload: FinalizeLogisticsDeliveryQuotePayload) {
    setError('');

    try {
      const updated = await finalizeLogisticsDeliveryQuote(session.accessToken, deliveryId, payload);
      setDeliveryRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось зафиксировать расчет доставки.');
    }
  }

  async function assignDeliveryTrip(deliveryId: string, tripId: string | null) {
    setError('');

    try {
      const updated = await assignLogisticsDeliveryTrip(session.accessToken, deliveryId, { tripId });
      setDeliveryRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setTrips(await fetchLogisticsTrips(session.accessToken));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось назначить рейс доставки.');
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
        origin: DEFAULT_LOGISTICS_ORIGIN,
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
  const canSubmit = Boolean(destination.trim() && Number.isInteger(parsedQuantity) && parsedQuantity > 0);

  return (
    <section className="logistics-panel" aria-label="Расчет логистики">
      <div className="section-heading logistics-panel__heading">
        <div>
          <p className="eyebrow">Логистика</p>
          <h2>Расчет и заявки доставки</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void loadData()}
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
            <strong className="readonly-field">{DEFAULT_LOGISTICS_ORIGIN}</strong>
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

      {canUse(session.user, 'logistics:request') && clients.length > 0 ? (
        <>
          <div className="logistics-panel__subheading">
            <h3>Заявка на доставку</h3>
          </div>
          <LogisticsDeliveryForm
            clients={clients}
            requests={clientRequests}
            tariffs={tariffs}
            session={session}
            onCreated={acceptDeliveryRequest}
          />
        </>
      ) : null}

      {canUse(session.user, 'logistics:write') || trips.length > 0 ? (
        <>
          <div className="logistics-panel__subheading">
            <h3>Рейсы</h3>
          </div>
          <LogisticsTripsPanel
            session={session}
            carriers={carriers}
            trips={trips}
            canWrite={canUse(session.user, 'logistics:write')}
            onCarrierCreated={(carrier) => setCarriers((current) => [carrier, ...current])}
            onTripCreated={(trip) => setTrips((current) => [trip, ...current])}
            onTripUpdated={(trip) => setTrips((current) => current.map((item) => (item.id === trip.id ? trip : item)))}
          />
        </>
      ) : null}

      <div className="logistics-panel__subheading">
        <h3>Заявки доставки</h3>
      </div>
      <div className="delivery-list">
        {isLoading && deliveryRequests.length === 0 ? <p className="panel-message">Загружаю заявки доставки.</p> : null}
        {!isLoading && deliveryRequests.length === 0 ? <p className="panel-message">Заявок доставки пока нет.</p> : null}
        {deliveryRequests.length > 0 ? (
          <LogisticsDeliveryRequestsTable
            items={deliveryRequests}
            trips={trips}
            canWrite={canUse(session.user, 'logistics:write')}
            canCreateBillingCharge={canUse(session.user, 'logistics:write') && canUse(session.user, 'billing:write')}
            onBillingChargeCreate={(deliveryId) => void generateBillingCharge(deliveryId)}
            onQuoteFinalize={finalizeQuote}
            onStatusChange={(deliveryId, status) => void changeDeliveryStatus(deliveryId, status)}
            onTripAssign={(deliveryId, tripId) => void assignDeliveryTrip(deliveryId, tripId)}
          />
        ) : null}
      </div>
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
