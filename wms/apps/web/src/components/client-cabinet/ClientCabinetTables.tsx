import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileSpreadsheet, FileText, MessageSquareText, ReceiptText, Search } from 'lucide-react';
import type {
  BillingChargeSummary,
  BillingInvoiceSummary,
  BillingReconciliation,
  BillingServiceHistory,
  AuthUser,
  ClientNotificationPreferenceSummary,
  ClientNotificationSummary,
  ClientRequestFileSummary,
  ClientRequestSummary,
  ClientSummary,
  SkuDetail,
  StockBalance,
} from '../../lib/api';
import { fetchSku } from '../../lib/api';
import { billingInvoiceStatusLabel, billingInvoiceStatusTone } from '../billing/billingMeta';
import { BillingReconciliationPanel } from '../billing/BillingReconciliationPanel';
import { ProductCardModal } from '../catalog/ProductCardModal';
import { requestStatusLabel, requestStatusTone, requestTypeLabel } from '../client-requests/clientRequestMeta';
import {
  formatCabinetDate,
  formatCabinetMoney,
  formatCabinetNumber,
  primaryBarcode,
} from './clientCabinetFormat';
import { ClientCabinetNotifications } from './ClientCabinetNotifications';
import { ClientCabinetReceiptImport } from './ClientCabinetReceiptImport';
import type { ClientCabinetMetricTarget } from './ClientCabinetMetrics';
import { ClientCabinetPeriodSummary } from './ClientCabinetPeriodSummary';
import { ClientCabinetServiceHistory } from './ClientCabinetServiceHistory';
import { ClientCabinetStockImport } from './ClientCabinetStockImport';
import { downloadClientCabinetStockExcel } from './clientCabinetStockExcelExport';
import { ClientRequestFilesCell } from './ClientRequestFilesCell';

type ClientCabinetTablesProps = {
  accessToken: string;
  client: ClientSummary;
  currentUser: AuthUser;
  stock: StockBalance[];
  visibleStock: StockBalance[];
  stockSearch: string;
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
  reconciliation: BillingReconciliation | null;
  serviceHistory: BillingServiceHistory | null;
  notifications: ClientNotificationSummary[];
  notificationPreferences: ClientNotificationPreferenceSummary[];
  activeSection: ClientCabinetMetricTarget;
  onSectionChange: (section: ClientCabinetMetricTarget) => void;
  onStockSearchChange: (value: string) => void;
  onStockImported: () => Promise<void>;
  onOpenRequestDocument: (request: ClientRequestSummary) => void;
  onOpenRequestTimeline: (request: ClientRequestSummary) => void;
  onOpenInvoiceDocument: (invoice: BillingInvoiceSummary) => void;
  onUploadRequestFile: (request: ClientRequestSummary, file: File) => Promise<void>;
  onDownloadRequestFile: (request: ClientRequestSummary, file: ClientRequestFileSummary) => Promise<void>;
  onMarkNotificationRead: (notification: ClientNotificationSummary) => void;
  onToggleNotificationPreference: (preference: ClientNotificationPreferenceSummary, isEnabled: boolean) => void;
};

type SkuStockSummary = {
  skuId: string;
  internalSku: string;
  name: string;
  primaryBarcode: string;
  boxesCount: number;
  quantity: number;
  updatedAt: string;
};

const pageSizeOptions = [10, 20, 50, 100];

