import { Boxes, ClipboardList, PackageCheck, ReceiptText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BillingInvoiceSummary, BillingReconciliation, ClientRequestSummary, StockBalance } from '../../lib/api';
import { formatCabinetMoney, formatCabinetNumber } from './clientCabinetFormat';

export type ClientCabinetMetricTarget = 'stock' | 'requests' | 'invoices';

type ClientCabinetMetricsProps = {
  stock: StockBalance[];
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  reconciliation: BillingReconciliation | null;
  onNavigate: (target: ClientCabinetMetricTarget) => void;
};

const closedRequestStatuses = ['DONE', 'CANCELLED', 'REJECTED'];

export function ClientCabinetMetrics({ stock, requests, invoices, reconciliation, onNavigate }: ClientCabinetMetricsProps) {
  const uniqueSkuCount = new Set(stock.map((balance) => balance.skuId)).size;
  const totalQuantity = stock.reduce((sum, balance) => sum + Number(balance.quantity), 0);
  const activeRequests = requests.filter((request) => !closedRequestStatuses.includes(request.status)).length;
  const debtRub =
    reconciliation?.totals.debtRub ??
    invoices
      .filter((invoice) => invoice.status !== 'CANCELLED')
      .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.totalRub) - Number(invoice.paidRub)), 0);

  return (
    <div className="client-cabinet-metrics" aria-label="Сводка клиента">
      <MetricTile icon={PackageCheck} label="SKU" value={formatCabinetNumber(uniqueSkuCount)} onClick={() => onNavigate('stock')} />
      <MetricTile
        icon={Boxes}
        label="Единиц на остатке"
        value={formatCabinetNumber(totalQuantity)}
        onClick={() => onNavigate('stock')}
      />
      <MetricTile
        icon={ClipboardList}
        label="Активные заявки"
        value={formatCabinetNumber(activeRequests)}
        onClick={() => onNavigate('requests')}
      />
      <MetricTile
        icon={ReceiptText}
        label="К оплате"
        value={`${formatCabinetMoney(debtRub)} ₽`}
        onClick={() => onNavigate('invoices')}
      />
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button className="client-cabinet-metric" type="button" onClick={onClick}>
      <Icon size={21} aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </button>
  );
}
