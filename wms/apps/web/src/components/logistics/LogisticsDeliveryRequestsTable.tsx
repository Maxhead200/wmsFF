import { CalendarClock, ReceiptText } from 'lucide-react';
import type { LogisticsDeliveryRequestSummary, LogisticsDeliveryStatus } from '../../lib/api';
import {
  logisticsDeliveryStatusLabel,
  logisticsDeliveryStatusOptions,
  logisticsDeliveryStatusTone,
} from './logisticsMeta';

type LogisticsDeliveryRequestsTableProps = {
  items: LogisticsDeliveryRequestSummary[];
  canWrite: boolean;
  canCreateBillingCharge: boolean;
  onBillingChargeCreate: (deliveryId: string) => void;
  onStatusChange: (deliveryId: string, status: LogisticsDeliveryStatus) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU');
const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function LogisticsDeliveryRequestsTable({
  items,
  canWrite,
  canCreateBillingCharge,
  onBillingChargeCreate,
  onStatusChange,
}: LogisticsDeliveryRequestsTableProps) {
  return (
    <div className="delivery-table-wrap">
      <table className="data-table delivery-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Маршрут</th>
            <th>Объем</th>
            <th>Дата</th>
            <th>Расчет</th>
            <th>Биллинг</th>
            <th>Статус</th>
            {canWrite ? <th>Workflow</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((request) => (
            <tr key={request.id}>
              <td>
                <strong>{request.client.code}</strong>
                <span>{request.client.name}</span>
              </td>
              <td>
                <strong>
                  {request.origin} -&gt; {request.destination}
                </strong>
                <span>{request.request?.title ?? request.comment ?? '-'}</span>
              </td>
              <td>{formatQuantity(request)}</td>
              <td>
                <strong>{formatDate(request.desiredShipDate)}</strong>
                {request.plannedShipDate ? <span>план {formatDate(request.plannedShipDate)}</span> : null}
              </td>
              <td>
                <strong>{formatMoney(request.estimatedTotalRub)}</strong>
                <span>{request.requiresManualReview ? 'ручная проверка' : request.tariffSet?.name ?? '-'}</span>
              </td>
              <td>
                {request.billingCharge ? (
                  <div className="delivery-billing-link">
                    <strong>{formatMoney(request.billingCharge.totalRub)}</strong>
                    <span>{request.billingCharge.status}</span>
                  </div>
                ) : canCreateBillingCharge && canGenerateBillingCharge(request) ? (
                  <button
                    className="delivery-billing-button"
                    type="button"
                    onClick={() => onBillingChargeCreate(request.id)}
                  >
                    <ReceiptText size={15} aria-hidden="true" />
                    <span>Начислить</span>
                  </button>
                ) : (
                  <span className="delivery-billing-muted">{billingHint(request)}</span>
                )}
              </td>
              <td>
                <span className={`status status--${logisticsDeliveryStatusTone(request.status)}`}>
                  {logisticsDeliveryStatusLabel(request.status)}
                </span>
                {request.managerComment ? <span>{request.managerComment}</span> : null}
              </td>
              {canWrite ? (
                <td>
                  <label className="delivery-status-select">
                    <CalendarClock size={15} aria-hidden="true" />
                    <select
                      value={request.status}
                      onChange={(event) => onStatusChange(request.id, event.target.value as LogisticsDeliveryStatus)}
                    >
                      {logisticsDeliveryStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function canGenerateBillingCharge(request: LogisticsDeliveryRequestSummary) {
  return request.status === 'DELIVERED' && request.estimatedTotalRub != null && !request.requiresManualReview;
}

function billingHint(request: LogisticsDeliveryRequestSummary) {
  if (request.requiresManualReview || request.estimatedTotalRub == null) {
    return 'требует расчет';
  }

  if (request.status !== 'DELIVERED') {
    return 'после доставки';
  }

  return '-';
}

function formatQuantity(request: LogisticsDeliveryRequestSummary) {
  if (request.boxes != null) {
    return `${request.boxes} кор.`;
  }

  if (request.pallets != null) {
    return `${request.pallets} пал.`;
  }

  return '-';
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '-';
}

function formatMoney(value: string | number | null) {
  return value == null ? 'на проверке' : `${moneyFormatter.format(Number(value))} ₽`;
}
