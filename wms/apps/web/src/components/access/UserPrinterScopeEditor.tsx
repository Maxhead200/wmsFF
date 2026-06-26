import { Printer, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchPrintPrinterGroups,
  fetchUsers,
  updateUserPrinterScopes,
  type AuthSession,
  type PrintPrinterGroupSummary,
  type UserPrinterScope,
  type UserSummary,
} from '../../lib/api';
import { AccessResultCard } from './AccessResultCard';

type UserPrinterScopeEditorProps = {
  session: AuthSession;
};

export function UserPrinterScopeEditor({ session }: UserPrinterScopeEditorProps) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<PrintPrinterGroupSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [scopes, setScopes] = useState<UserPrinterScope[]>([]);
  const [groupCode, setGroupCode] = useState('DEFAULT');
  const [canPrint, setCanPrint] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [savedUser, setSavedUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  useEffect(() => {
    void loadDictionaries();
  }, [session.accessToken]);

  useEffect(() => {
    setScopes(selectedUser?.printerScopes ?? []);
    setSavedUser(null);
  }, [selectedUser]);

  async function loadDictionaries() {
    setLoading(true);
    setError('');

    try {
      const [nextUsers, nextGroups] = await Promise.all([
        fetchUsers(session.accessToken),
        fetchPrintPrinterGroups(session.accessToken),
      ]);
      setUsers(nextUsers);
      setGroups(nextGroups);
      setSelectedUserId((current) => current || nextUsers[0]?.id || '');
      setGroupCode((current) => current || nextGroups[0]?.groupCode || 'DEFAULT');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить пользователей и группы принтеров.');
    } finally {
      setLoading(false);
    }
  }

  function changeUser(userId: string) {
    setSelectedUserId(userId);
    setSavedUser(null);
  }

  function upsertScope() {
    const normalizedGroupCode = groupCode.trim().toUpperCase();
    if (!normalizedGroupCode) {
      return;
    }

    setSavedUser(null);
    setScopes((current) => [
      {
        groupCode: normalizedGroupCode,
        canPrint: canPrint || canManage,
        canManage,
      },
      ...current.filter((scope) => scope.groupCode !== normalizedGroupCode),
    ]);
  }

  function removeScope(targetGroupCode: string) {
    setSavedUser(null);
    setScopes((current) => current.filter((scope) => scope.groupCode !== targetGroupCode));
  }

  async function saveScopes() {
    if (!selectedUser) {
      return;
    }

    setSubmitting(true);
    setError('');
    setSavedUser(null);

    try {
      const saved = await updateUserPrinterScopes(session.accessToken, selectedUser.id, { scopes });
      setSavedUser(saved);
      setUsers((current) => current.map((user) => (user.id === saved.id ? saved : user)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить группы принтеров пользователя.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="access-form">
      <div className="access-fields access-fields--editor">
        <label>
          <span>Пользователь</span>
          <select value={selectedUserId} onChange={(event) => changeUser(event.target.value)} disabled={isLoading}>
            {users.length === 0 ? <option value="">Пользователи не найдены</option> : null}
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.email}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Группа принтеров</span>
          <input list="printer-groups" value={groupCode} onChange={(event) => setGroupCode(event.target.value)} />
          <datalist id="printer-groups">
            {groups.map((group) => (
              <option key={group.groupCode} value={group.groupCode} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="access-scope-switches">
        <label>
          <input type="checkbox" checked={canPrint} onChange={(event) => setCanPrint(event.target.checked)} />
          <span>Печать</span>
        </label>
        <label>
          <input type="checkbox" checked={canManage} onChange={(event) => setCanManage(event.target.checked)} />
          <span>Управление</span>
        </label>
        <button className="primary-button access-secondary" type="button" onClick={upsertScope}>
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Добавить группу</span>
        </button>
      </div>

      <div className="role-choice-grid" aria-label="Группы принтеров пользователя">
        {scopes.length === 0 ? <p className="panel-message">Группы принтеров не назначены.</p> : null}
        {scopes.map((scope) => (
          <button className="role-choice role-choice--selected" key={scope.groupCode} type="button" onClick={() => removeScope(scope.groupCode)}>
            <Printer size={16} aria-hidden="true" />
            <span>
              <strong>{scope.groupCode}</strong>
              {scope.canManage ? 'печать и управление' : scope.canPrint ? 'печать' : 'без печати'}
            </span>
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="access-actions">
        <button className="primary-button" type="button" onClick={() => void saveScopes()} disabled={!selectedUser || isSubmitting}>
          <Save size={16} aria-hidden="true" />
          <span>{isSubmitting ? 'Сохранение' : 'Сохранить группы'}</span>
        </button>
        <button className="primary-button access-secondary" type="button" onClick={() => void loadDictionaries()} disabled={isLoading}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>Обновить</span>
        </button>
      </div>

      {savedUser ? (
        <AccessResultCard
          title="Группы принтеров сохранены"
          lines={[
            `${savedUser.name} · ${savedUser.email}`,
            savedUser.printerScopes.map((scope) => `${scope.groupCode}: ${scope.canManage ? 'управление' : 'печать'}`).join(', ') ||
              'группы не назначены',
          ]}
        />
      ) : null}
    </div>
  );
}
