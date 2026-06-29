import { CheckCircle2, ClipboardList, FileDown, FileText, PackageCheck, Send, Truck, XCircle } from 'lucide-react';
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
  canCancelRequests: boolean;
  onStatusChange: (requestId: string, status: ClientRequestStatus) => void;
  onCancelRequest: (request: ClientRequestSummary) => void;
  onOpenDocument?: (request: ClientRequestSummary) => void;
  onDownloadMarketplaceProductsTemplate?: (request: ClientRequestSummary) => void;
  onDownloadMarketplacePackagesTemplate?: (request: ClientRequestSummary) => void;
  onOpenPickInstruction?: (request: ClientRequestSummary) => void;
  onDownloadPickInstruction?: (request: ClientRequestSummary) => void;
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
  canCancelRequests,
  onStatusChange,
  onCancelRequest,
  onOpenDocument,
  onDownloadMarketplaceProductsTemplate,
  onDownloadMarketplacePackagesTemplate,
  onOpenPickInstruction,
  onDownloadPickInstruction,
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
            {canCancelRequests ? <th>Действия</th> : null}
            {canChangeStatus ? <th>Процесс</th> : null}
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
                <span>Город: {request.destinationCity ?? '-'}</span>
                {request.comment ? <span>{request.comment}</span> : null}
              </td>
              <td>
                <strong>{request.client.code}</strong>
                <span>{request.client.name}</span>
              </td>
              <td>
                <span>{itemsSummary(request)}</span>
                {request.packages.length ? (
                  <span className="request-package-summary">{packagesSummary(request)}</span>
                ) : null}
                {onOpenDocument ? (
                  <button
                    className="document-open-button"
                    type="button"
                    onClick={() => onOpenDocument(request)}
                    title="Открыть состав заявки"
                  >
                    <FileText size={15} aria-hidden="true" />
                    <span>Состав</span>
                  </button>
                ) : null}
                {canDownloadMarketplaceTemplates(request) && onDownloadMarketplaceProductsTemplate ? (
                  <button
                    className="document-open-button"
                    type="button"
                    onClick={() => onDownloadMarketplaceProductsTemplate(request)}
                    title="Скачать шаблон WB/Ozon для товаров"
                  >
                    <FileDown size={15} aria-hidden="true" />
                    <span>Товары WB/Ozon</span>
                  </button>
                ) : null}
                {canDownloadMarketplaceTemplates(request) && onDownloadMarketplacePackagesTemplate ? (
                  <button
                    className="document-open-button"
                    type="button"
                    onClick={() => onDownloadMarketplacePackagesTemplate(request)}
                    title="Скачать шаблон WB/Ozon для упаковки"
                  >
                    <PackageCheck size={15} aria-hidden="true" />
                    <span>Упаковка WB/Ozon</span>
                  </button>
                ) : null}
              </td>
              <td>{formatDate(request.desiredDate)}</td>
              <td>
                <span className={`status status--${requestStatusTone(request.status)}`}>
                  {requestStatusLabel(request.status)}
                </span>
                {request.managerComment ? <span>{request.managerComment}</span> : null}
              </td>
              {canPickOutbound ? (
                <td>
                  {canShowWarehouseActions(request) ? (
                    <div className="client-request-actions">
                      {onOpenPickInstruction && request.type === 'OUTBOUND' ? (
                        <button
                          className="client-request-action-button client-request-action-button--instruction"
                          type="button"
                          onClick={() => onOpenPickInstruction(request)}
                          title="Открыть складскую инструкцию"
                        >
                          <ClipboardList size={15} aria-hidden="true" />
                          <span>Инструкция</span>
                        </button>
                      ) : null}
                      {onDownloadPickInstruction && request.type === 'OUTBOUND' ? (
                        <button
                          className="client-request-action-button client-request-action-button--xlsx"
                          type="button"
                          onClick={() => onDownloadPickInstruction(request)}
                          title="Скачать Excel-инструкцию сборки"
                        >
                          <FileDown size={15} aria-hidden="true" />
                          <span>Инструкция Excel</span>
                        </button>
                      ) : null}
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
              {canCancelRequests ? (
                <td>
                  {canCancelRequest(request) ? (
                    <button
                      className="client-request-action-button client-request-action-button--cancel"
                      type="button"
                      onClick={() => onCancelRequest(request)}
                      title="Отменить заявку"
                    >
                      <XCircle size={15} aria-hidden="true" />
                      <span>Отменить</span>
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

function canShowWarehouseActions(request: ClientRequestSummary) {
  return request.type === 'OUTBOUND' || canRunFulfillment(request);
}

function canDownloadMarketplaceTemplates(request: ClientRequestSummary) {
  return request.type === 'OUTBOUND' && ['PACKED', 'DONE'].includes(request.status) && request.packages.length > 0;
}

function canCancelRequest(request: ClientRequestSummary) {
  return request.type === 'OUTBOUND' && ['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(request.status);
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

function packagesSummary(request: ClientRequestSummary) {
  const totalQuantity = request.packages.reduce(
    (sum, packagePlace) => sum + packagePlace.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
  const codes = request.packages.map((packagePlace) => packagePlace.packageCode).join(', ');
  return `Места: ${codes} · ${totalQuantity} шт.`;
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return dateFormatter.format(new Date(value));
}
