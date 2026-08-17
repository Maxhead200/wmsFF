import type { ClientSummary } from '../../lib/api';

export type ScopeLevel = 'none' | 'read' | 'write';
export type ScopeMap = Record<string, ScopeLevel>;

type ClientScopePickerProps = {
  clients: ClientSummary[];
  value: ScopeMap;
  onChange: (nextValue: ScopeMap) => void;
};

export function ClientScopePicker({ clients, value, onChange }: ClientScopePickerProps) {
  function changeScope(clientId: string, level: ScopeLevel) {
    onChange({
      ...value,
      [clientId]: level,
    });
  }

  if (clients.length === 0) {
    return <p className="access-empty">Клиенты не найдены.</p>;
  }

  return (
    <div className="scope-picker">
      {clients.map((client) => (
        <label className="scope-row" key={client.id}>
          <span>
            <strong>{client.code}</strong>
            {client.name}
          </span>
          <select value={value[client.id] ?? 'none'} onChange={(event) => changeScope(client.id, event.target.value as ScopeLevel)}>
            <option value="none">Нет доступа</option>
            <option value="read">Чтение</option>
            <option value="write">Запись</option>
          </select>
        </label>
      ))}
    </div>
  );
}

export function scopeMapToPayload(scopeMap: ScopeMap) {
  // Русский комментарий: запись всегда включает чтение, потому что backend хранит write как расширение read-scope.
  return Object.entries(scopeMap)
    .filter(([, level]) => level !== 'none')
    .map(([clientId, level]) => ({
      clientId,
      canRead: true,
      canWrite: level === 'write',
    }));
}

export function scopeMapToCreatePayload(scopeMap: ScopeMap) {
  const scopes = scopeMapToPayload(scopeMap);
  // Русский комментарий: CreateUserDto принимает два массива, поэтому разворачиваем карту доступа в read/write списки.
  return {
    clientIds: scopes.map((scope) => scope.clientId),
    writableClientIds: scopes.filter((scope) => scope.canWrite).map((scope) => scope.clientId),
  };
}
