import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, FileText, ReceiptText, WalletCards } from 'lucide-react';
import type { BillingChargeSummary, BillingInvoiceSummary } from '../../lib/api';
import { billingInvoiceStatusLabel, billingStatusLabel, billingUnitLabel } from './billingMeta';

type BillingPeriodSummaryProps = {
  charges: BillingChargeSummary[];
  invoices: BillingInvoiceSummary[];
};

type BillingPeriodGroup = {
  key: string;
  label: string;
  clients: Set<string>;
  chargesCount: number;
  invoicesCount: number;
  paymentsCount: number;
  chargesRub: number;
  approvedRub: number;
  draftRub: number;
  cancelledRub: number;
  invoicesRub: number;
  paidRub: number;
  debtRub: number;
  charges: BillingChargeSummary[];
  invoices: BillingInvoiceSummary[];
  services: BillingServicePeriodGroup[];
  clientRows: BillingClientPeriodGroup[];
};

type BillingServicePeriodGroup = {
  key: string;
  title: string;
  unit: string;
  count: number;
  quantity: number;
  totalRub: number;
};

type BillingClientPeriodGroup = {
  key: string;
  title: string;
  chargesRub: number;
  invoicesRub: number;
  paidRub: number;
  debtRub: number;
};

const periodFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const dateFormatter = new Intl.DateTimeFormat('ru-RU');
const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });

export function BillingPeriodSummary({ charges, invoices }: BillingPeriodSummaryProps) {
  const periods = useMemo(() => buildBillingPeriods(charges, invoices), [charges, invoices]);
  const [selectedKey, setSelectedKey] = useState('');
  const selectedPeriod = periods.find((period) => period.key === selectedKey) ?? periods[0] ?? null;

  if (periods.length === 0) {
    return <p className="panel-message">Периодной детализации пока нет.</p>;
  }

  return (
    <section className="billing-period-summary" aria-label="Периодная детализация биллинга">
      <div className="billing-period-summary__rail">
        {periods.slice(0, 12).map((period) => (
          <button
            className={`billing-period-card${period.key === selectedPeriod?.key ? ' is-active' : ''}`}
            key={period.key}
            type="button"
            onClick={() => setSelectedKey(period.key)}
          >
            <CalendarDays size={17} aria-hidden="true" />
            <div>
              <strong>{period.label}</strong>
              <span>
                {period.clients.size} клиентов · {period.chargesCount} начисл. · {period.invoicesCount} счетов
              </span>
            </div>
            <strong>{formatMoney(period.debtRub)} ₽</strong>
          </button>
        ))}
      </div>

      {selectedPeriod ? <BillingPeriodDetails period={selectedPeriod} /> : null}
    </section>
  );
}

function BillingPeriodDetails({ period }: { period: BillingPeriodGroup }) {
  return (
    <div className="billing-period-detail">
      <div className="billing-period-detail__metrics">
        <PeriodMetric icon={<FileText size={18} />} label="Услуги" value={`${formatMoney(period.chargesRub)} ₽`} />
        <PeriodMetric icon={<ReceiptText size={18} />} label="Счета" value={`${formatMoney(period.invoicesRub)} ₽`} />
        <PeriodMetric icon={<WalletCards size={18} />} label="Оплачено" value={`${formatMoney(period.paidRub)} ₽`} />
        <PeriodMetric icon={<CalendarDays size={18} />} label="Долг" value={`${formatMoney(period.debtRub)} ₽`} />
      </div>

      <div className="billing-period-detail__grid">
        <PeriodColumn title="Услуги" emptyText="Услуг за период нет.">
          {period.services.slice(0, 8).map((service) => (
            <div className="billing-period-row" key={service.key}>
              <div>
                <strong>{service.title}</strong>
                <span>
                  {service.count} начисл. · {service.unit} · кол-во {formatNumber(service.quantity)}
                </span>
              </div>
              <strong>{formatMoney(service.totalRub)} ₽</strong>
            </div>
          ))}
        </PeriodColumn>

        <PeriodColumn title="Клиенты" emptyText="Клиентских итогов нет.">
          {period.clientRows.slice(0, 8).map((client) => (
            <div className="billing-period-row" key={client.key}>
              <div>
                <strong>{client.title}</strong>
                <span>
                  счета {formatMoney(client.invoicesRub)} ₽ · оплачено {formatMoney(client.paidRub)} ₽
                </span>
              </div>
              <strong>{formatMoney(client.debtRub)} ₽</strong>
            </div>
          ))}
        </PeriodColumn>

        <PeriodColumn title="Последние документы" emptyText="Документов за период нет.">
          {period.invoices.slice(0, 6).map((invoice) => (
            <div className="billing-period-row" key={invoice.id}>
              <div>
                <strong>Счет № {invoice.number}</strong>
                <span>
                  {invoice.client.code} · {billingInvoiceStatusLabel(invoice.status)} · {formatDate(invoice.periodFrom)}
                </span>
              </div>
              <strong>{formatMoney(invoice.totalRub)} ₽</strong>
            </div>
          ))}
          {period.charges.slice(0, 4).map((charge) => (
            <div className="billing-period-row" key={charge.id}>
              <div>
                <strong>{charge.description}</strong>
                <span>
                  {charge.client.code} · {billingStatusLabel(charge.status)} · {formatDate(charge.serviceDate)}
                </span>
              </div>
              <strong>{formatMoney(charge.totalRub)} ₽</strong>
            </div>
          ))}
        </PeriodColumn>
      </div>
    </div>
  );
}

function PeriodMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="billing-period-metric">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function PeriodColumn({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <div className="billing-period-column">
      <strong>{title}</strong>
      {items.length > 0 ? children : <p className="billing-period-empty">{emptyText}</p>}
    </div>
  );
}

function buildBillingPeriods(charges: BillingChargeSummary[], invoices: BillingInvoiceSummary[]) {
  const groups = new Map<string, BillingPeriodGroup>();

  charges.forEach((charge) => {
    const group = ensurePeriod(groups, charge.serviceDate);
    const totalRub = Number(charge.totalRub);
    group.clients.add(charge.clientId);
    group.chargesCount += 1;
    group.chargesRub += totalRub;
    group.approvedRub += charge.status === 'APPROVED' ? totalRub : 0;
    group.draftRub += charge.status === 'DRAFT' ? totalRub : 0;
    group.cancelledRub += charge.status === 'CANCELLED' ? totalRub : 0;
    group.charges.push(charge);
  });

  invoices.forEach((invoice) => {
    const group = ensurePeriod(groups, invoice.periodFrom);
    const totalRub = Number(invoice.totalRub);
    const paidRub = Number(invoice.paidRub);
    group.clients.add(invoice.clientId);
    group.invoicesCount += 1;
    group.paymentsCount += invoice.payments.length;
    group.invoicesRub += totalRub;
    group.paidRub += paidRub;
    group.debtRub += Math.max(0, totalRub - paidRub);
    group.invoices.push(invoice);
  });

  groups.forEach((group) => {
    group.services = buildServiceRows(group.charges);
    group.clientRows = buildClientRows(group.charges, group.invoices);
    group.charges.sort((left, right) => right.serviceDate.localeCompare(left.serviceDate));
    group.invoices.sort((left, right) => right.periodFrom.localeCompare(left.periodFrom));
  });

  return [...groups.values()].sort((left, right) => right.key.localeCompare(left.key));
}

function ensurePeriod(groups: Map<string, BillingPeriodGroup>, dateValue: string) {
  const key = dateValue.slice(0, 7);
  const current = groups.get(key);
  if (current) {
    return current;
  }

  const created: BillingPeriodGroup = {
    key,
    label: periodFormatter.format(new Date(`${key}-01T00:00:00.000Z`)),
    clients: new Set<string>(),
    chargesCount: 0,
    invoicesCount: 0,
    paymentsCount: 0,
    chargesRub: 0,
    approvedRub: 0,
    draftRub: 0,
    cancelledRub: 0,
    invoicesRub: 0,
    paidRub: 0,
    debtRub: 0,
    charges: [],
    invoices: [],
    services: [],
    clientRows: [],
  };
  groups.set(key, created);
  return created;
}

function buildServiceRows(charges: BillingChargeSummary[]) {
  const services = new Map<string, BillingServicePeriodGroup>();

  charges.forEach((charge) => {
    const key = `${charge.serviceId ?? charge.source}:${charge.unit}`;
    const current = services.get(key);
    const totalRub = Number(charge.totalRub);
    const quantity = Number(charge.quantity);

    if (!current) {
      services.set(key, {
        key,
        title: charge.service?.name ?? charge.description,
        unit: billingUnitLabel(charge.unit),
        count: 1,
        quantity,
        totalRub,
      });
      return;
    }

    current.count += 1;
    current.quantity += quantity;
    current.totalRub += totalRub;
  });

  return [...services.values()].sort((left, right) => right.totalRub - left.totalRub);
}

function buildClientRows(charges: BillingChargeSummary[], invoices: BillingInvoiceSummary[]) {
  const clients = new Map<string, BillingClientPeriodGroup>();

  charges.forEach((charge) => {
    const client = ensureClient(clients, charge.clientId, `${charge.client.code} · ${charge.client.name}`);
    client.chargesRub += Number(charge.totalRub);
  });

  invoices.forEach((invoice) => {
    const client = ensureClient(clients, invoice.clientId, `${invoice.client.code} · ${invoice.client.name}`);
    const totalRub = Number(invoice.totalRub);
    const paidRub = Number(invoice.paidRub);
    client.invoicesRub += totalRub;
    client.paidRub += paidRub;
    client.debtRub += Math.max(0, totalRub - paidRub);
  });

  return [...clients.values()].sort((left, right) => right.debtRub - left.debtRub || right.chargesRub - left.chargesRub);
}

function ensureClient(clients: Map<string, BillingClientPeriodGroup>, key: string, title: string) {
  const current = clients.get(key);
  if (current) {
    return current;
  }

  const created: BillingClientPeriodGroup = {
    key,
    title,
    chargesRub: 0,
    invoicesRub: 0,
    paidRub: 0,
    debtRub: 0,
  };
  clients.set(key, created);
  return created;
}

function formatMoney(value: string | number) {
  return moneyFormatter.format(Number(value));
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '-';
}
