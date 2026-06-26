import { CalendarClock } from 'lucide-react';
import type { LogisticsDeliveryRequestSummary, LogisticsDeliveryStatus } from '../../lib/api';
import {
  logisticsDeliveryStatusLabel,
  logisticsDeliveryStatusOptions,
  logisticsDeliveryStatusTone,
} from './logisticsMeta';

type LogisticsDeliveryRequestsTableProps = {
  items: LogisticsDeliveryRequestSummary[];
  canWrite: boolean;
  onStatusChange: (deliveryId: string, status: LogisticsDeliveryStatus) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU');
const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function LogisticsDeliveryRequestsTable({
  items,
  canWrite,
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
                <strong>{request.origin} → {request.destination}</strong>
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
