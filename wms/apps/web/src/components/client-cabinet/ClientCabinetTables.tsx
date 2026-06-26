import type { ReactNode } from 'react';
import { FileText, MessageSquareText, ReceiptText } from 'lucide-react';
import type {
  BillingChargeSummary,
  BillingInvoiceSummary,
  ClientNotificationSummary,
  ClientRequestFileSummary,
  ClientRequestSummary,
  StockBalance,
} from '../../lib/api';
import { billingInvoiceStatusLabel, billingInvoiceStatusTone, billingStatusLabel, billingStatusTone } from '../billing/billingMeta';
import { requestStatusLabel, requestStatusTone, requestTypeLabel } from '../client-requests/clientRequestMeta';
import {
  formatCabinetDate,
  formatCabinetMoney,
  formatCabinetNumber,
  primaryBarcode,
} from './clientCabinetFormat';
import { ClientCabinetNotifications } from './ClientCabinetNotifications';
import { ClientRequestFilesCell } from './ClientRequestFilesCell';

type ClientCabinetTablesProps = {
  stock: StockBalance[];
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
  notifications: ClientNotificationSummary[];
  onOpenRequestDocument: (request: ClientRequestSummary) => void;
  onOpenRequestTimeline: (request: ClientRequestSummary) => void;
  onOpenInvoiceDocument: (invoice: BillingInvoiceSummary) => void;
  onUploadRequestFile: (request: ClientRequestSummary, file: File) => Promise<void>;
  onDownloadRequestFile: (request: ClientRequestSummary, file: ClientRequestFileSummary) => Promise<void>;
  onMarkNotificationRead: (notification: ClientNotificationSummary) => void;
};

export function ClientCabinetTables({
  stock,
  requests,
  invoices,
  charges,
  notifications,
  onOpenRequestDocument,
  onOpenRequestTimeline,
  onOpenInvoiceDocument,
  onUploadRequestFile,
  onDownloadRequestFile,
  onMarkNotificationRead,
}: ClientCabinetTablesProps) {
  return (
    <div className="client-cabinet-sections">
      <ClientCabinetNotifications notifications={notifications} onMarkRead={onMarkNotificationRead} />

      <CabinetSection title="Остатки" emptyText="Остатков пока нет." hasItems={stock.length > 0}>
        {renderStockTable(stock)}
      </CabinetSection>

      <CabinetSection title="Заявки" emptyText="Заявок пока нет." hasItems={requests.length > 0}>
        {renderRequestTable(
          requests,
          onOpenRequestDocument,
          onOpenRequestTimeline,
          onUploadRequestFile,
          onDownloadRequestFile,
        )}
      </CabinetSection>

      <CabinetSection title="Счета" emptyText="Счетов пока нет." hasItems={invoices.length > 0}>
        {renderInvoiceTable(invoices, onOpenInvoiceDocument)}
      </CabinetSection>

      <CabinetSection title="Начисления" emptyText="Начислений пока нет." hasItems={charges.length > 0}>
        {renderChargeTable(charges)}
      </CabinetSection>
    </div>
  );
}

function CabinetSection({
  title,
  emptyText,
  hasItems,
  children,
}: {
  title: string;
  emptyText: string;
  hasItems: boolean;
  children: ReactNode;
}) {
  return (
    <section className="client-cabinet-section" aria-label={title}>
      <div className="client-cabinet-section__heading">
        <h3>{title}</h3>
      </div>
      {hasItems ? children : <p className="panel-message">{emptyText}</p>}
    </section>
  );
}

