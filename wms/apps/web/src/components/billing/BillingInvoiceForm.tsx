import { ReceiptText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createBillingInvoice,
  type AuthSession,
  type BillingInvoiceSummary,
  type ClientSummary,
} from '../../lib/api';

type BillingInvoiceFormProps = {
  clients: ClientSummary[];
  session: AuthSession;
  onCreated: (invoice: BillingInvoiceSummary) => void;
};

export function BillingInvoiceForm({ clients, session, onCreated }: BillingInvoiceFormProps) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [periodFrom, setPeriodFrom] = useState(monthStart());
  const [periodTo, setPeriodTo] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId) {
      setError('Выберите клиента.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const invoice = await createBillingInvoice(session.accessToken, {
        clientId,
        periodFrom,
        periodTo,
        dueDate: dueDate || undefined,
        comment: comment || undefined,
      });
      onCreated(invoice);
      setComment('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сформировать счет.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="billing-form" onSubmit={(event) => void submit(event)}>
      <div className="billing-fields billing-fields--invoice">
        <label>
          <span>Клиент</span>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.code} - {client.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Период с</span>
          <input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
        </label>

        <label>
          <span>Период по</span>
          <input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
        </label>

        <label>
          <span>Оплатить до</span>
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>

        <label className="billing-fields__wide">
          <span>Комментарий</span>
          <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="для счета" />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button billing-submit" disabled={isSubmitting || clients.length === 0} type="submit">
        <ReceiptText size={17} aria-hidden="true" />
        <span>{isSubmitting ? 'Формирую' : 'Сформировать счет'}</span>
      </button>
    </form>
  );
}

function today() {
  return formatDateInput(new Date());
}

function monthStart() {
  const date = new Date();
  date.setDate(1);
  return formatDateInput(date);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
