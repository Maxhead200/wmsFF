import { CheckCircle2, PackageCheck, Send, Truck } from 'lucide-react';
import { type ClientRequestStatus, type ClientRequestSummary } from '../../lib/api';
import {
  requestPriorityLabel,
  requestStatusLabel,
  requestStatusOptions,
  requestStatusTone,
  requestTypeLabel,
} from './clientRequestMeta';

type ClientRequestsTableProps = {
  items: ClientRequestSummary[];
  canChangeStatus: boolean;
  canPickOutbound: boolean;
  onStatusChange: (requestId: string, status: ClientRequestStatus) => void;
  onPickOutbound: (request: ClientRequestSummary) => void;
  onPackageOutbound: (request: ClientRequestSummary) => void;
  onShipOutbound: (request: ClientRequestSummary) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function ClientRequestsTable({
  items,
  canChangeStatus,
  canPickOutbound,
  onStatusChange,
  onPickOutbound,
  onPackageOutbound,
  onShipOutbound,
}: ClientRequestsTableProps) {
  return (
    <div className="client-request-table-wrap">
      <table className="data-table client-request-table">
        <thead>
          <tr>
            <th>Заявка</th>
            <th>Клиент</th>
            <th>Состав</th>
            <th>Срок</th>
            <th>Статус</th>
            {canPickOutbound ? <th>Склад</th> : null}
            {canChangeStatus ? <th>Workflow</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((request) => (
            <tr key={request.id}>
              <td>
                <strong>{request.title}</strong>
                <span>
                  {requestTypeLabel(request.type)} · {requestPriorityLabel(request.priority)}
                </span>
                {request.comment ? <span>{request.comment}</span> : null}
              </td>
              <td>
                <strong>{request.client.code}</strong>
                <span>{request.client.name}</span>
              </td>
              <td>{itemsSummary(request)}</td>
              <td>{formatDate(request.desiredDate)}</td>
              <td>
                <span className={`status status--${requestStatusTone(request.status)}`}>
                  {requestStatusLabel(request.status)}
                </span>
                {request.managerComment ? <span>{request.managerComment}</span> : null}
              </td>
              {canPickOutbound ? (
                <td>
                  {canRunFulfillment(request) ? (
                    <div className="client-request-actions">
                      {canPickRequest(request) ? (
                        <button
                          className="client-request-action-button client-request-action-button--pick"
                          type="button"
                          onClick={() => onPickOutbound(request)}
                          title="Собрать заявку"
                        >
                          <PackageCheck size={15} aria-hidden="true" />
                          <span>Собрать</span>
                        </button>
                      ) : null}
                      {canPackageRequest(request) ? (
                        <button
                          className="client-request-action-button client-request-action-button--pack"
                          type="button"
                          onClick={() => onPackageOutbound(request)}
                          title="Упаковать заявку"
                        >
                          <Send size={15} aria-hidden="true" />
                          <span>Упаковать</span>
                        </button>
                      ) : null}
                      {canShipRequest(request) ? (
                        <button
                          className="client-request-action-button client-request-action-button--ship"
                          type="button"
                          onClick={() => onShipOutbound(request)}
                          title="Закрыть отгрузку"
                        >
                          <Truck size={15} aria-hidden="true" />
                          <span>Отгрузить</span>
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
              ) : null}
              {canChangeStatus ? (
                <td>
                  <label className="client-request-status-select">
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <select
                      value={request.status}
                      onChange={(event) => onStatusChange(request.id, event.target.value as ClientRequestStatus)}
                    >
                      {requestStatusOptions.map((option) => (
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

function canPickRequest(request: ClientRequestSummary) {
  return request.type === 'OUTBOUND' && ['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(request.status);
}

function canPackageRequest(request: ClientRequestSummary) {
  return request.type === 'OUTBOUND' && request.status === 'IN_WORK';
}

function canShipRequest(request: ClientRequestSummary) {
  return request.type === 'OUTBOUND' && request.status === 'PACKED';
}

function canRunFulfillment(request: ClientRequestSummary) {
  return canPickRequest(request) || canPackageRequest(request) || canShipRequest(request);
}

function itemsSummary(request: ClientRequestSummary) {
  if (request.items.length === 0) {
    return '-';
  }

  return request.items
    .map((item) => {
      const itemName = item.sku?.internalSku ?? item.name ?? item.barcode ?? 'позиция';
      return `${itemName} x ${item.quantity}`;
    })
    .join(', ');
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return dateFormatter.format(new Date(value));
}
