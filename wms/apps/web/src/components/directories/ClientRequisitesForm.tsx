import { Ban, CheckCircle2, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  deleteClient,
  fetchClients,
  fetchUsers,
  updateClient,
  updateClientStatus,
  type AuthSession,
  type ClientKind,
  type ClientStatus,
  type ClientSummary,
  type UpdateClientPayload,
  type UserSummary,
} from '../../lib/api';
import { DirectoryResultCard } from './DirectoryResultCard';

type ClientRequisitesFormProps = {
  session: AuthSession;
};

type ClientRequisitesFormState = {
  clientKind: ClientKind;
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
  fulfillmentManagerUserId: string;
};

const emptyForm: ClientRequisitesFormState = {
  clientKind: 'LEGAL_ENTITY',
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
  fulfillmentManagerUserId: '',
};

const clientKindOptions: Array<{ value: ClientKind; label: string }> = [
  { value: 'LEGAL_ENTITY', label: 'Юридическое лицо' },
  { value: 'INDIVIDUAL_ENTREPRENEUR', label: 'Индивидуальный предприниматель' },
  { value: 'SELF_EMPLOYED', label: 'Самозанятый' },
  { value: 'INDIVIDUAL', label: 'Физическое лицо' },
];

export function ClientRequisitesForm({ session }: ClientRequisitesFormProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [clientId, setClientId] = useState('');
  const [form, setForm] = useState<ClientRequisitesFormState>(emptyForm);
  const [savedClient, setSavedClient] = useState<ClientSummary | null>(null);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isStatusSubmitting, setStatusSubmitting] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [isEditorOpen, setEditorOpen] = useState(false);
  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId) ?? null, [clientId, clients]);

  useEffect(() => {
    void loadClients();
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [session.accessToken]);

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

  async function loadUsers() {
    try {
      const nextUsers = await fetchUsers(session.accessToken);
      setUsers(nextUsers.filter((user) => !isClientOnlyUser(user)));
    } catch {
      setUsers([]);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClient) {
      return;
    }

    setSubmitting(true);
    setError('');
    setActionMessage('');
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

  async function changeStatus(status: ClientStatus) {
    if (!selectedClient) {
      return;
    }

    setStatusSubmitting(true);
    setError('');
    setActionMessage('');
    try {
      const updated = await updateClientStatus(session.accessToken, selectedClient.id, status);
      setClients((current) => current.map((client) => (client.id === updated.id ? updated : client)));
      setActionMessage(status === 'ACTIVE' ? 'Клиент активирован.' : 'Клиент заблокирован.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить статус клиента.');
    } finally {
      setStatusSubmitting(false);
    }
  }

  async function removeClient() {
    if (!selectedClient) {
      return;
    }

    const confirmed = window.confirm(`Удалить клиента ${selectedClient.code} - ${selectedClient.name}? Если у клиента есть данные, WMS не даст удалить его.`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError('');
    setActionMessage('');
    setSavedClient(null);
    try {
      const deleted = await deleteClient(session.accessToken, selectedClient.id);
      const nextClients = clients.filter((client) => client.id !== deleted.id);
      setClients(nextClients);
      setClientId(nextClients[0]?.id ?? '');
      setActionMessage(`Клиент ${deleted.code} - ${deleted.name} удален.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить клиента.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form className="directory-form" onSubmit={submit}>
      <div className="directory-subheading">
        <div>
          <h3>Реквизиты клиента</h3>
          <span>тип клиента, юридические данные и ответственный менеджер</span>
        </div>
        <button className="icon-text-button" type="button" onClick={() => void loadClients()} disabled={isLoading}>
          <RefreshCw size={15} aria-hidden="true" />
          <span>{isLoading ? 'Обновляю' : 'Обновить'}</span>
        </button>
      </div>

      <div className="client-table-block">
        <div className="client-table-scroll">
          <table className="client-directory-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Наименование</th>
                <th>Статус</th>
                <th>ИНН</th>
                <th>Менеджер</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={6}>Клиенты не найдены</td>
                </tr>
              ) : null}
              {clients.map((client) => (
                <tr
                  className={client.id === clientId ? 'selected' : ''}
                  key={client.id}
                  onClick={() => {
                    setClientId(client.id);
                    setEditorOpen(true);
                  }}
                >
                  <td>{client.code}</td>
                  <td>{client.name}</td>
                  <td>
                    <span className={`client-status client-status--${client.status.toLowerCase()}`}>
                      {clientStatusLabel(client.status)}
                    </span>
                  </td>
                  <td>{client.inn || 'не задан'}</td>
                  <td>{client.fulfillmentManager?.name || 'не назначен'}</td>
                  <td>
                    <button
                      className="icon-text-button client-table-select"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setClientId(client.id);
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>Редактировать</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClient && isEditorOpen ? (
        <div className="client-modal-backdrop" role="presentation">
          <section className="client-modal" role="dialog" aria-modal="true" aria-label="Карточка клиента">
            <header className="client-modal__header">
              <div>
                <span>{selectedClient.code}</span>
                <h3>{selectedClient.name}</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditorOpen(false)} aria-label="Закрыть карточку клиента">
                <X size={18} aria-hidden="true" />
              </button>
            </header>

        <div className="client-control-panel">
          <div>
            <span>Статус клиента</span>
            <strong className={`client-status client-status--${selectedClient.status.toLowerCase()}`}>
              {clientStatusLabel(selectedClient.status)}
            </strong>
          </div>
          <div className="client-control-actions">
            {selectedClient.status === 'ACTIVE' ? (
              <button
                className="icon-text-button client-action-button"
                disabled={isStatusSubmitting || isDeleting}
                onClick={() => void changeStatus('PAUSED')}
                type="button"
              >
                <Ban size={15} aria-hidden="true" />
                <span>Заблокировать</span>
              </button>
            ) : (
              <button
                className="icon-text-button client-action-button"
                disabled={isStatusSubmitting || isDeleting}
                onClick={() => void changeStatus('ACTIVE')}
                type="button"
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>Активировать</span>
              </button>
            )}
            <button
              className="icon-text-button client-action-button client-action-button--danger"
              disabled={isDeleting || isStatusSubmitting}
              onClick={() => void removeClient()}
              type="button"
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{isDeleting ? 'Удаление' : 'Удалить'}</span>
            </button>
          </div>
        </div>

      <div className="directory-fields directory-fields--client">
        <label>
          <span>Тип клиента</span>
          <select value={form.clientKind} onChange={(event) => setForm({ ...form, clientKind: event.target.value as ClientKind })}>
            {clientKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
          <span>Менеджер фулфилмента</span>
          <select
            value={form.fulfillmentManagerUserId}
            onChange={(event) => setForm({ ...form, fulfillmentManagerUserId: event.target.value })}
          >
            <option value="">Не назначен</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.email}
              </option>
            ))}
          </select>
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
      {actionMessage ? <p className="form-success">{actionMessage}</p> : null}

      <button className="primary-button directory-submit" type="submit" disabled={isSubmitting || !selectedClient}>
        <Save size={16} aria-hidden="true" />
        <span>{isSubmitting ? 'Сохранение' : 'Сохранить реквизиты'}</span>
      </button>

      {savedClient ? (
        <DirectoryResultCard
          title="Реквизиты сохранены"
          lines={[
            `${savedClient.code} - ${savedClient.name}`,
            `${clientKindLabel(savedClient.clientKind)} · ИНН ${savedClient.inn ?? 'не задан'}`,
          ]}
        />
      ) : null}
          </section>
        </div>
      ) : null}
    </form>
  );
}

function formFromClient(client: ClientSummary): ClientRequisitesFormState {
  return {
    clientKind: client.clientKind,
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
    fulfillmentManagerUserId: client.fulfillmentManagerUserId ?? '',
  };
}

function compactPayload(form: ClientRequisitesFormState): UpdateClientPayload {
  return {
    clientKind: form.clientKind,
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
    fulfillmentManagerUserId: form.fulfillmentManagerUserId,
  };
}

function clientKindLabel(kind: ClientKind) {
  return clientKindOptions.find((option) => option.value === kind)?.label ?? kind;
}

function clientStatusLabel(status: ClientStatus) {
  const labels: Record<ClientStatus, string> = {
    ACTIVE: 'Активен',
    PAUSED: 'Заблокирован',
    ARCHIVED: 'В архиве',
  };
  return labels[status];
}

function isClientOnlyUser(user: UserSummary) {
  const internalRoles = ['ADMIN', 'OWNER', 'MANAGER', 'OPERATOR'];
  return user.roles.some((item) => item.role.code === 'CLIENT') && !user.roles.some((item) => internalRoles.includes(item.role.code));
}
