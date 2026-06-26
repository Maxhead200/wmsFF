import { LogOut, ShieldCheck } from 'lucide-react';
import type { AuthUser } from '../lib/api';

type UserBarProps = {
  user: AuthUser;
  onLogout: () => void;
};

export function UserBar({ user, onLogout }: UserBarProps) {
  return (
    <div className="userbar" aria-label="Текущий пользователь">
      <div className="userbar__identity">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <div className="userbar__meta">
        <span className="status status--ready">{user.clientScopeMode}</span>
        <span className="status status--planned">{user.roleCodes.join(', ') || 'NO ROLE'}</span>
      </div>
      <button className="icon-button" type="button" onClick={onLogout} title="Выйти" aria-label="Выйти">
        <LogOut size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
