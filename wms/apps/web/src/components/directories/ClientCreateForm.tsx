import { Save } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createClient, type AuthSession, type ClientSummary, type CreateClientPayload } from '../../lib/api';
import { DirectoryResultCard } from './DirectoryResultCard';

type ClientCreateFormProps = {
  session: AuthSession;
};

const emptyClientForm = {
  code: '',
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

export function ClientCreateForm({ session }: ClientCreateFormProps) {
  const [form, setForm] = useState(emptyClientForm);
  const [createdClient, setCreatedClient] = useState<ClientSummary | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setCreatedClient(null);

    try {
      const created = await createClient(session.accessToken, compactPayload(form));
      setCreatedClient(created);
      setForm(emptyClientForm);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать клиента.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="directory-form" onSubmit={submit}>
      <div className="directory-fields directory-fields--client">
        <label>
          <span>Код клиента</span>
          <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
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
          <span>КПП</span>
          <input value={form.kpp} onChange={(event) => setForm({ ...form, kpp: event.target.value })} />
        </label>
        <label>
          <span>ОГРН</span>
          <input value={form.ogrn} onChange={(event) => setForm({ ...form, ogrn: event.target.value })} />
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

      <button className="primary-button directory-submit" type="submit" disabled={isSubmitting}>
        <Save size={16} aria-hidden="true" />
        <span>{isSubmitting ? 'Сохранение' : 'Создать клиента'}</span>
      </button>

      {createdClient ? (
        <DirectoryResultCard
          title="Клиент создан"
          lines={[`${createdClient.code} - ${createdClient.name}`, createdClient.email ?? 'почта не задана']}
        />
      ) : null}
    </form>
  );
}

function compactPayload(form: typeof emptyClientForm): CreateClientPayload {
  // Русский комментарий: пустые необязательные поля не отправляем, чтобы class-validator не ругался на пустой email.
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    ...optionalString('legalName', form.legalName),
    ...optionalString('inn', form.inn),
    ...optionalString('kpp', form.kpp),
    ...optionalString('ogrn', form.ogrn),
    ...optionalString('legalAddress', form.legalAddress),
    ...optionalString('actualAddress', form.actualAddress),
    ...optionalString('phone', form.phone),
    ...optionalString('email', form.email),
    ...optionalString('bankName', form.bankName),
    ...optionalString('bankBik', form.bankBik),
    ...optionalString('bankAccount', form.bankAccount),
    ...optionalString('correspondentAccount', form.correspondentAccount),
  };
}

function optionalString<T extends string>(key: T, value: string): Partial<Record<T, string>> {
  const trimmed = value.trim();
  return trimmed ? { [key]: trimmed } as Partial<Record<T, string>> : {};
}
