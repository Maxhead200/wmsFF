import { Save } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createUser,
  fetchClients,
  fetchRoles,
  type AuthSession,
  type ClientSummary,
  type RoleSummary,
  type UserSummary,
} from '../../lib/api';
import { AccessResultCard } from './AccessResultCard';
import { ClientScopePicker, scopeMapToCreatePayload, type ScopeMap } from './ClientScopePicker';

type UserCreateFormProps = {
  session: AuthSession;
};

const emptyUserForm = {
  email: '',
  name: '',
  password: '',
  tsdActivationCode: '',
};

export function UserCreateForm({ session }: UserCreateFormProps) {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [form, setForm] = useState(emptyUserForm);
  const [roleCodes, setRoleCodes] = useState<string[]>(['OPERATOR']);
  const [tsdOnly, setTsdOnly] = useState(false);
  const [scopeMode, setScopeMode] = useState<'all' | 'limited'>('all');
  const [scopeMap, setScopeMap] = useState<ScopeMap>({});
  const [createdUser, setCreatedUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [isLoading, setLoading] = useState(false);

  const selectedRoleLabel = useMemo(
    () => roleCodes.map((code) => roles.find((role) => role.code === code)?.name ?? code).join(', '),
    [roleCodes, roles],
  );
  const clientRoleSelected = roleCodes.includes('CLIENT');

  useEffect(() => {
    let isActive = true;

    async function loadDictionaries() {
      setLoading(true);
      setError('');

      try {
        const [nextRoles, nextClients] = await Promise.all([
          fetchRoles(session.accessToken),
          fetchClients(session.accessToken),
        ]);
        if (!isActive) {
          return;
        }

        setRoles(nextRoles);
        setClients(nextClients);
        if (!nextRoles.some((role) => role.code === 'OPERATOR')) {
          setRoleCodes(nextRoles[0] ? [nextRoles[0].code] : []);
        }
      } catch (caught) {
        if (isActive) {
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить роли и клиентов.');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadDictionaries();

    return () => {
      isActive = false;
    };
  }, [session.accessToken]);

  useEffect(() => {
    if (clientRoleSelected) {
      setScopeMode('limited');
    }
  }, [clientRoleSelected]);

  function toggleRole(code: string) {
    if (tsdOnly) {
      return;
    }
    setRoleCodes((current) => {
      if (current.includes(code)) {
        return current.filter((item) => item !== code);
      }

      return [...current, code];
    });
  }

  function toggleTsdOnly(checked: boolean) {
    setTsdOnly(checked);
    if (checked) {
      setRoleCodes(['TSD']);
      setScopeMode('all');
      setScopeMap({});
      return;
    }
    setRoleCodes(['OPERATOR']);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setCreatedUser(null);

    try {
      const scopes = scopeMode === 'limited' ? scopeMapToCreatePayload(scopeMap) : undefined;
      const created = await createUser(session.accessToken, {
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        tsdActivationCode: form.tsdActivationCode.trim() || undefined,
        roleCodes: roleCodes.length ? roleCodes : undefined,
        clientIds: scopes?.clientIds.length ? scopes.clientIds : undefined,
        writableClientIds: scopes?.writableClientIds.length ? scopes.writableClientIds : undefined,
      });
      setCreatedUser(created);
      setForm(emptyUserForm);
      setScopeMap({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать пользователя.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="access-form" onSubmit={submit}>
      <div className="access-fields">
        <label>
          <span>Почта</span>
          <input
            inputMode="email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
        </label>
        <label>
          <span>Имя</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          <span>Пароль</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
        </label>
        <label>
          <span>Код ТСД, 4 цифры</span>
          <input
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            placeholder="например 1234"
            type="text"
            value={form.tsdActivationCode}
            onChange={(event) => setForm({ ...form, tsdActivationCode: event.target.value.replace(/\D/g, '').slice(0, 4) })}
          />
        </label>
      </div>

      <div className="role-choice-grid" aria-label="Роли пользователя">
        <label className="role-choice role-choice--wide">
          <input checked={tsdOnly} type="checkbox" onChange={(event) => toggleTsdOnly(event.target.checked)} />
          <span>
            <strong>Только ТСД</strong>
            Вход в приложение ТСД логином и паролем, без привязки устройства
          </span>
        </label>
        {roles.map((role) => (
          <label className="role-choice" key={role.code}>
            <input checked={roleCodes.includes(role.code)} disabled={tsdOnly} type="checkbox" onChange={() => toggleRole(role.code)} />
            <span>
              <strong>{role.code}</strong>
              {role.name}
            </span>
          </label>
        ))}
      </div>

      <div className="access-segments" role="tablist" aria-label="Клиентский доступ">
        <button
          className={scopeMode === 'all' ? 'active' : ''}
          type="button"
          onClick={() => setScopeMode('all')}
          disabled={clientRoleSelected}
        >
          Все клиенты
        </button>
        <button className={scopeMode === 'limited' ? 'active' : ''} type="button" onClick={() => setScopeMode('limited')}>
          Ограничить
        </button>
      </div>

      {scopeMode === 'limited' ? <ClientScopePicker clients={clients} value={scopeMap} onChange={setScopeMap} /> : null}

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button access-submit" type="submit" disabled={isSubmitting || isLoading || roleCodes.length === 0}>
        <Save size={16} aria-hidden="true" />
        <span>{isSubmitting ? 'Сохранение' : 'Создать пользователя'}</span>
      </button>

      {createdUser ? (
        <AccessResultCard
          title="Пользователь создан"
          lines={[`${createdUser.name} · ${createdUser.email}`, selectedRoleLabel || 'роль не выбрана']}
        />
      ) : null}
    </form>
  );
}
