import { CalendarClock, Check, ReceiptText } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type {
  FinalizeLogisticsDeliveryQuotePayload,
  LogisticsDeliveryRequestSummary,
  LogisticsDeliveryStatus,
} from '../../lib/api';
import {
  logisticsDeliveryStatusLabel,
  logisticsDeliveryStatusOptions,
  logisticsDeliveryStatusTone,
} from './logisticsMeta';

type LogisticsDeliveryRequestsTableProps = {
  items: LogisticsDeliveryRequestSummary[];
  canWrite: boolean;
  canCreateBillingCharge: boolean;
  onBillingChargeCreate: (deliveryId: string) => void;
  onQuoteFinalize: (deliveryId: string, payload: FinalizeLogisticsDeliveryQuotePayload) => Promise<void>;
  onStatusChange: (deliveryId: string, status: LogisticsDeliveryStatus) => void;
};

type QuoteDraft = {
  estimatedTotalRub: string;
  managerComment: string;
  isSaving: boolean;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU');
const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function LogisticsDeliveryRequestsTable({
  items,
  canWrite,
  canCreateBillingCharge,
  onBillingChargeCreate,
  onQuoteFinalize,
  onStatusChange,
}: LogisticsDeliveryRequestsTableProps) {
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, QuoteDraft>>({});

  function draftFor(request: LogisticsDeliveryRequestSummary) {
    return (
      quoteDrafts[request.id] ?? {
        estimatedTotalRub: request.estimatedTotalRub == null ? '' : String(request.estimatedTotalRub),
        managerComment: request.managerComment ?? '',
        isSaving: false,
      }
    );
  }

  function updateDraft(deliveryId: string, patch: Partial<QuoteDraft>) {
    setQuoteDrafts((current) => ({
      ...current,
      [deliveryId]: {
        estimatedTotalRub: current[deliveryId]?.estimatedTotalRub ?? '',
        managerComment: current[deliveryId]?.managerComment ?? '',
        isSaving: current[deliveryId]?.isSaving ?? false,
        ...patch,
      },
    }));
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>, request: LogisticsDeliveryRequestSummary) {
    event.preventDefault();
    const draft = draftFor(request);
    const estimatedTotalRub = Number(draft.estimatedTotalRub);

    if (!Number.isFinite(estimatedTotalRub) || estimatedTotalRub <= 0) {
      return;
    }

    updateDraft(request.id, { isSaving: true });
    try {
      await onQuoteFinalize(request.id, {
        estimatedTotalRub,
        managerComment: draft.managerComment.trim() || undefined,
      });
    } finally {
      updateDraft(request.id, { isSaving: false });
    }
  }

  return (
    <div className="delivery-table-wrap">
      <table className="data-table delivery-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Маршрут</th>
            <th>Объем</th>
            <th>Дата</th>
            <th>Расчет</th>
            <th>Биллинг</th>
            <th>Статус</th>
            {canWrite ? <th>Workflow</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((request) => {
            const draft = draftFor(request);
            const canFinalize = canWrite && canFinalizeQuote(request);
            const draftAmount = Number(draft.estimatedTotalRub);
            const canSubmitDraft = Number.isFinite(draftAmount) && draftAmount > 0 && !draft.isSaving;

            return (
              <tr key={request.id}>
                <td>
                  <strong>{request.client.code}</strong>
                  <span>{request.client.name}</span>
                </td>
                <td>
                  <strong>
                    {request.origin} -&gt; {request.destination}
                  </strong>
                  <span>{request.request?.title ?? request.comment ?? '-'}</span>
                </td>
                <td>{formatQuantity(request)}</td>
                <td>
                  <strong>{formatDate(request.desiredShipDate)}</strong>
                  {request.plannedShipDate ? <span>план {formatDate(request.plannedShipDate)}</span> : null}
                </td>
                <td>
                  {canFinalize ? (
                    <form className="delivery-quote-form" onSubmit={(event) => void submitQuote(event, request)}>
                      <input
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={draft.estimatedTotalRub}
                        onChange={(event) => updateDraft(request.id, { estimatedTotalRub: event.target.value })}
                        placeholder="Сумма, ₽"
                      />
                      <input
                        value={draft.managerComment}
                        onChange={(event) => updateDraft(request.id, { managerComment: event.target.value })}
                        placeholder="Комментарий"
                      />
                      <button className="delivery-quote-button" type="submit" disabled={!canSubmitDraft}>
                        <Check size={15} aria-hidden="true" />
                        <span>{draft.isSaving ? 'Сохраняю' : 'Зафиксировать'}</span>
                      </button>
                    </form>
                  ) : (
                    <>
                      <strong>{formatMoney(request.estimatedTotalRub)}</strong>
                      <span>{request.requiresManualReview ? 'ручная проверка' : request.tariffSet?.name ?? '-'}</span>
                    </>
                  )}
                </td>
                <td>
                  {request.billingCharge ? (
                    <div className="delivery-billing-link">
                      <strong>{formatMoney(request.billingCharge.totalRub)}</strong>
                      <span>{request.billingCharge.status}</span>
                    </div>
                  ) : canCreateBillingCharge && canGenerateBillingCharge(request) ? (
                    <button
                      className="delivery-billing-button"
                      type="button"
                      onClick={() => onBillingChargeCreate(request.id)}
                    >
                      <ReceiptText size={15} aria-hidden="true" />
                      <span>Начислить</span>
                    </button>
                  ) : (
                    <span className="delivery-billing-muted">{billingHint(request)}</span>
                  )}
                </td>
                <td>
                  <span className={`status status--${logisticsDeliveryStatusTone(request.status)}`}>
                    {logisticsDeliveryStatusLabel(request.status)}
                  </span>
                  {request.managerComment ? <span>{request.managerComment}</span> : null}
                </td>
                {canWrite ? (
                  <td>
                    <label className="delivery-status-select">
                      <CalendarClock size={15} aria-hidden="true" />
                      <select
                        value={request.status}
                        onChange={(event) => onStatusChange(request.id, event.target.value as LogisticsDeliveryStatus)}
                      >
                        {logisticsDeliveryStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function canFinalizeQuote(request: LogisticsDeliveryRequestSummary) {
  return !request.billingCharge && (request.requiresManualReview || request.estimatedTotalRub == null);
}

function canGenerateBillingCharge(request: LogisticsDeliveryRequestSummary) {
  return request.status === 'DELIVERED' && request.estimatedTotalRub != null && !request.requiresManualReview;
}

function billingHint(request: LogisticsDeliveryRequestSummary) {
  if (request.requiresManualReview || request.estimatedTotalRub == null) {
    return 'требует расчет';
  }

  if (request.status !== 'DELIVERED') {
    return 'после доставки';
  }

  return '-';
}

function formatQuantity(request: LogisticsDeliveryRequestSummary) {
  if (request.boxes != null) {
    return `${request.boxes} кор.`;
  }

  if (request.pallets != null) {
    return `${request.pallets} пал.`;
  }

  return '-';
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : '-';
}

function formatMoney(value: string | number | null) {
  return value == null ? 'на проверке' : `${moneyFormatter.format(Number(value))} ₽`;
}
