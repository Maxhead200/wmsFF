import { AlertTriangle, CheckCircle2, Clock3, Download, Route, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LogisticsCarrierSummary, LogisticsDeliveryRequestSummary, LogisticsTripSummary } from '../../lib/api';
import { logisticsDeliveryStatusLabel, logisticsTripStatusLabel } from './logisticsMeta';

type LogisticsOperationsSummaryProps = {
  carriers: LogisticsCarrierSummary[];
  trips: LogisticsTripSummary[];
  deliveries: LogisticsDeliveryRequestSummary[];
};

type CarrierOpsGroup = {
  key: string;
  title: string;
  tripsCount: number;
  deliveriesCount: number;
  deliveredCount: number;
  manualReviewCount: number;
  estimatedRub: number;
  billedRub: number;
};

const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('ru-RU');

export function LogisticsOperationsSummary({ carriers, trips, deliveries }: LogisticsOperationsSummaryProps) {
  const summary = buildLogisticsSummary(carriers, trips, deliveries);

  return (
    <section className="logistics-summary" aria-label="Сводка логистики">
      <div className="logistics-summary__toolbar">
        <div>
          <strong>SLA логистики</strong>
          <span>
            {summary.slaTotal} доставок с датой SLA · средняя задержка {summary.averageDelayDays} дн.
          </span>
        </div>
        <button type="button" onClick={() => downloadLogisticsCsv(deliveries)}>
          <Download size={16} aria-hidden="true" />
          Экспорт CSV
        </button>
      </div>

      <div className="logistics-summary__metrics">
        <SummaryMetric icon={<Route size={18} />} label="Заявки" value={String(deliveries.length)} hint={`${summary.unassignedCount} без рейса`} />
        <SummaryMetric icon={<Truck size={18} />} label="Рейсы" value={String(trips.length)} hint={`${summary.activeTripsCount} активных`} />
        <SummaryMetric
          icon={<Clock3 size={18} />}
          label="SLA"
          value={`${summary.slaPercent}%`}
          hint={`${summary.onTimeCount} в срок, ${summary.lateDeliveredCount} поздно`}
        />
        <SummaryMetric
          icon={<AlertTriangle size={18} />}
          label="Контроль"
          value={String(summary.overdueOpenCount + summary.manualReviewCount)}
          hint={`${summary.overdueOpenCount} просрочено, ${summary.manualReviewCount} проверок`}
        />
        <SummaryMetric
          icon={<CheckCircle2 size={18} />}
          label="Начислено"
          value={`${formatMoney(summary.billedRub)} ₽`}
          hint={`${summary.billedCount} доставок`}
        />
      </div>

      <div className="logistics-summary__grid">
        <SummaryColumn title="Перевозчики" emptyText="Перевозчиков пока нет.">
          {summary.carriers.slice(0, 6).map((carrier) => (
            <div className="logistics-summary-row" key={carrier.key}>
              <div>
                <strong>{carrier.title}</strong>
                <span>
                  {carrier.tripsCount} рейс. · {carrier.deliveriesCount} дост. · {carrier.manualReviewCount} проверок
                </span>
              </div>
              <strong>{formatMoney(carrier.billedRub || carrier.estimatedRub)} ₽</strong>
            </div>
          ))}
        </SummaryColumn>

        <SummaryColumn title="Ближайшие рейсы" emptyText="Рейсов пока нет.">
          {summary.upcomingTrips.slice(0, 6).map((trip) => (
            <div className="logistics-summary-row" key={trip.id}>
              <div>
                <strong>{trip.code}</strong>
                <span>
                  {formatDate(trip.plannedDate)} · {logisticsTripStatusLabel(trip.status)} · {trip.carrier?.name ?? 'без перевозчика'}
                </span>
              </div>
              <strong>{trip.deliveries.length} дост.</strong>
            </div>
          ))}
        </SummaryColumn>

        <SummaryColumn title="Контроль доставки" emptyText="Заявок доставки пока нет.">
          {summary.problemDeliveries.slice(0, 6).map((delivery) => (
            <div className="logistics-summary-row" key={delivery.id}>
              <div>
                <strong>
                  {delivery.origin} - {delivery.destination}
                </strong>
                <span>
                  {delivery.client.code} · {logisticsDeliveryStatusLabel(delivery.status)}
                  {delivery.requiresManualReview ? ' · ручной расчет' : ''}
                </span>
              </div>
              <strong>{delivery.estimatedTotalRub == null ? 'проверка' : `${formatMoney(delivery.estimatedTotalRub)} ₽`}</strong>
            </div>
          ))}
        </SummaryColumn>

        <SummaryColumn title="SLA контроль" emptyText="Просроченных доставок нет.">
          {summary.slaProblems.slice(0, 6).map((delivery) => (
            <div className="logistics-summary-row" key={delivery.id}>
              <div>
                <strong>
                  {delivery.client.code} · {delivery.destination}
                </strong>
                <span>
                  {formatDate(delivery.desiredShipDate)} · {deliverySlaLabel(delivery)}
                </span>
              </div>
              <strong>{delayDays(delivery)} дн.</strong>
            </div>
          ))}
        </SummaryColumn>
      </div>
    </section>
  );
}

