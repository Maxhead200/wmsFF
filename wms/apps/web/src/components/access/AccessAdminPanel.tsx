import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { AuthSession, AuthUser } from '../../lib/api';
import './access.css';
import { UserCreateForm } from './UserCreateForm';
import { UserScopeEditor } from './UserScopeEditor';

type AccessAdminPanelProps = {
  session: AuthSession;
};

type AccessTab = 'create' | 'scopes';

export function AccessAdminPanel({ session }: AccessAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AccessTab>('create');

  if (!canUse(session.user, 'users:write')) {
    return null;
  }

  return (
    <section className="access-panel" aria-label="Пользователи и доступы">
      <div className="section-heading access-panel__heading">
        <div>
          <p className="eyebrow">RBAC</p>
          <h2>Пользователи и доступы</h2>
        </div>
      </div>

      <div className="access-tabs" role="tablist" aria-label="Раздел доступа">
        <button
          aria-selected={activeTab === 'create'}
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}
          role="tab"
          type="button"
        >
          <UserPlus size={16} aria-hidden="true" />
          <span>Создать</span>
        </button>
        <button
          aria-selected={activeTab === 'scopes'}
          className={activeTab === 'scopes' ? 'active' : ''}
          onClick={() => setActiveTab('scopes')}
          role="tab"
          type="button"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Доступы</span>
        </button>
      </div>

      {activeTab === 'create' ? <UserCreateForm session={session} /> : <UserScopeEditor session={session} />}
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
