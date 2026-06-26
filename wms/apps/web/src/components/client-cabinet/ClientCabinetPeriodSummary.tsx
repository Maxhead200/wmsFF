import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, FileText, ListChecks, ReceiptText, WalletCards } from 'lucide-react';
import type { BillingChargeSummary, BillingInvoiceSummary } from '../../lib/api';
import { formatCabinetDate, formatCabinetMoney, formatCabinetNumber } from './clientCabinetFormat';

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
  charges: BillingChargeSummary[];
  invoices: BillingInvoiceSummary[];
  payments: PeriodPayment[];
  services: PeriodServiceGroup[];
};

type PeriodPayment = {
  id: string;
  invoiceNumber: string;
  paidAt: string;
  amountRub: string | number;
  method: string | null;
  reference: string | null;
};

type PeriodServiceGroup = {
  key: string;
  title: string;
  source: string;
  chargesCount: number;
  quantity: number;
  totalRub: number;
};

const periodFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

export function ClientCabinetPeriodSummary({ invoices, charges }: ClientCabinetPeriodSummaryProps) {
  const periods = useMemo(() => buildPeriodGroups(invoices, charges), [invoices, charges]);
  const [selectedKey, setSelectedKey] = useState('');
  const selectedPeriod = periods.find((period) => period.key === selectedKey) ?? periods[0] ?? null;

  return (
    <section className="client-period-summary" aria-label="Периоды клиента">
      <div className="client-cabinet-section__heading">
        <h3>Периоды</h3>
        <span className="status status--planned">{periods.length} периодов</span>
      </div>

      {periods.length === 0 ? (
        <p className="panel-message">Периодной детализации пока нет.</p>
      ) : (
        <>
          <div className="client-period-summary-list">
            {periods.slice(0, 10).map((period) => (
              <button
                className={`client-period-summary-item${period.key === selectedPeriod?.key ? ' is-active' : ''}`}
                key={period.key}
                type="button"
                onClick={() => setSelectedKey(period.key)}
              >
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
              </button>
            ))}
          </div>
          {selectedPeriod ? <ClientCabinetPeriodDetails period={selectedPeriod} /> : null}
        </>
      )}
    </section>
  );
}

function ClientCabinetPeriodDetails({ period }: { period: PeriodGroup }) {
  return (
    <div className="client-period-detail" aria-label={`Детализация ${period.label}`}>
      <div className="client-period-detail__heading">
        <div>
          <span>Выбранный период</span>
          <strong>{period.label}</strong>
        </div>
        <div>
          <span>Документы и операции</span>
          <strong>{formatCabinetNumber(period.documentsCount)}</strong>
        </div>
      </div>

      <div className="client-period-detail-grid">
        <PeriodDetailColumn
          icon={<ListChecks size={17} aria-hidden="true" />}
          title="Оказанные услуги"
          emptyText="Начислений за период нет."
        >
          {period.services.map((service) => (
            <div className="client-period-detail-row" key={service.key}>
              <div>
                <strong>{service.title}</strong>
                <span>
                  {service.chargesCount} начисл. · {service.source} · кол-во {formatCabinetNumber(service.quantity)}
                </span>
              </div>
              <strong>{formatCabinetMoney(service.totalRub)} ₽</strong>
            </div>
          ))}
        </PeriodDetailColumn>

        <PeriodDetailColumn
          icon={<ReceiptText size={17} aria-hidden="true" />}
          title="Счета и акты"
          emptyText="Счетов за период нет."
        >
          {period.invoices.map((invoice) => (
            <div className="client-period-detail-row" key={invoice.id}>
              <div>
                <strong>Счет № {invoice.number}</strong>
                <span>
                  {formatCabinetDate(invoice.periodFrom)} - {formatCabinetDate(invoice.periodTo)} · {invoice.items.length} поз.
                </span>
              </div>
              <strong>{formatCabinetMoney(invoice.totalRub)} ₽</strong>
            </div>
          ))}
        </PeriodDetailColumn>

        <PeriodDetailColumn
          icon={<WalletCards size={17} aria-hidden="true" />}
          title="Оплаты и долг"
          emptyText="Оплат за период нет."
        >
          {period.payments.map((payment) => (
            <div className="client-period-detail-row" key={payment.id}>
              <div>
                <strong>{formatCabinetDate(payment.paidAt)}</strong>
                <span>
                  счет № {payment.invoiceNumber}
                  {payment.method ? ` · ${payment.method}` : ''}
                  {payment.reference ? ` · ${payment.reference}` : ''}
                </span>
              </div>
              <strong>{formatCabinetMoney(payment.amountRub)} ₽</strong>
            </div>
          ))}
          <div className="client-period-detail-row client-period-detail-row--total">
            <div>
              <strong>Остаток долга</strong>
              <span>после учтенных оплат</span>
            </div>
            <strong>{formatCabinetMoney(period.debtRub)} ₽</strong>
          </div>
        </PeriodDetailColumn>
      </div>
    </div>
  );
}