function renderStockTable(items: StockBalance[]) {
  return (
    <div className="client-cabinet-table-wrap">
      <table className="data-table client-cabinet-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Штрихкод</th>
            <th>Короб</th>
            <th>Паллет</th>
            <th>Статус</th>
            <th>Кол-во</th>
            <th>Обновлено</th>
          </tr>
        </thead>
        <tbody>
          {items.map((balance) => (
            <tr key={balance.id}>
              <td>
                <strong>{balance.sku.internalSku}</strong>
                <span>{balance.sku.name}</span>
              </td>
              <td>{primaryBarcode(balance)}</td>
              <td>{balance.box?.code ?? '-'}</td>
              <td>{balance.pallet?.code ?? '-'}</td>
              <td>
                <span className="status status--planned">{balance.status}</span>
              </td>
              <td>{formatCabinetNumber(Number(balance.quantity))}</td>
              <td>{formatCabinetDate(balance.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderRequestTable(
  items: ClientRequestSummary[],
  onOpenRequestDocument: (request: ClientRequestSummary) => void,
  onOpenRequestTimeline: (request: ClientRequestSummary) => void,
  onUploadRequestFile: (request: ClientRequestSummary, file: File) => Promise<void>,
  onDownloadRequestFile: (request: ClientRequestSummary, file: ClientRequestFileSummary) => Promise<void>,
) {
  return (
    <div className="client-cabinet-table-wrap">
      <table className="data-table client-cabinet-table">
        <thead>
          <tr>
            <th>Заявка</th>
            <th>Тип</th>
            <th>Состав</th>
            <th>Срок</th>
            <th>Статус</th>
            <th>Документ</th>
            <th>Файлы</th>
          </tr>
        </thead>
        <tbody>
          {items.map((request) => (
            <tr key={request.id}>
              <td>
                <strong>{request.title}</strong>
                {request.comment ? <span>{request.comment}</span> : null}
              </td>
              <td>{requestTypeLabel(request.type)}</td>
              <td>{requestItemsSummary(request)}</td>
              <td>{formatCabinetDate(request.desiredDate)}</td>
              <td>
                <span className={`status status--${requestStatusTone(request.status)}`}>
                  {requestStatusLabel(request.status)}
                </span>
                {request.managerComment ? <span>{request.managerComment}</span> : null}
              </td>
              <td>
                <div className="client-request-actions-cell">
                  <button
                    className="document-open-button"
                    type="button"
                    onClick={() => onOpenRequestDocument(request)}
                    title="Открыть состав заявки"
                  >
                    <FileText size={15} aria-hidden="true" />
                    <span>Заявка</span>
                  </button>
                  <button
                    className="document-open-button"
                    type="button"
                    onClick={() => onOpenRequestTimeline(request)}
                    title="Открыть историю заявки"
                  >
                    <MessageSquareText size={15} aria-hidden="true" />
                    <span>История</span>
                  </button>
                </div>
              </td>
              <td>
                <ClientRequestFilesCell
                  request={request}
                  onUpload={onUploadRequestFile}
                  onDownload={onDownloadRequestFile}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInvoiceTable(items: BillingInvoiceSummary[], onOpenInvoiceDocument: (invoice: BillingInvoiceSummary) => void) {
  return (
    <div className="client-cabinet-table-wrap">
      <table className="data-table client-cabinet-table">
        <thead>
          <tr>
            <th>Счет</th>
            <th>Период</th>
            <th>Сумма</th>
            <th>Оплачено</th>
            <th>Статус</th>
            <th>Состав</th>
            <th>Документ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((invoice) => {
            const remaining = Math.max(0, Number(invoice.totalRub) - Number(invoice.paidRub));

            return (
              <tr key={invoice.id}>
                <td>
                  <strong>{invoice.number}</strong>
                  {invoice.dueDate ? <span>до {formatCabinetDate(invoice.dueDate)}</span> : null}
                </td>
                <td>
                  <strong>{formatCabinetDate(invoice.periodFrom)}</strong>
                  <span>{formatCabinetDate(invoice.periodTo)}</span>
                </td>
                <td>
                  <strong>{formatCabinetMoney(invoice.totalRub)} ₽</strong>
                  <span>остаток {formatCabinetMoney(remaining)} ₽</span>
                </td>
                <td>
                  <strong>{formatCabinetMoney(invoice.paidRub)} ₽</strong>
                  {invoice.paidAt ? <span>{formatCabinetDate(invoice.paidAt)}</span> : null}
                </td>
                <td>
                  <span className={`status status--${billingInvoiceStatusTone(invoice.status)}`}>
                    {billingInvoiceStatusLabel(invoice.status)}
                  </span>
                </td>
                <td>
                  <strong>{invoice.items.length} поз.</strong>
                  <span>{invoice.payments.length} оплат</span>
                </td>
                <td>
                  <button
                    className="document-open-button"
                    type="button"
                    onClick={() => onOpenInvoiceDocument(invoice)}
                    title="Открыть документ"
                  >
                    <ReceiptText size={15} aria-hidden="true" />
                    <span>Счет</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderChargeTable(items: BillingChargeSummary[]) {
  return (
    <div className="client-cabinet-table-wrap">
      <table className="data-table client-cabinet-table">
        <thead>
          <tr>
            <th>Начисление</th>
            <th>Дата</th>
            <th>Кол-во</th>
            <th>Цена</th>
            <th>Сумма</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {items.map((charge) => (
            <tr key={charge.id}>
              <td>
                <strong>{charge.description}</strong>
                <span>{charge.source === 'STORAGE' ? 'хранение' : charge.service?.code ?? 'услуга'}</span>
              </td>
              <td>{formatCabinetDate(charge.serviceDate)}</td>
              <td>{formatCabinetNumber(Number(charge.quantity))}</td>
              <td>{formatCabinetMoney(charge.unitPriceRub)} ₽</td>
              <td>
                <strong>{formatCabinetMoney(charge.totalRub)} ₽</strong>
              </td>
              <td>
                <span className={`status status--${billingStatusTone(charge.status)}`}>
                  {billingStatusLabel(charge.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function requestItemsSummary(request: ClientRequestSummary) {
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
