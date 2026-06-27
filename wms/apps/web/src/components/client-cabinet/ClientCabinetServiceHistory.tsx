import { BarChart3, ListChecks } from 'lucide-react';
import type { BillingServiceHistory } from '../../lib/api';
import { billingStatusTone } from '../billing/billingMeta';
import {
  billingSourceLabel,
  billingStatusLabel,
  billingUnitLabel,
  formatCabinetDate,
  formatCabinetMoney,
  formatCabinetNumber,
} from './clientCabinetFormat';

type ClientCabinetServiceHistoryProps = {
  history: BillingServiceHistory | null;
};

export function ClientCabinetServiceHistory({ history }: ClientCabinetServiceHistoryProps) {
  const groups = history?.groups ?? [];

  return (
    <section className="client-service-history" aria-label="История услуг">
      <div className="client-cabinet-section__heading">
        <h3>История услуг</h3>
        <span className="status status--planned">{groups.length} групп</span>
      </div>

      {!history || groups.length === 0 ? (
        <p className="panel-message">Истории услуг пока нет.</p>
      ) : (
        <>
          <div className="client-service-history-metrics">
            <ServiceMetric label="Всего начислений" value={formatCabinetNumber(history.totals.chargesCount)} />
            <ServiceMetric label="Сумма услуг" value={`${formatCabinetMoney(history.totals.totalRub)} ₽`} />
            <ServiceMetric label="Утверждено" value={`${formatCabinetMoney(history.totals.approvedRub)} ₽`} />
            <ServiceMetric label="Черновики" value={`${formatCabinetMoney(history.totals.draftRub)} ₽`} />
          </div>

          <div className="client-service-history-list">
            {groups.slice(0, 8).map((group) => (
              <article className="client-service-history-item" key={group.key}>
                <BarChart3 size={18} aria-hidden="true" />
                <div>
                  <strong>{group.serviceName}</strong>
                  <span>
                    {group.serviceCode} · {billingSourceLabel(group.source)}
                  </span>
                  <small>
                    {formatCabinetDate(group.firstServiceDate)} - {formatCabinetDate(group.lastServiceDate)}
                  </small>
                </div>
                <div className="client-service-history-item__numbers">
                  <strong>{formatCabinetMoney(group.totalRub)} ₽</strong>
                  <span>
                    {formatCabinetNumber(group.quantity)} {billingUnitLabel(group.unit)}
                  </span>
                  <small>{group.chargesCount} начисл.</small>
                </div>
                <div className="client-service-history-item__status">
                  <span className={`status status--${billingStatusTone(group.latestStatus)}`}>
                    {billingStatusLabel(group.latestStatus)}
                  </span>
                  <small>
                    утв. {formatCabinetMoney(group.approvedRub)} ₽ · черн. {formatCabinetMoney(group.draftRub)} ₽
                  </small>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ServiceMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="client-service-history-metric">
      <ListChecks size={17} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