function PeriodDetailColumn({
  icon,
  title,
  emptyText,
  children,
}: {
  icon: ReactNode;
  title: string;
  emptyText: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <div className="client-period-detail-column">
      <div className="client-period-detail-column__title">
        {icon}
        <strong>{title}</strong>
      </div>
      {items.length > 0 ? children : <p className="client-period-detail-empty">{emptyText}</p>}
    </div>
  );
}

function buildPeriodGroups(invoices: BillingInvoiceSummary[], charges: BillingChargeSummary[]) {
  const groups = new Map<string, PeriodGroup>();

  charges.forEach((charge) => {
    const group = ensurePeriod(groups, charge.serviceDate);
    group.chargesCount += 1;
    group.chargesRub += Number(charge.totalRub);
    group.documentsCount += 1;
    group.charges.push(charge);
  });

  invoices.forEach((invoice) => {
    const group = ensurePeriod(groups, invoice.periodFrom);
    group.invoicesCount += 1;
    group.paymentsCount += invoice.payments.length;
    group.invoicesRub += Number(invoice.totalRub);
    group.paidRub += Number(invoice.paidRub);
    group.debtRub += Math.max(0, Number(invoice.totalRub) - Number(invoice.paidRub));
    group.documentsCount += 1 + invoice.payments.length;
    group.invoices.push(invoice);
    invoice.payments.forEach((payment) => {
      group.payments.push({
        id: payment.id,
        invoiceNumber: invoice.number,
        paidAt: payment.paidAt,
        amountRub: payment.amountRub,
        method: payment.method,
        reference: payment.reference,
      });
    });
  });

  groups.forEach((group) => {
    group.services = buildServiceGroups(group.charges);
    group.invoices.sort((left, right) => right.periodFrom.localeCompare(left.periodFrom));
    group.payments.sort((left, right) => right.paidAt.localeCompare(left.paidAt));
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
    charges: [],
    invoices: [],
    payments: [],
    services: [],
  };
  groups.set(key, created);
  return created;
}

function buildServiceGroups(charges: BillingChargeSummary[]) {
  const services = new Map<string, PeriodServiceGroup>();

  charges.forEach((charge) => {
    const serviceKey = `${charge.service?.id ?? charge.serviceId ?? charge.source}:${charge.source}:${charge.unit}`;
    const current = services.get(serviceKey);
    const quantity = Number(charge.quantity);
    const totalRub = Number(charge.totalRub);

    if (!current) {
      services.set(serviceKey, {
        key: serviceKey,
        title: charge.service?.name ?? charge.description,
        source: charge.source === 'STORAGE' ? 'хранение' : charge.source === 'LOGISTICS' ? 'доставка' : 'ручная услуга',
        chargesCount: 1,
        quantity,
        totalRub,
      });
      return;
    }

    current.chargesCount += 1;
    current.quantity += quantity;
    current.totalRub += totalRub;
  });

  return [...services.values()].sort((left, right) => right.totalRub - left.totalRub);
}

function periodKey(dateValue: string) {
  return dateValue.slice(0, 7);
}
