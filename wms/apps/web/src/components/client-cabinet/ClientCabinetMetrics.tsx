import { Boxes, ClipboardList, PackageCheck, ReceiptText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BillingInvoiceSummary, BillingReconciliation, ClientRequestSummary, StockBalance } from '../../lib/api';
import { formatCabinetMoney, formatCabinetNumber } from './clientCabinetFormat';

type ClientCabinetMetricsProps = {
  stock: StockBalance[];
  requests: ClientRequestSummary[];
  invoices: BillingInvoiceSummary[];
  reconciliation: BillingReconciliation | null;
};

const closedRequestStatuses = ['DONE', 'CANCELLED', 'REJECTED'];

export function ClientCabinetMetrics({ stock, requests, invoices, reconciliation }: ClientCabinetMetricsProps) {
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
      <MetricTile icon={PackageCheck} label="SKU" value={formatCabinetNumber(uniqueSkuCount)} />
      <MetricTile icon={Boxes} label="Единиц на остатке" value={formatCabinetNumber(totalQuantity)} />
      <MetricTile icon={ClipboardList} label="Активные заявки" value={formatCabinetNumber(activeRequests)} />
      <MetricTile icon={ReceiptText} label="К оплате" value={`${formatCabinetMoney(debtRub)} ₽`} />
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="client-cabinet-metric">
      <Icon size={21} aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
