import { CalendarDays, Plus, Route, Truck, UserRound } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  createLogisticsCarrier,
  createLogisticsTrip,
  updateLogisticsTripStatus,
  type AuthSession,
  type LogisticsCarrierSummary,
  type LogisticsTripStatus,
  type LogisticsTripSummary,
} from '../../lib/api';
import {
  logisticsDeliveryStatusLabel,
  logisticsTripStatusLabel,
  logisticsTripStatusOptions,
  logisticsTripStatusTone,
} from './logisticsMeta';

type LogisticsTripsPanelProps = {
  session: AuthSession;
  carriers: LogisticsCarrierSummary[];
  trips: LogisticsTripSummary[];
  canWrite: boolean;
  onCarrierCreated: (carrier: LogisticsCarrierSummary) => void;
  onTripCreated: (trip: LogisticsTripSummary) => void;
  onTripUpdated: (trip: LogisticsTripSummary) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU');

export function LogisticsTripsPanel({
  session,
  carriers,
  trips,
  canWrite,
  onCarrierCreated,
  onTripCreated,
  onTripUpdated,
}: LogisticsTripsPanelProps) {
  const [carrierName, setCarrierName] = useState('');
  const [carrierPhone, setCarrierPhone] = useState('');
  const [carrierContact, setCarrierContact] = useState('');
  const [carrierComment, setCarrierComment] = useState('');
  const [tripCarrierId, setTripCarrierId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [tripComment, setTripComment] = useState('');
  const [error, setError] = useState('');
  const [isSavingCarrier, setSavingCarrier] = useState(false);
  const [isSavingTrip, setSavingTrip] = useState(false);
  const [savingTripId, setSavingTripId] = useState('');

  async function submitCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSavingCarrier(true);

    try {
      const created = await createLogisticsCarrier(session.accessToken, {
        name: carrierName.trim(),
        phone: carrierPhone.trim() || undefined,
        contactName: carrierContact.trim() || undefined,
        comment: carrierComment.trim() || undefined,
      });
      onCarrierCreated(created);
      setCarrierName('');
      setCarrierPhone('');
      setCarrierContact('');
      setCarrierComment('');
      setTripCarrierId(created.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать перевозчика.');
    } finally {
      setSavingCarrier(false);
    }
  }

  async function submitTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSavingTrip(true);

    try {
      const created = await createLogisticsTrip(session.accessToken, {
        carrierId: tripCarrierId || undefined,
        plannedDate: plannedDate || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        comment: tripComment.trim() || undefined,
      });
      onTripCreated(created);
      setVehicleNumber('');
      setDriverName('');
      setDriverPhone('');
      setTripComment('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать рейс.');
    } finally {
      setSavingTrip(false);
    }
  }

  async function changeTripStatus(tripId: string, status: LogisticsTripStatus) {
    setError('');
    setSavingTripId(tripId);

    try {
      const updated = await updateLogisticsTripStatus(session.accessToken, tripId, { status });
      onTripUpdated(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить статус рейса.');
    } finally {
      setSavingTripId('');
    }
  }

  return (
    <div className="logistics-trips">
      {canWrite ? (
        <div className="logistics-ops-grid">
          <form className="carrier-form" onSubmit={submitCarrier}>
            <div className="logistics-form-title">
              <Truck size={17} aria-hidden="true" />
              <strong>Перевозчик</strong>
            </div>
            <div className="trip-fields trip-fields--carrier">
              <label>
                <span>Название</span>
                <input value={carrierName} onChange={(event) => setCarrierName(event.target.value)} required />
              </label>
              <label>
                <span>Телефон</span>
                <input value={carrierPhone} onChange={(event) => setCarrierPhone(event.target.value)} />
              </label>
              <label>
                <span>Контакт</span>
                <input value={carrierContact} onChange={(event) => setCarrierContact(event.target.value)} />
              </label>
              <label>
                <span>Комментарий</span>
                <input value={carrierComment} onChange={(event) => setCarrierComment(event.target.value)} />
              </label>
            </div>
            <button className="primary-button trip-submit" type="submit" disabled={!carrierName.trim() || isSavingCarrier}>
              <Plus size={16} aria-hidden="true" />
              <span>{isSavingCarrier ? 'Сохраняю' : 'Добавить'}</span>
            </button>
          </form>

          <form className="trip-form" onSubmit={submitTrip}>
            <div className="logistics-form-title">
              <Route size={17} aria-hidden="true" />
              <strong>Рейс</strong>
            </div>
            <div className="trip-fields">
              <label>
                <span>Перевозчик</span>
                <select value={tripCarrierId} onChange={(event) => setTripCarrierId(event.target.value)}>
                  <option value="">Без перевозчика</option>
                  {carriers.map((carrier) => (
                    <option key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Дата</span>
                <input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} />
              </label>
              <label>
                <span>Машина</span>
                <input value={vehicleNumber} onChange={(event) => setVehicleNumber(event.target.value)} />
              </label>
              <label>
                <span>Водитель</span>
                <input value={driverName} onChange={(event) => setDriverName(event.target.value)} />
              </label>
              <label>
                <span>Телефон водителя</span>
                <input value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} />
              </label>
              <label>
                <span>Комментарий</span>
                <input value={tripComment} onChange={(event) => setTripComment(event.target.value)} />
              </label>
            </div>
            <button className="primary-button trip-submit" type="submit" disabled={isSavingTrip}>
              <Plus size={16} aria-hidden="true" />
              <span>{isSavingTrip ? 'Создаю' : 'Создать рейс'}</span>
            </button>
          </form>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="trip-list">
        {trips.length === 0 ? <p className="panel-message">Рейсов пока нет.</p> : null}
        {trips.map((trip) => (
          <article className="trip-card" key={trip.id}>
            <div className="trip-card__main">
              <div>
                <strong>{trip.code}</strong>
                <span>{trip.carrier?.name ?? 'Без перевозчика'}</span>
              </div>
              <span className={`status status--${logisticsTripStatusTone(trip.status)}`}>
                {logisticsTripStatusLabel(trip.status)}
              </span>
            </div>

            <div className="trip-card__details">
              <span>
                <CalendarDays size={14} aria-hidden="true" />
                {formatDate(trip.plannedDate)}
              </span>
              <span>
                <Truck size={14} aria-hidden="true" />
                {trip.vehicleNumber || '-'}
              </span>
              <span>
                <UserRound size={14} aria-hidden="true" />
                {trip.driverName || '-'}
              </span>
            </div>

            {canWrite ? (
              <label className="trip-status-select">
                <span>Статус</span>
                <select
                  value={trip.status}
                  disabled={savingTripId === trip.id}
                  onChange={(event) => void changeTripStatus(trip.id, event.target.value as LogisticsTripStatus)}
                >
                  {logisticsTripStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="trip-deliveries">
              {trip.deliveries.length === 0 ? <span>Доставок нет</span> : null}
              {trip.deliveries.slice(0, 4).map((delivery) => (
                <span key={delivery.id}>
                  {delivery.client.code}: {delivery.origin} -&gt; {delivery.destination}, {formatQuantity(delivery)} ·{' '}
                  {logisticsDeliveryStatusLabel(delivery.status)}
                </span>
              ))}
              {trip.deliveries.length > 4 ? <span>Еще {trip.deliveries.length - 4}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '-';
}

function formatQuantity(value: { boxes: number | null; pallets: number | null }) {
  if (value.boxes != null) {
    return `${value.boxes} кор.`;
  }

  if (value.pallets != null) {
    return `${value.pallets} пал.`;
  }

  return '-';
}
