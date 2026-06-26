import { FormEvent, useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import {
  createLogisticsDeliveryRequest,
  type AuthSession,
  type ClientRequestSummary,
  type ClientSummary,
  type LogisticsDeliveryRequestSummary,
  type LogisticsTariffSetSummary,
} from '../../lib/api';

type LogisticsDeliveryFormProps = {
  clients: ClientSummary[];
  requests: ClientRequestSummary[];
  tariffs: LogisticsTariffSetSummary[];
  session: AuthSession;
  onCreated: (request: LogisticsDeliveryRequestSummary) => void;
};

type QuantityMode = 'boxes' | 'pallets';

const DEFAULT_LOGISTICS_ORIGIN = 'Москва';

export function LogisticsDeliveryForm({ clients, requests, tariffs, session, onCreated }: LogisticsDeliveryFormProps) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [requestId, setRequestId] = useState('');
  const [tariffSetId, setTariffSetId] = useState(tariffs[0]?.id ?? '');
  const [destination, setDestination] = useState('');
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('boxes');
  const [quantity, setQuantity] = useState('1');
  const [desiredShipDate, setDesiredShipDate] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  const availableRequests = useMemo(
    () => requests.filter((request) => request.clientId === clientId && request.type === 'OUTBOUND'),
    [clientId, requests],
  );
  const parsedQuantity = Number(quantity);
  const canSubmit = Boolean(clientId && destination.trim() && Number.isInteger(parsedQuantity) && parsedQuantity > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Русский комментарий: режим количества разворачиваем в одно поле, чтобы API сохранил короба или паллеты без двусмысленности.
      const created = await createLogisticsDeliveryRequest(session.accessToken, {
        clientId,
        requestId: requestId || undefined,
        tariffSetId: tariffSetId || undefined,
        destination: destination.trim(),
        desiredShipDate: desiredShipDate || undefined,
        comment: comment.trim() || undefined,
        ...(quantityMode === 'boxes' ? { boxes: parsedQuantity } : { pallets: parsedQuantity }),
      });
      onCreated(created);
      setDestination('');
      setQuantity('1');
      setComment('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать заявку на доставку.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="delivery-form" onSubmit={submit}>
      <div className="delivery-fields">
        <label>
          <span>Клиент</span>
          <select
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setRequestId('');
            }}
            required
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} · {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Исходящая заявка</span>
          <select value={requestId} onChange={(event) => setRequestId(event.target.value)}>
            <option value="">Без привязки</option>
            {availableRequests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Тариф</span>
          <select value={tariffSetId} onChange={(event) => setTariffSetId(event.target.value)}>
            <option value="">Активный по дате</option>
            {tariffs.map((tariff) => (
              <option key={tariff.id} value={tariff.id}>
                {tariff.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Дата</span>
          <input type="date" value={desiredShipDate} onChange={(event) => setDesiredShipDate(event.target.value)} />
        </label>
      </div>

      <div className="delivery-fields delivery-fields--route">
        <label>
          <span>Откуда</span>
          <strong className="readonly-field">{DEFAULT_LOGISTICS_ORIGIN}</strong>
        </label>
        <label>
          <span>Куда</span>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} required />
        </label>
        <div className="quote-mode" role="tablist" aria-label="Единица доставки">
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
      </div>

      <div className="delivery-footer">
        <label>
          <span>Комментарий</span>
          <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Пожелания по доставке" />
        </label>
        <button className="primary-button delivery-submit" type="submit" disabled={!canSubmit || isSubmitting}>
          <Truck size={16} aria-hidden="true" />
          <span>{isSubmitting ? 'Создаю' : 'Создать заявку'}</span>
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
