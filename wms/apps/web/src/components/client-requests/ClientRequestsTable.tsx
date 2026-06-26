import { CheckCircle2, PackageCheck } from 'lucide-react';
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
            {canPickOutbound ? <th>Сборка</th> : null}
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
                  {canPickRequest(request) ? (
                    <button className="client-request-pick-button" type="button" onClick={() => onPickOutbound(request)}>
                      <PackageCheck size={15} aria-hidden="true" />
                      <span>Собрать</span>
                    </button>
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
  return request.type === 'OUTBOUND' && !['DONE', 'CANCELLED', 'REJECTED'].includes(request.status);
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