function SummaryMetric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <article className="logistics-summary-metric">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function SummaryColumn({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <div className="logistics-summary-column">
      <strong>{title}</strong>
      {items.length > 0 ? children : <p className="logistics-summary-empty">{emptyText}</p>}
    </div>
  );
}

function buildLogisticsSummary(
  carriers: LogisticsCarrierSummary[],
  trips: LogisticsTripSummary[],
  deliveries: LogisticsDeliveryRequestSummary[],
) {
  const carrierGroups = new Map<string, CarrierOpsGroup>();
  const slaDeliveries = deliveries.filter((delivery) => Boolean(delivery.desiredShipDate) && delivery.status === 'DELIVERED');
  const onTimeCount = slaDeliveries.filter((delivery) => !isDeliveryLate(delivery)).length;
  const lateDeliveredCount = slaDeliveries.length - onTimeCount;
  const overdueOpenCount = deliveries.filter(
    (delivery) => Boolean(delivery.desiredShipDate) && !isDeliveryClosed(delivery) && isDeliveryLate(delivery),
  ).length;
  const slaProblems = deliveries
    .filter((delivery) => Boolean(delivery.desiredShipDate) && isDeliveryLate(delivery))
    .sort((left, right) => delayDays(right) - delayDays(left));
  const totalDelayDays = slaProblems.reduce((sum, delivery) => sum + delayDays(delivery), 0);

  carriers.forEach((carrier) => {
    carrierGroups.set(carrier.id, {
      key: carrier.id,
      title: carrier.name,
      tripsCount: 0,
      deliveriesCount: 0,
      deliveredCount: 0,
      manualReviewCount: 0,
      estimatedRub: 0,
      billedRub: 0,
    });
  });

  trips.forEach((trip) => {
    const carrierKey = trip.carrier?.id ?? 'none';
    const carrier = ensureCarrierGroup(carrierGroups, carrierKey, trip.carrier?.name ?? 'Без перевозчика');
    carrier.tripsCount += 1;
  });

  deliveries.forEach((delivery) => {
    const carrierKey = delivery.trip?.carrier?.id ?? 'none';
    const carrier = ensureCarrierGroup(carrierGroups, carrierKey, delivery.trip?.carrier?.name ?? 'Без перевозчика');
    const estimatedRub = Number(delivery.estimatedTotalRub ?? 0);
    const billedRub = Number(delivery.billingCharge?.totalRub ?? 0);
    carrier.deliveriesCount += 1;
    carrier.deliveredCount += delivery.status === 'DELIVERED' ? 1 : 0;
    carrier.manualReviewCount += delivery.requiresManualReview || delivery.estimatedTotalRub == null ? 1 : 0;
    carrier.estimatedRub += estimatedRub;
    carrier.billedRub += billedRub;
  });

  return {
    activeTripsCount: trips.filter((trip) => trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED').length,
    unassignedCount: deliveries.filter((delivery) => !delivery.tripId).length,
    manualReviewCount: deliveries.filter((delivery) => delivery.requiresManualReview || delivery.estimatedTotalRub == null).length,
    estimatedRub: deliveries.reduce((sum, delivery) => sum + Number(delivery.estimatedTotalRub ?? 0), 0),
    billedRub: deliveries.reduce((sum, delivery) => sum + Number(delivery.billingCharge?.totalRub ?? 0), 0),
    billedCount: deliveries.filter((delivery) => Boolean(delivery.billingCharge)).length,
    slaTotal: slaDeliveries.length,
    onTimeCount,
    lateDeliveredCount,
    overdueOpenCount,
    slaPercent: slaDeliveries.length > 0 ? Math.round((onTimeCount / slaDeliveries.length) * 100) : 100,
    averageDelayDays: slaProblems.length > 0 ? Math.round((totalDelayDays / slaProblems.length) * 10) / 10 : 0,
    slaProblems,
    carriers: [...carrierGroups.values()].sort(
      (left, right) => right.deliveriesCount - left.deliveriesCount || right.tripsCount - left.tripsCount,
    ),
    upcomingTrips: trips
      .filter((trip) => trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED')
      .sort((left, right) => String(left.plannedDate ?? '').localeCompare(String(right.plannedDate ?? ''))),
    problemDeliveries: deliveries
      .filter((delivery) => delivery.requiresManualReview || delivery.estimatedTotalRub == null || !delivery.tripId)
      .sort((left, right) => Number(right.requiresManualReview) - Number(left.requiresManualReview)),
  };
}

function ensureCarrierGroup(groups: Map<string, CarrierOpsGroup>, key: string, title: string) {
  const current = groups.get(key);
  if (current) {
    return current;
  }

  const created: CarrierOpsGroup = {
    key,
    title,
    tripsCount: 0,
    deliveriesCount: 0,
    deliveredCount: 0,
    manualReviewCount: 0,
    estimatedRub: 0,
    billedRub: 0,
  };
  groups.set(key, created);
  return created;
}

function downloadLogisticsCsv(deliveries: LogisticsDeliveryRequestSummary[]) {
  const rows = [
    [
      'Клиент',
      'Маршрут',
      'Желаемая дата',
      'Плановая дата',
      'Статус',
      'SLA',
      'Рейс',
      'Перевозчик',
      'Коробки',
      'Паллеты',
      'Расчет, ₽',
      'Начислено, ₽',
      'Ручная проверка',
    ],
    ...deliveries.map((delivery) => [
      `${delivery.client.code} ${delivery.client.name}`,
      `${delivery.origin} - ${delivery.destination}`,
      formatDate(delivery.desiredShipDate),
      formatDate(delivery.plannedShipDate ?? delivery.trip?.plannedDate ?? null),
      logisticsDeliveryStatusLabel(delivery.status),
      deliverySlaLabel(delivery),
      delivery.trip?.code ?? '',
      delivery.trip?.carrier?.name ?? '',
      String(delivery.boxes ?? ''),
      String(delivery.pallets ?? ''),
      delivery.estimatedTotalRub == null ? '' : formatMoney(delivery.estimatedTotalRub),
      delivery.billingCharge?.totalRub == null ? '' : formatMoney(delivery.billingCharge.totalRub),
      delivery.requiresManualReview ? 'Да' : 'Нет',
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'logistics-sla-report.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function deliverySlaLabel(delivery: LogisticsDeliveryRequestSummary) {
  if (!delivery.desiredShipDate) {
    return 'Дата SLA не задана';
  }
  if (isDeliveryLate(delivery)) {
    return isDeliveryClosed(delivery) ? 'Доставлено с задержкой' : 'Просрочено';
  }
  if (delivery.status === 'DELIVERED') {
    return 'В срок';
  }
  return 'В работе';
}

function isDeliveryClosed(delivery: LogisticsDeliveryRequestSummary) {
  return delivery.status === 'DELIVERED' || delivery.status === 'CANCELLED';
}

function isDeliveryLate(delivery: LogisticsDeliveryRequestSummary) {
  if (!delivery.desiredShipDate || delivery.status === 'CANCELLED') {
    return false;
  }
  const dueEnd = endOfDay(delivery.desiredShipDate).getTime();
  const actual = delivery.status === 'DELIVERED' ? new Date(delivery.updatedAt).getTime() : Date.now();
  return actual > dueEnd;
}

function delayDays(delivery: LogisticsDeliveryRequestSummary) {
  if (!delivery.desiredShipDate || !isDeliveryLate(delivery)) {
    return 0;
  }
  const dueEnd = endOfDay(delivery.desiredShipDate).getTime();
  const actual = delivery.status === 'DELIVERED' ? new Date(delivery.updatedAt).getTime() : Date.now();
  return Math.max(1, Math.ceil((actual - dueEnd) / 86_400_000));
}

function endOfDay(value: string) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function formatMoney(value: string | number) {
  return moneyFormatter.format(Number(value));
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '-';
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
