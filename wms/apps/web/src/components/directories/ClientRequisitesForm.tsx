import { RefreshCw, Save } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  fetchClients,
  updateClient,
  type AuthSession,
  type ClientSummary,
  type UpdateClientPayload,
} from '../../lib/api';
import { DirectoryResultCard } from './DirectoryResultCard';

type ClientRequisitesFormProps = {
  session: AuthSession;
};

type ClientRequisitesFormState = {
  name: string;
  legalName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
  actualAddress: string;
  phone: string;
  email: string;
  bankName: string;
  bankBik: string;
  bankAccount: string;
  correspondentAccount: string;
};

const emptyForm: ClientRequisitesFormState = {
  name: '',
  legalName: '',
  inn: '',
  kpp: '',
  ogrn: '',
  legalAddress: '',
  actualAddress: '',
  phone: '',
  email: '',
  bankName: '',
  bankBik: '',
  bankAccount: '',
  correspondentAccount: '',
};

export function ClientRequisitesForm({ session }: ClientRequisitesFormProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState('');
  const [form, setForm] = useState<ClientRequisitesFormState>(emptyForm);
  const [savedClient, setSavedClient] = useState<ClientSummary | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId) ?? null, [clientId, clients]);

  useEffect(() => {
    void loadClients();
  }, []);

  useEffect(() => {
    setForm(selectedClient ? formFromClient(selectedClient) : emptyForm);
  }, [selectedClient]);

  async function loadClients() {
    setLoading(true);
    setError('');

    try {
      const nextClients = await fetchClients(session.accessToken);
      setClients(nextClients);
      setClientId((current) => (nextClients.some((client) => client.id === current) ? current : nextClients[0]?.id ?? ''));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить клиентов.');
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClient) {
      return;
    }

    setSubmitting(true);
    setError('');
    setSavedClient(null);

    try {
      const updated = await updateClient(session.accessToken, selectedClient.id, compactPayload(form));
      setSavedClient(updated);
      setClients((current) => current.map((client) => (client.id === updated.id ? updated : client)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить реквизиты.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="directory-form" onSubmit={submit}>
      <div className="directory-subheading">
        <div>
          <h3>Реквизиты клиента</h3>
          <span>юрлицо и банк</span>
        </div>
        <button className="icon-text-button" type="button" onClick={() => void loadClients()} disabled={isLoading}>
          <RefreshCw size={15} aria-hidden="true" />
          <span>{isLoading ? 'Обновляю' : 'Обновить'}</span>
        </button>
      </div>

      <label className="directory-select-row">
        <span>Клиент</span>
        <select value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={clients.length === 0}>
          {clients.length === 0 ? <option value="">Клиенты не найдены</option> : null}
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.code} - {client.name}
            </option>
          ))}
        </select>
      </label>

      <div className="directory-fields directory-fields--client">
        <label>
          <span>Название</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          <span>Юр. название</span>
          <input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} />
        </label>
        <label>
          <span>ИНН</span>
          <input value={form.inn} onChange={(event) => setForm({ ...form, inn: event.target.value })} />
        </label>
        <label>
          <span>КПП</span>
          <input value={form.kpp} onChange={(event) => setForm({ ...form, kpp: event.target.value })} />
        </label>
        <label>
          <span>ОГРН</span>
          <input value={form.ogrn} onChange={(event) => setForm({ ...form, ogrn: event.target.value })} />
        </label>
        <label>
          <span>Телефон</span>
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </label>
        <label>
          <span>Почта</span>
          <input
            inputMode="email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          <span>Юр. адрес</span>
          <input value={form.legalAddress} onChange={(event) => setForm({ ...form, legalAddress: event.target.value })} />
        </label>
        <label>
          <span>Факт. адрес</span>
          <input value={form.actualAddress} onChange={(event) => setForm({ ...form, actualAddress: event.target.value })} />
        </label>
        <label>
          <span>Банк</span>
          <input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} />
        </label>
        <label>
          <span>БИК</span>
          <input value={form.bankBik} onChange={(event) => setForm({ ...form, bankBik: event.target.value })} />
        </label>
        <label>
          <span>Расчетный счет</span>
          <input value={form.bankAccount} onChange={(event) => setForm({ ...form, bankAccount: event.target.value })} />
        </label>
        <label>
          <span>Корр. счет</span>
          <input
            value={form.correspondentAccount}
            onChange={(event) => setForm({ ...form, correspondentAccount: event.target.value })}
          />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button directory-submit" type="submit" disabled={isSubmitting || !selectedClient}>
        <Save size={16} aria-hidden="true" />
        <span>{isSubmitting ? 'Сохранение' : 'Сохранить реквизиты'}</span>
      </button>

      {savedClient ? (
        <DirectoryResultCard
          title="Реквизиты сохранены"
          lines={[`${savedClient.code} - ${savedClient.name}`, savedClient.inn ?? 'ИНН не задан']}
        />
      ) : null}
    </form>
  );
}

function formFromClient(client: ClientSummary): ClientRequisitesFormState {
  return {
    name: client.name,
    legalName: client.legalName ?? '',
    inn: client.inn ?? '',
    kpp: client.kpp ?? '',
    ogrn: client.ogrn ?? '',
    legalAddress: client.legalAddress ?? '',
    actualAddress: client.actualAddress ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    bankName: client.bankName ?? '',
    bankBik: client.bankBik ?? '',
    bankAccount: client.bankAccount ?? '',
    correspondentAccount: client.correspondentAccount ?? '',
  };
}

function compactPayload(form: ClientRequisitesFormState): UpdateClientPayload {
  // Русский комментарий: пустая строка при обновлении очищает поле реквизитов на сервере.
  return {
    name: form.name.trim(),
    legalName: form.legalName,
    inn: form.inn,
    kpp: form.kpp,
    ogrn: form.ogrn,
    legalAddress: form.legalAddress,
    actualAddress: form.actualAddress,
    phone: form.phone,
    email: form.email,
    bankName: form.bankName,
    bankBik: form.bankBik,
    bankAccount: form.bankAccount,
    correspondentAccount: form.correspondentAccount,
  };
}
