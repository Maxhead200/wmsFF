import { Trash2, X } from 'lucide-react';
import type { BillingStorageDetails, BillingStorageDetailRow } from '../../lib/api';

type BillingStorageDetailsModalProps = {
  details: BillingStorageDetails;
  canDeleteRows: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onDeleteRow: (row: BillingStorageDetailRow) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
});

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function BillingStorageDetailsModal({
  details,
  canDeleteRows,
  isDeleting,
  onClose,
  onDeleteRow,
}: BillingStorageDetailsModalProps) {
  const rows = details.charges.flatMap((charge) => charge.daily);

  return (
    <div className="billing-storage-modal-backdrop" role="presentation">
      <section className="billing-storage-modal" aria-label="Расшифровка хранения" role="dialog" aria-modal="true">
        <header className="billing-storage-modal__header">
          <div>
            <span>{details.invoice.client.name}</span>
            <h3>Расшифровка хранения по счету № {details.invoice.number}</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть расшифровку">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="billing-storage-modal__summary">
          <div>
            <span>Дней</span>
            <strong>{details.totals.days}</strong>
          </div>
          <div>
            <span>Литро-дней</span>
            <strong>{formatNumber(details.totals.literDays)}</strong>
          </div>
          <div>
            <span>Сумма</span>
            <strong>{formatMoney(details.totals.totalRub)} ₽</strong>
          </div>
        </div>

        <div className="billing-storage-modal__table-wrap">
          <table className="data-table billing-storage-modal__table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Литров</th>
                <th>Литро-дней</th>
                <th>Позиций</th>
                <th>Цена</th>
                <th>Сумма</th>
                {canDeleteRows ? <th>Действие</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={`${row.chargeId}-${row.date}`}>
                    <td>{formatDate(row.date)}</td>
                    <td>{formatNumber(row.totalLiters)}</td>
                    <td>{formatNumber(row.literDays)}</td>
                    <td>{row.positions}</td>
                    <td>{formatMoney(row.unitPriceRub)} ₽</td>
                    <td>{formatMoney(row.totalRub)} ₽</td>
                    {canDeleteRows ? (
                      <td>
                        <button
                          className="icon-text-button billing-danger-button"
                          type="button"
                          disabled={isDeleting}
                          onClick={() => onDeleteRow(row)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          <span>Удалить</span>
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canDeleteRows ? 7 : 6}>Строк хранения в счете нет.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}
