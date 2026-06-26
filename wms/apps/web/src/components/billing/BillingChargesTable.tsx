import { CheckCircle2 } from 'lucide-react';
import type { BillingChargeStatus, BillingChargeSummary } from '../../lib/api';
import { billingStatusLabel, billingStatusOptions, billingStatusTone, billingUnitLabel } from './billingMeta';

type BillingChargesTableProps = {
  charges: BillingChargeSummary[];
  canWrite: boolean;
  onStatusChange: (chargeId: string, status: BillingChargeStatus) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function BillingChargesTable({ charges, canWrite, onStatusChange }: BillingChargesTableProps) {
  return (
    <div className="billing-table-wrap">
      <table className="data-table billing-table">
        <thead>
          <tr>
            <th>Начисление</th>
            <th>Клиент</th>
            <th>Кол-во</th>
            <th>Цена</th>
            <th>Сумма</th>
            <th>Статус</th>
            {canWrite ? <th>Workflow</th> : null}
          </tr>
        </thead>
        <tbody>
          {charges.map((charge) => (
            <tr key={charge.id}>
              <td>
                <strong>{charge.description}</strong>
                <span>{charge.request?.title ?? charge.service?.code ?? 'ручное начисление'}</span>
                <span>{charge.source === 'STORAGE' ? 'авто: хранение' : 'ручное'}</span>
                <span>{formatDate(charge.serviceDate)}</span>
              </td>
              <td>
                <strong>{charge.client.code}</strong>
                <span>{charge.client.name}</span>
              </td>
              <td>
                {formatNumber(charge.quantity)} {billingUnitLabel(charge.unit)}
              </td>
              <td>{formatMoney(charge.unitPriceRub)} ₽</td>
              <td>
                <strong>{formatMoney(charge.totalRub)} ₽</strong>
              </td>
              <td>
                <span className={`status status--${billingStatusTone(charge.status)}`}>
                  {billingStatusLabel(charge.status)}
                </span>
                {charge.approvedBy ? <span>{charge.approvedBy.name}</span> : null}
              </td>
              {canWrite ? (
                <td>
                  <label className="billing-status-select">
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <select
                      value={charge.status}
                      onChange={(event) => onStatusChange(charge.id, event.target.value as BillingChargeStatus)}
                    >
                      {billingStatusOptions.map((option) => (
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

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

function formatMoney(value: string | number) {
  return moneyFormatter.format(Number(value));
}
