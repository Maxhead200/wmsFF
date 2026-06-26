import { CalendarDays, FileText } from 'lucide-react';
import type { BillingChargeSummary, BillingInvoiceSummary } from '../../lib/api';
import { formatCabinetMoney, formatCabinetNumber } from './clientCabinetFormat';

type ClientCabinetPeriodSummaryProps = {
  invoices: BillingInvoiceSummary[];
  charges: BillingChargeSummary[];
};

type PeriodGroup = {
  key: string;
  label: string;
  chargesCount: number;
  invoicesCount: number;
  paymentsCount: number;
  chargesRub: number;
  invoicesRub: number;
  paidRub: number;
  debtRub: number;
  documentsCount: number;
};

const periodFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

export function ClientCabinetPeriodSummary({ invoices, charges }: ClientCabinetPeriodSummaryProps) {
  const periods = buildPeriodGroups(invoices, charges);

  return (
    <section className="client-period-summary" aria-label="Периоды клиента">
      <div className="client-cabinet-section__heading">
        <h3>Периоды</h3>
        <span className="status status--planned">{periods.length} периодов</span>
      </div>

      {periods.length === 0 ? (
        <p className="panel-message">Периодной детализации пока нет.</p>
      ) : (
        <div className="client-period-summary-list">
          {periods.slice(0, 10).map((period) => (
            <article className="client-period-summary-item" key={period.key}>
              <CalendarDays size={18} aria-hidden="true" />
              <div className="client-period-summary-item__title">
                <strong>{period.label}</strong>
                <span>
                  {period.chargesCount} начисл. · {period.invoicesCount} счетов · {period.paymentsCount} оплат
                </span>
              </div>
              <div className="client-period-summary-item__money">
                <span>Услуги</span>
                <strong>{formatCabinetMoney(period.chargesRub)} ₽</strong>
              </div>
              <div className="client-period-summary-item__money">
                <span>Счета</span>
                <strong>{formatCabinetMoney(period.invoicesRub)} ₽</strong>
                <small>оплачено {formatCabinetMoney(period.paidRub)} ₽</small>
              </div>
              <div className="client-period-summary-item__money">
                <span>Долг</span>
                <strong>{formatCabinetMoney(period.debtRub)} ₽</strong>
                <small>{formatCabinetNumber(period.documentsCount)} док.</small>
              </div>
              <FileText size={17} aria-hidden="true" />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function buildPeriodGroups(invoices: BillingInvoiceSummary[], charges: BillingChargeSummary[]) {
  const groups = new Map<string, PeriodGroup>();

  charges.forEach((charge) => {
    const group = ensurePeriod(groups, charge.serviceDate);
    group.chargesCount += 1;
    group.chargesRub += Number(charge.totalRub);
    group.documentsCount += 1;
  });

  invoices.forEach((invoice) => {
    const group = ensurePeriod(groups, invoice.periodFrom);
    group.invoicesCount += 1;
    group.paymentsCount += invoice.payments.length;
    group.invoicesRub += Number(invoice.totalRub);
    group.paidRub += Number(invoice.paidRub);
    group.debtRub += Math.max(0, Number(invoice.totalRub) - Number(invoice.paidRub));
    group.documentsCount += 1 + invoice.payments.length;
  });

  return [...groups.values()].sort((left, right) => right.key.localeCompare(left.key));
}

function ensurePeriod(groups: Map<string, PeriodGroup>, dateValue: string) {
  const key = periodKey(dateValue);
  const current = groups.get(key);
  if (current) {
    return current;
  }

  const created: PeriodGroup = {
    key,
    label: periodFormatter.format(new Date(`${key}-01T00:00:00.000Z`)),
    chargesCount: 0,
    invoicesCount: 0,
    paymentsCount: 0,
    chargesRub: 0,
    invoicesRub: 0,
    paidRub: 0,
    debtRub: 0,
    documentsCount: 0,
  };
  groups.set(key, created);
  return created;
}

function periodKey(dateValue: string) {
  return dateValue.slice(0, 7);
}