export function ClientCabinetTables({
  accessToken,
  client,
  currentUser,
  stock,
  visibleStock,
  stockSearch,
  requests,
  invoices,
  charges,
  reconciliation,
  serviceHistory,
  notifications,
  notificationPreferences,
  activeSection,
  onSectionChange,
  onStockSearchChange,
  onStockImported,
  onOpenRequestDocument,
  onOpenRequestTimeline,
  onOpenInvoiceDocument,
  onUploadRequestFile,
  onDownloadRequestFile,
  onMarkNotificationRead,
  onToggleNotificationPreference,
}: ClientCabinetTablesProps) {
  const canSeeStoragePlaces = currentUser.clientScopeMode === 'ALL' || !currentUser.roleCodes.includes('CLIENT');
  const canImportStock = canUse(currentUser, 'imports:write');
  const [pageSize, setPageSize] = useState(20);
  const [pageByTab, setPageByTab] = useState<Record<ClientCabinetMetricTarget, number>>({
    skus: 1,
    stock: 1,
    requests: 1,
    invoices: 1,
  });
  const [selectedProduct, setSelectedProduct] = useState<SkuDetail | null>(null);
  const [productError, setProductError] = useState('');

  const skuRows = useMemo(() => buildSkuRows(visibleStock), [visibleStock]);
  const allSkuRows = useMemo(() => buildSkuRows(stock), [stock]);
  const activePage = pageByTab[activeSection] ?? 1;
  const activeTotal = totalForTab(activeSection, skuRows, visibleStock, requests, invoices);
  const allTotal = totalForTab(activeSection, allSkuRows, stock, requests, invoices);
  const activeQuantity = quantityForTab(activeSection, skuRows, visibleStock);
  const allQuantity = quantityForTab(activeSection, allSkuRows, stock);
  const stockTabQuantity = quantityForTab('stock', skuRows, visibleStock) ?? 0;
  const pageCount = Math.max(1, Math.ceil(activeTotal / pageSize));
  const currentPage = Math.min(activePage, pageCount);

  useEffect(() => {
    setPageByTab((current) => ({ ...current, [activeSection]: 1 }));
  }, [activeSection, pageSize, stockSearch]);

  function changePage(nextPage: number) {
    const normalized = Math.min(Math.max(nextPage, 1), pageCount);
    setPageByTab((current) => ({ ...current, [activeSection]: normalized }));
  }

  async function openProductCard(skuId: string) {
    setProductError('');
    try {
      setSelectedProduct(await fetchSku(accessToken, skuId));
    } catch (caught) {
      setProductError(caught instanceof Error ? caught.message : 'Не удалось открыть карточку товара.');
    }
  }

  const visibleSkuRows = paginate(skuRows, currentPage, pageSize);
  const visibleStockRows = paginate(visibleStock, currentPage, pageSize);
  const visibleRequestRows = paginate(requests, currentPage, pageSize);
  const visibleInvoiceRows = paginate(invoices, currentPage, pageSize);

  return (
    <div className={`client-cabinet-sections client-cabinet-sections--active-${activeSection}`}>
      <ClientCabinetNotifications
        notifications={notifications}
        preferences={notificationPreferences}
        onMarkRead={onMarkNotificationRead}
        onTogglePreference={onToggleNotificationPreference}
      />

      <ClientCabinetServiceHistory history={serviceHistory} />
      <ClientCabinetPeriodSummary invoices={invoices} charges={charges} />
      <BillingReconciliationPanel report={reconciliation} title="Задолженность и сверка" />

      <section id="client-cabinet-workspace" className="client-cabinet-section" aria-label="Таблицы клиента">
        <div className="client-cabinet-tabs" role="tablist" aria-label="Разделы кабинета клиента">
          <TabButton label="SKU" count={skuRows.length} tab="skus" activeTab={activeSection} onClick={onSectionChange} />
          <TabButton label="Остатки" count={stockTabQuantity} tab="stock" activeTab={activeSection} onClick={onSectionChange} />
          <TabButton label="Заявки" count={requests.length} tab="requests" activeTab={activeSection} onClick={onSectionChange} />
          <TabButton label="Счета" count={invoices.length} tab="invoices" activeTab={activeSection} onClick={onSectionChange} />
        </div>

        <div className="client-cabinet-table-toolbar">
          <label className="client-cabinet-stock-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={stockSearch}
              onChange={(event) => onStockSearchChange(event.target.value)}
              placeholder="Поиск по SKU, товару, штрихкоду, коробу"
            />
          </label>
          <span className="client-cabinet-table-count">
            {tableCountText(activeSection, activeTotal, allTotal, activeQuantity, allQuantity)}
          </span>
          <button
            className="icon-text-button"
            type="button"
            onClick={() => downloadClientCabinetStockExcel(client, visibleStock, canSeeStoragePlaces)}
            disabled={visibleStock.length === 0}
          >
            <FileSpreadsheet size={15} aria-hidden="true" />
            <span>Остатки Excel</span>
          </button>
        </div>

        {canImportStock && (activeSection === 'skus' || activeSection === 'stock') ? (
          <div className="client-cabinet-import-grid">
            <ClientCabinetStockImport accessToken={accessToken} client={client} onImported={onStockImported} />
            <ClientCabinetReceiptImport accessToken={accessToken} client={client} onImported={onStockImported} />
          </div>
        ) : null}

        {productError ? <p className="form-error">{productError}</p> : null}

        {renderActiveTable({
          activeSection,
          skuRows: visibleSkuRows,
          stock: visibleStockRows,
          canSeeStoragePlaces,
          onOpenProductCard: (skuId) => void openProductCard(skuId),
          requests: visibleRequestRows,
          invoices: visibleInvoiceRows,
          onOpenRequestDocument,
          onOpenRequestTimeline,
          onOpenInvoiceDocument,
          onUploadRequestFile,
          onDownloadRequestFile,
        })}

        <TablePager
          page={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={activeTotal}
          quantity={activeSection === 'stock' ? activeQuantity : null}
          onPageChange={changePage}
          onPageSizeChange={setPageSize}
        />
      </section>

      {selectedProduct ? <ProductCardModal sku={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </div>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}

function TabButton({
  label,
  count,
  tab,
  activeTab,
  onClick,
}: {
  label: string;
  count: number;
  tab: ClientCabinetMetricTarget;
  activeTab: ClientCabinetMetricTarget;
  onClick: (tab: ClientCabinetMetricTarget) => void;
}) {
  return (
    <button className={tab === activeTab ? 'is-active' : ''} type="button" role="tab" onClick={() => onClick(tab)}>
      <span>{label}</span>
      <strong>{formatCabinetNumber(count)}</strong>
    </button>
  );
}

function renderActiveTable({
  activeSection,
  skuRows,
  stock,
  canSeeStoragePlaces,
  onOpenProductCard,
  requests,
  invoices,
  onOpenRequestDocument,
  onOpenRequestTimeline,
  onOpenInvoiceDocument,
  onUploadRequestFile,
  onDownloadRequestFile,
}: {
  activeSection: ClientCabinetMetricTarget;
  skuRows: SkuStockSummary[];
  stock: StockBalance[];
  canSeeStoragePlaces: boolean;
  onOpenProductCard: (skuId: string) => void;
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  onOpenRequestDocument: (request: ClientRequestSummary) => void;
  onOpenRequestTimeline: (request: ClientRequestSummary) => void;
  onOpenInvoiceDocument: (invoice: BillingInvoiceSummary) => void;
  onUploadRequestFile: (request: ClientRequestSummary, file: File) => Promise<void>;
  onDownloadRequestFile: (request: ClientRequestSummary, file: ClientRequestFileSummary) => Promise<void>;
}) {
  if (activeSection === 'skus') {
    return skuRows.length > 0 ? renderSkuTable(skuRows, canSeeStoragePlaces, onOpenProductCard) : <EmptyTable>SKU не найдены.</EmptyTable>;
  }

  if (activeSection === 'stock') {
    return stock.length > 0 ? renderStockTable(stock, canSeeStoragePlaces, onOpenProductCard) : <EmptyTable>Остатки не найдены.</EmptyTable>;
  }

  if (activeSection === 'requests') {
    return requests.length > 0 ? (
      renderRequestTable(requests, onOpenRequestDocument, onOpenRequestTimeline, onUploadRequestFile, onDownloadRequestFile)
    ) : (
      <EmptyTable>Заявок пока нет.</EmptyTable>
    );
  }

  return invoices.length > 0 ? renderInvoiceTable(invoices, onOpenInvoiceDocument) : <EmptyTable>Счетов пока нет.</EmptyTable>;
}

function EmptyTable({ children }: { children: ReactNode }) {
  return <p className="panel-message">{children}</p>;
}

function renderSkuTable(items: SkuStockSummary[], canSeeStoragePlaces: boolean, onOpenProductCard: (skuId: string) => void) {
  return (
    <div id="client-cabinet-skus" className="client-cabinet-table-wrap">
      <table className="data-table client-cabinet-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Товар</th>
            <th>Штрихкод</th>
            {canSeeStoragePlaces ? <th>Коробов</th> : null}
            <th>Единиц</th>
            <th>Обновлено</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.skuId} onClick={() => onOpenProductCard(item.skuId)} tabIndex={0}>
              <td>
                <strong>{item.internalSku}</strong>
              </td>
              <td>{item.name}</td>
              <td>{item.primaryBarcode}</td>
              {canSeeStoragePlaces ? <td>{formatCabinetNumber(item.boxesCount)}</td> : null}
              <td>{formatCabinetNumber(item.quantity)}</td>
              <td>{formatCabinetDate(item.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderStockTable(items: StockBalance[], canSeeStoragePlaces: boolean, onOpenProductCard: (skuId: string) => void) {
  return (
    <div id="client-cabinet-stock" className="client-cabinet-table-wrap">
      <table className="data-table client-cabinet-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Штрихкод</th>
            {canSeeStoragePlaces ? <th>Короб</th> : null}
            {canSeeStoragePlaces ? <th>Паллета</th> : null}
            <th>Статус</th>
            <th>Кол-во</th>
            <th>Обновлено</th>
          </tr>
        </thead>
        <tbody>
          {items.map((balance) => (
            <tr key={balance.id} onClick={() => onOpenProductCard(balance.skuId)} tabIndex={0}>
              <td>
                <strong>{balance.sku.internalSku}</strong>
                <span>{balance.sku.name}</span>
              </td>
              <td>{primaryBarcode(balance)}</td>
              {canSeeStoragePlaces ? <td>{balance.box?.code ?? '-'}</td> : null}
              {canSeeStoragePlaces ? <td>{balance.pallet?.code ?? '-'}</td> : null}
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
    <div id="client-cabinet-requests" className="client-cabinet-table-wrap">
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
    <div id="client-cabinet-invoices" className="client-cabinet-table-wrap">
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

function TablePager({
  page,
  pageCount,
  pageSize,
  total,
  quantity,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  quantity: number | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="client-cabinet-pager">
      <span>{pagerText(page, pageCount, total, quantity)}</span>
      <label>
        <span>На странице</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className="client-cabinet-pager__buttons">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Назад
        </button>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
          Вперед
        </button>
      </div>
    </div>
  );
}

function buildSkuRows(stock: StockBalance[]): SkuStockSummary[] {
  const rows = new Map<string, SkuStockSummary & { boxCodes: Set<string> }>();

  stock.forEach((balance) => {
    const current = rows.get(balance.skuId);
    const updatedAt = current && current.updatedAt > balance.updatedAt ? current.updatedAt : balance.updatedAt;
    const row =
      current ??
      {
        skuId: balance.skuId,
        internalSku: balance.sku.internalSku,
        name: balance.sku.name,
        primaryBarcode: primaryBarcode(balance),
        boxesCount: 0,
        quantity: 0,
        updatedAt,
        boxCodes: new Set<string>(),
      };

    if (balance.box?.code) {
      row.boxCodes.add(balance.box.code);
    }

    row.quantity += Number(balance.quantity);
    row.updatedAt = updatedAt;
    row.boxesCount = row.boxCodes.size;
    rows.set(balance.skuId, row);
  });

  return [...rows.values()]
    .map(({ boxCodes, ...row }) => row)
    .sort((left, right) => right.quantity - left.quantity || left.internalSku.localeCompare(right.internalSku));
}

function totalForTab(
  tab: ClientCabinetMetricTarget,
  skuRows: SkuStockSummary[],
  stock: StockBalance[],
  requests: ClientRequestSummary[],
  invoices: BillingInvoiceSummary[],
) {
  if (tab === 'skus') {
    return skuRows.length;
  }

  if (tab === 'stock') {
    return stock.length;
  }

  if (tab === 'requests') {
    return requests.length;
  }

  return invoices.length;
}

function quantityForTab(tab: ClientCabinetMetricTarget, skuRows: SkuStockSummary[], stock: StockBalance[]) {
  if (tab === 'skus') {
    return skuRows.reduce((sum, row) => sum + row.quantity, 0);
  }

  if (tab === 'stock') {
    return stock.reduce((sum, balance) => sum + Number(balance.quantity), 0);
  }

  return null;
}

function tableCountText(
  tab: ClientCabinetMetricTarget,
  activeTotal: number,
  allTotal: number,
  activeQuantity: number | null,
  allQuantity: number | null,
) {
  if (tab === 'stock') {
    return `Найдено единиц ${formatCabinetNumber(activeQuantity ?? 0)} из ${formatCabinetNumber(allQuantity ?? 0)}`;
  }

  if (tab === 'skus') {
    return `Найдено SKU ${formatCabinetNumber(activeTotal)} из ${formatCabinetNumber(allTotal)}`;
  }

  return `Найдено ${formatCabinetNumber(activeTotal)} из ${formatCabinetNumber(allTotal)}`;
}

function pagerText(page: number, pageCount: number, total: number, quantity: number | null) {
  const base = `Страница ${formatCabinetNumber(page)} из ${formatCabinetNumber(pageCount)}`;
  return quantity === null ? `${base}, всего ${formatCabinetNumber(total)}` : `${base}, единиц ${formatCabinetNumber(quantity)}`;
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
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
