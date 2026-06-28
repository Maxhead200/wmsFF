import { useState } from 'react';
import { ChevronDown, Filter, RotateCcw } from 'lucide-react';
import type { BillingChargeStatus, BillingInvoiceStatus, ClientRequestStatus } from '../../lib/api';
import { billingInvoiceStatusLabel, billingStatusLabel, requestStatusLabel } from './clientCabinetFormat';

export type ClientCabinetNotificationFilter = '' | 'UNREAD' | 'READ';
export type ClientCabinetFileFilter = '' | 'WITH_FILES' | 'WITHOUT_FILES';

export type ClientCabinetFiltersValue = {
  dateFrom: string;
  dateTo: string;
  requestStatus: '' | ClientRequestStatus;
  invoiceStatus: '' | BillingInvoiceStatus;
  chargeStatus: '' | BillingChargeStatus;
  notificationState: ClientCabinetNotificationFilter;
  fileState: ClientCabinetFileFilter;
};

export type ClientCabinetFilterTotals = {
  requests: number;
  invoices: number;
  charges: number;
  notifications: number;
  files: number;
};

export const emptyClientCabinetFilters: ClientCabinetFiltersValue = {
  dateFrom: '',
  dateTo: '',
  requestStatus: '',
  invoiceStatus: '',
  chargeStatus: '',
  notificationState: '',
  fileState: '',
};

type ClientCabinetFiltersProps = {
  value: ClientCabinetFiltersValue;
  totals: ClientCabinetFilterTotals;
  onChange: (value: ClientCabinetFiltersValue) => void;
};

const requestStatusOptions: ClientRequestStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'IN_WORK',
  'PACKED',
  'DONE',
  'CANCELLED',
  'REJECTED',
];

const billingInvoiceStatusOptions: BillingInvoiceStatus[] = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'];

const billingStatusOptions: BillingChargeStatus[] = ['DRAFT', 'APPROVED', 'CANCELLED'];

export function ClientCabinetFilters({ value, totals, onChange }: ClientCabinetFiltersProps) {
  const activeCount = Object.values(value).filter(Boolean).length;
  const [isExpanded, setExpanded] = useState(false);

  function update(patch: Partial<ClientCabinetFiltersValue>) {
    onChange({ ...value, ...patch });
  }

  return (
    <section className={`client-cabinet-filters ${isExpanded ? 'is-expanded' : 'is-collapsed'}`} aria-label="Фильтры клиентского кабинета">
      <button
        className="client-cabinet-filters__toggle"
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="client-cabinet-filters__title">
          <Filter size={18} aria-hidden="true" />
          <span>
            <strong>Фильтр</strong>
            <small>{activeCount > 0 ? `${activeCount} активно` : 'без фильтров'}</small>
          </span>
        </span>
        <span className="client-cabinet-filters__toggle-text">{isExpanded ? 'Свернуть' : 'Открыть фильтр'}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>

      <div className="client-cabinet-filter-summary" aria-label="Итоги фильтра">
        <span>{totals.requests} заявок</span>
        <span>{totals.files} файлов</span>
        <span>{totals.invoices} счетов</span>
        <span>{totals.charges} начислений</span>
        <span>{totals.notifications} уведомлений</span>
      </div>

      {isExpanded ? (
        <>
          <div className="client-cabinet-filter-grid">
            <label>
              <span>Период с</span>
              <input type="date" value={value.dateFrom} onChange={(event) => update({ dateFrom: event.target.value })} />
            </label>

            <label>
              <span>Период по</span>
              <input type="date" value={value.dateTo} onChange={(event) => update({ dateTo: event.target.value })} />
            </label>

            <label>
              <span>Заявки</span>
              <select
                value={value.requestStatus}
                onChange={(event) => update({ requestStatus: event.target.value as ClientCabinetFiltersValue['requestStatus'] })}
              >
                <option value="">Все статусы</option>
                {requestStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {requestStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Файлы</span>
              <select value={value.fileState} onChange={(event) => update({ fileState: event.target.value as ClientCabinetFileFilter })}>
                <option value="">Все заявки</option>
                <option value="WITH_FILES">С файлами</option>
                <option value="WITHOUT_FILES">Без файлов</option>
              </select>
            </label>

            <label>
              <span>Счета</span>
              <select
                value={value.invoiceStatus}
                onChange={(event) => update({ invoiceStatus: event.target.value as ClientCabinetFiltersValue['invoiceStatus'] })}
              >
                <option value="">Все статусы</option>
                {billingInvoiceStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {billingInvoiceStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Начисления</span>
              <select
                value={value.chargeStatus}
                onChange={(event) => update({ chargeStatus: event.target.value as ClientCabinetFiltersValue['chargeStatus'] })}
              >
                <option value="">Все статусы</option>
                {billingStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {billingStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Уведомления</span>
              <select
                value={value.notificationState}
                onChange={(event) => update({ notificationState: event.target.value as ClientCabinetNotificationFilter })}
              >
                <option value="">Все уведомления</option>
                <option value="UNREAD">Непрочитанные</option>
                <option value="READ">Прочитанные</option>
              </select>
            </label>
          </div>

          <button
            className="icon-text-button client-cabinet-filters__reset"
            type="button"
            onClick={() => onChange(emptyClientCabinetFilters)}
            disabled={activeCount === 0}
            title="Сбросить фильтры"
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>Сбросить</span>
          </button>
        </>
      ) : null}
    </section>
  );
}
