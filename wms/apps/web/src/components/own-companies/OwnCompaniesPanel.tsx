import { Building2, Edit3, RefreshCw, Save } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createOwnCompany,
  fetchOwnCompanies,
  updateOwnCompany,
  type AuthSession,
  type AuthUser,
  type OwnCompanySummary,
  type UpsertOwnCompanyPayload,
} from '../../lib/api';
import './own-companies.css';

type OwnCompaniesPanelProps = {
  session: AuthSession;
};

type OwnCompanyFormState = {
  id: string | null;
  shortName: string;
  fullName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
  bankName: string;
  bankBik: string;
  bankAccount: string;
  correspondentAccount: string;
  paymentCode: string;
  paymentPurposeCode: string;
  isDefault: boolean;
  isActive: boolean;
  comment: string;
};

const emptyForm: OwnCompanyFormState = {
  id: null,
  shortName: '',
  fullName: '',
  inn: '',
  kpp: '',
  ogrn: '',
  legalAddress: '',
  bankName: '',
  bankBik: '',
  bankAccount: '',
  correspondentAccount: '',
  paymentCode: '',
  paymentPurposeCode: '',
  isDefault: false,
  isActive: true,
  comment: '',
};

export function OwnCompaniesPanel({ session }: OwnCompaniesPanelProps) {
  const canWrite = canUse(session.user, 'billing:write');
  const [companies, setCompanies] = useState<OwnCompanySummary[]>([]);
  const [form, setForm] = useState<OwnCompanyFormState>(emptyForm);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const defaultCompany = useMemo(() => companies.find((company) => company.isDefault), [companies]);

  useEffect(() => {
    void loadCompanies();
  }, []);

  if (!canUse(session.user, 'billing:read')) {
    return null;
  }

  async function loadCompanies() {
    setStatus('loading');
    setError(null);
    try {
      setCompanies(await fetchOwnCompanies(session.accessToken));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setStatus('idle');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      return;
    }

    setStatus('saving');
    setError(null);
    setMessage('');
    try {
      const payload = formToPayload(form);
      const saved = form.id
        ? await updateOwnCompany(session.accessToken, form.id, payload)
        : await createOwnCompany(session.accessToken, payload);
      setCompanies((current) => [saved, ...current.filter((company) => company.id !== saved.id)].sort(sortCompanies));
      setForm(emptyForm);
      setMessage('Реквизиты сохранены.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setStatus('idle');
    }
  }

  function edit(company: OwnCompanySummary) {
    setForm({
      id: company.id,
      shortName: company.shortName,
      fullName: company.fullName,
      inn: company.inn,
      kpp: company.kpp ?? '',
      ogrn: company.ogrn ?? '',
      legalAddress: company.legalAddress ?? '',
      bankName: company.bankName ?? '',
      bankBik: company.bankBik ?? '',
      bankAccount: company.bankAccount ?? '',
      correspondentAccount: company.correspondentAccount ?? '',
      paymentCode: company.paymentCode ?? '',
      paymentPurposeCode: company.paymentPurposeCode ?? '',
      isDefault: company.isDefault,
      isActive: company.isActive,
      comment: company.comment ?? '',
    });
    setMessage('');
  }

  return (
    <section className="own-companies-panel" aria-label="Собственные компании">
      <div className="section-heading own-companies-panel__heading">
        <div>
          <p className="eyebrow">Реквизиты</p>
          <h2>Собственные компании</h2>
        </div>
        <button className="icon-button" type="button" onClick={() => void loadCompanies()} title="Обновить" aria-label="Обновить">
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {defaultCompany ? (
        <div className="own-companies-default">
          <Building2 size={18} aria-hidden="true" />
          <span>По умолчанию для счетов и актов</span>
          <strong>{defaultCompany.shortName}</strong>
          <small>р/с {defaultCompany.bankAccount || 'не указан'}</small>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <form className="own-company-form" onSubmit={(event) => void submit(event)}>
        <div className="own-company-form__grid">
          <label>
            <span>Краткое название</span>
            <input required value={form.shortName} onChange={(event) => setFormValue('shortName', event.target.value)} />
          </label>
          <label>
            <span>Полное название</span>
            <input required value={form.fullName} onChange={(event) => setFormValue('fullName', event.target.value)} />
          </label>
          <label>
            <span>ИНН</span>
            <input required value={form.inn} onChange={(event) => setFormValue('inn', event.target.value)} />
          </label>
          <label>
            <span>КПП</span>
            <input value={form.kpp} onChange={(event) => setFormValue('kpp', event.target.value)} />
          </label>
          <label>
            <span>ОГРН / ОГРНИП</span>
            <input value={form.ogrn} onChange={(event) => setFormValue('ogrn', event.target.value)} />
          </label>
          <label className="own-company-form__wide">
            <span>Юридический адрес</span>
            <input value={form.legalAddress} onChange={(event) => setFormValue('legalAddress', event.target.value)} />
          </label>
          <label>
            <span>Банк</span>
            <input value={form.bankName} onChange={(event) => setFormValue('bankName', event.target.value)} />
          </label>
          <label>
            <span>БИК</span>
            <input value={form.bankBik} onChange={(event) => setFormValue('bankBik', event.target.value)} />
          </label>
          <label>
            <span>Расчетный счет</span>
            <input value={form.bankAccount} onChange={(event) => setFormValue('bankAccount', event.target.value)} />
          </label>
          <label>
            <span>Корр. счет</span>
            <input value={form.correspondentAccount} onChange={(event) => setFormValue('correspondentAccount', event.target.value)} />
          </label>
          <label>
            <span>Код</span>
            <input value={form.paymentCode} onChange={(event) => setFormValue('paymentCode', event.target.value)} />
          </label>
          <label>
            <span>Наз. пл.</span>
            <input value={form.paymentPurposeCode} onChange={(event) => setFormValue('paymentPurposeCode', event.target.value)} />
          </label>
          <label className="own-company-form__wide">
            <span>Комментарий</span>
            <input value={form.comment} onChange={(event) => setFormValue('comment', event.target.value)} />
          </label>
        </div>

        <div className="own-company-form__checks">
          <label>
            <input checked={form.isDefault} type="checkbox" onChange={(event) => setFormValue('isDefault', event.target.checked)} />
            <span>Использовать по умолчанию в счетах и актах</span>
          </label>
          <label>
            <input checked={form.isActive} type="checkbox" onChange={(event) => setFormValue('isActive', event.target.checked)} />
            <span>Активна</span>
          </label>
        </div>

        <div className="own-company-form__actions">
          <button className="primary-button" disabled={status === 'saving'} type="submit">
            <Save size={16} aria-hidden="true" />
            {form.id ? 'Сохранить изменения' : 'Добавить компанию'}
          </button>
          {form.id ? (
            <button className="secondary-button" type="button" onClick={() => setForm(emptyForm)}>
              Отменить
            </button>
          ) : null}
        </div>
      </form>

      <div className="own-companies-table-wrap">
        <table className="own-companies-table">
          <thead>
            <tr>
              <th>Компания</th>
              <th>ИНН</th>
              <th>Банк</th>
              <th>Расчетные счета</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>
                  <strong>{company.shortName}</strong>
                  <span>{company.fullName}</span>
                </td>
                <td>{company.inn}</td>
                <td>
                  <span>{company.bankName || '-'}</span>
                  <small>БИК {company.bankBik || '-'}</small>
                </td>
                <td>
                  {(company.bankAccounts.length ? company.bankAccounts : [null]).map((account, index) =>
                    account ? (
                      <small key={account.id}>
                        {account.isDefault ? 'Основной: ' : ''}{account.bankAccount} · {account.bankName}
                      </small>
                    ) : (
                      <small key={index}>{company.bankAccount || 'не указан'}</small>
                    ),
                  )}
                </td>
                <td>
                  <span className={`status status--${company.isActive ? 'ready' : 'planned'}`}>
                    {company.isActive ? 'активна' : 'выключена'}
                  </span>
                  {company.isDefault ? <span className="status status--in-progress">по умолчанию</span> : null}
                </td>
                <td>
                  <button className="icon-button" disabled={!canWrite} type="button" onClick={() => edit(company)} title="Редактировать" aria-label="Редактировать">
                    <Edit3 size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {companies.length === 0 ? (
              <tr>
                <td colSpan={6}>{status === 'loading' ? 'Загрузка...' : 'Компаний пока нет.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );

  function setFormValue<Key extends keyof OwnCompanyFormState>(key: Key, value: OwnCompanyFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function formToPayload(form: OwnCompanyFormState): UpsertOwnCompanyPayload {
  const account =
    form.bankName || form.bankBik || form.bankAccount || form.correspondentAccount
      ? [
          {
            bankName: form.bankName,
            bankBik: form.bankBik,
            bankAccount: form.bankAccount,
            correspondentAccount: form.correspondentAccount || undefined,
            isDefault: true,
          },
        ]
      : [];

  return {
    shortName: form.shortName,
    fullName: form.fullName,
    inn: form.inn,
    kpp: form.kpp || undefined,
    ogrn: form.ogrn || undefined,
    legalAddress: form.legalAddress || undefined,
    bankName: form.bankName || undefined,
    bankBik: form.bankBik || undefined,
    bankAccount: form.bankAccount || undefined,
    correspondentAccount: form.correspondentAccount || undefined,
    paymentCode: form.paymentCode || undefined,
    paymentPurposeCode: form.paymentPurposeCode || undefined,
    isDefault: form.isDefault,
    isActive: form.isActive,
    comment: form.comment || undefined,
    bankAccounts: account,
  };
}

function sortCompanies(left: OwnCompanySummary, right: OwnCompanySummary) {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  return left.shortName.localeCompare(right.shortName, 'ru');
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'Не удалось выполнить действие.';
}
