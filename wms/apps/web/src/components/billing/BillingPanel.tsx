import { Calculator, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchBillingCharges,
  fetchBillingInvoices,
  fetchBillingServices,
  fetchClientRequests,
  fetchClients,
  updateBillingChargeStatus,
  updateBillingInvoiceStatus,
  type AuthSession,
  type AuthUser,
  type BillingChargeStatus,
  type BillingChargeSummary,
  type BillingInvoiceStatus,
  type BillingInvoiceSummary,
  type BillingServiceSummary,
  type ClientRequestSummary,
  type ClientSummary,
} from '../../lib/api';
import { BillingChargeForm } from './BillingChargeForm';
import { BillingChargesTable } from './BillingChargesTable';
import './billing.css';
import { BillingInvoiceForm } from './BillingInvoiceForm';
import { BillingInvoicesTable } from './BillingInvoicesTable';
import { BillingPaymentForm } from './BillingPaymentForm';
import { BillingServiceForm } from './BillingServiceForm';

type LoadState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T[];
  error?: string;
};

type BillingPanelProps = {
  session: AuthSession;
};

export function BillingPanel({ session }: BillingPanelProps) {
  const canRead = canUse(session.user, 'billing:read');
  const canWrite = canUse(session.user, 'billing:write');
  const [charges, setCharges] = useState<LoadState<BillingChargeSummary>>({ status: 'idle', data: [] });
  const [invoices, setInvoices] = useState<LoadState<BillingInvoiceSummary>>({ status: 'idle', data: [] });
  const [services, setServices] = useState<LoadState<BillingServiceSummary>>({ status: 'idle', data: [] });
  const [clients, setClients] = useState<LoadState<ClientSummary>>({ status: 'idle', data: [] });
  const [requests, setRequests] = useState<LoadState<ClientRequestSummary>>({ status: 'idle', data: [] });
  const [error, setError] = useState<string | null>(null);

  const activeServices = useMemo(() => services.data.filter((service) => service.isActive), [services.data]);

  useEffect(() => {
    if (canRead) {
      void loadData();
    }
  }, [canRead]);

  if (!canRead) {
    return null;
  }

  async function loadData() {
    setError(null);
    setCharges((current) => ({ ...current, status: 'loading', error: undefined }));
    setInvoices((current) => ({ ...current, status: 'loading', error: undefined }));
    setServices((current) => ({ ...current, status: 'loading', error: undefined }));
    setClients((current) => ({ ...current, status: 'loading', error: undefined }));
    setRequests((current) => ({ ...current, status: 'loading', error: undefined }));

    try {
      const [nextCharges, nextInvoices, nextServices, nextClients, nextRequests] = await Promise.all([
        fetchBillingCharges(session.accessToken),
        fetchBillingInvoices(session.accessToken),
        fetchBillingServices(session.accessToken),
        fetchClients(session.accessToken),
        fetchClientRequests(session.accessToken),
      ]);
      setCharges({ status: 'ready', data: nextCharges });
      setInvoices({ status: 'ready', data: nextInvoices });
      setServices({ status: 'ready', data: nextServices });
      setClients({ status: 'ready', data: nextClients });
      setRequests({ status: 'ready', data: nextRequests });
    } catch (caught) {
      const message = errorMessage(caught);
      setCharges((current) => ({ ...current, status: 'error', error: message }));
      setInvoices((current) => ({ ...current, status: 'error', error: message }));
      setServices((current) => ({ ...current, status: 'error', error: message }));
      setClients((current) => ({ ...current, status: 'error', error: message }));
      setRequests((current) => ({ ...current, status: 'error', error: message }));
    }
  }

  function acceptService(service: BillingServiceSummary) {
    setServices((current) => ({
      status: 'ready',
      data: [service, ...current.data],
    }));
  }

  function acceptInvoice(invoice: BillingInvoiceSummary) {
    setInvoices((current) => ({
      status: 'ready',
      data: [invoice, ...current.data.filter((item) => item.id !== invoice.id)],
    }));
  }

  function acceptCharge(charge: BillingChargeSummary) {
    setCharges((current) => ({
      status: 'ready',
      data: [charge, ...current.data],
    }));
  }

  async function changeChargeStatus(chargeId: string, status: BillingChargeStatus) {
    setError(null);

    try {
      const updated = await updateBillingChargeStatus(session.accessToken, chargeId, { status });
      setCharges((current) => ({
        ...current,
        data: current.data.map((charge) => (charge.id === updated.id ? updated : charge)),
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function changeInvoiceStatus(invoiceId: string, status: BillingInvoiceStatus) {
    setError(null);

    try {
      const updated = await updateBillingInvoiceStatus(session.accessToken, invoiceId, { status });
      acceptInvoice(updated);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section className="billing-panel" aria-label="Биллинг">
      <div className="section-heading billing-panel__heading">
        <div>
          <p className="eyebrow">Billing</p>
          <h2>Услуги и начисления</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void loadData()}
          title="Обновить"
          aria-label="Обновить биллинг"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {canWrite && services.status === 'ready' ? <BillingServiceForm session={session} onCreated={acceptService} /> : null}

      {canWrite && clients.status === 'ready' && requests.status === 'ready' && services.status === 'ready' ? (
        <BillingChargeForm
          clients={clients.data}
          requests={requests.data}
          services={activeServices}
          session={session}
          onCreated={acceptCharge}
        />
      ) : null}

      {canWrite && clients.status === 'ready' ? (
        <BillingInvoiceForm clients={clients.data} session={session} onCreated={acceptInvoice} />
      ) : null}

      {canWrite && invoices.status === 'ready' ? (
        <BillingPaymentForm invoices={invoices.data} session={session} onPaid={acceptInvoice} />
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="billing-panel__subheading">
        <h3>Счета</h3>
      </div>
      <div className="billing-panel__list">{renderInvoices(invoices, canWrite, changeInvoiceStatus)}</div>

      <div className="billing-panel__subheading">
        <h3>Начисления</h3>
      </div>
      <div className="billing-panel__list">{renderCharges(charges, canWrite, changeChargeStatus)}</div>
    </section>
  );
}

function renderInvoices(
  state: LoadState<BillingInvoiceSummary>,
  canWrite: boolean,
  onStatusChange: (invoiceId: string, status: BillingInvoiceStatus) => void,
) {
  if (state.status === 'idle' || (state.status === 'loading' && state.data.length === 0)) {
    return (
      <p className="panel-message">
        <Calculator size={22} aria-hidden="true" />
        <span>Загружаю счета.</span>
      </p>
    );
  }

  if (state.status === 'error') {
    return <p className="panel-message panel-message--error">{state.error ?? 'Не удалось загрузить счета.'}</p>;
  }

  if (state.data.length === 0) {
    return <p className="panel-message">Счетов пока нет.</p>;
  }

  return (
    <>
      {state.status === 'loading' ? <p className="inline-status">Обновляю счета.</p> : null}
      <BillingInvoicesTable invoices={state.data} canWrite={canWrite} onStatusChange={onStatusChange} />
    </>
  );
}

function renderCharges(
  state: LoadState<BillingChargeSummary>,
  canWrite: boolean,
  onStatusChange: (chargeId: string, status: BillingChargeStatus) => void,
) {
  if (state.status === 'idle' || (state.status === 'loading' && state.data.length === 0)) {
    return (
      <p className="panel-message">
        <Calculator size={22} aria-hidden="true" />
        <span>Загружаю начисления.</span>
      </p>
    );
  }

  if (state.status === 'error') {
    return <p className="panel-message panel-message--error">{state.error ?? 'Не удалось загрузить биллинг.'}</p>;
  }

  if (state.data.length === 0) {
    return <p className="panel-message">Начислений пока нет.</p>;
  }

  return (
    <>
      {state.status === 'loading' ? <p className="inline-status">Обновляю начисления.</p> : null}
      <BillingChargesTable charges={state.data} canWrite={canWrite} onStatusChange={onStatusChange} />
    </>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить операцию.';
}
