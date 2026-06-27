import { PackagePlus, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AuthSession, AuthUser } from '../../lib/api';
import { ClientCreateForm } from './ClientCreateForm';
import { ClientImportForm } from './ClientImportForm';
import { ClientRequisitesForm } from './ClientRequisitesForm';
import './directories.css';
import { SkuCreateForm } from './SkuCreateForm';

type DirectoryPanelProps = {
  session: AuthSession;
};

const directoryTabs = [
  { id: 'clients', label: 'Клиент', permission: 'clients:write', icon: UserPlus },
  { id: 'skus', label: 'SKU', permission: 'skus:write', icon: PackagePlus },
] as const;

type DirectoryTab = (typeof directoryTabs)[number]['id'];

export function DirectoryPanel({ session }: DirectoryPanelProps) {
  const [activeTab, setActiveTab] = useState<DirectoryTab>('clients');
  const availableTabs = useMemo(
    () => directoryTabs.filter((tab) => canUse(session.user, tab.permission)),
    [session.user],
  );
  const activeTabMeta = availableTabs.find((tab) => tab.id === activeTab);

  useEffect(() => {
    if (availableTabs.length > 0 && !activeTabMeta) {
      setActiveTab(availableTabs[0].id);
    }
  }, [activeTabMeta, availableTabs]);

  if (availableTabs.length === 0) {
    return null;
  }

  return (
    <section className="directory-panel" aria-label="Справочники">
      <div className="section-heading directory-panel__heading">
        <div>
          <p className="eyebrow">Справочники</p>
          <h2>Справочники</h2>
        </div>
      </div>

      <div className="directory-tabs" role="tablist" aria-label="Тип справочника">
        {availableTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            <tab.icon size={16} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'clients' ? (
        <div className="directory-stack">
          <ClientImportForm session={session} />
          <ClientCreateForm session={session} />
          <ClientRequisitesForm session={session} />
        </div>
      ) : null}
      {activeTab === 'skus' ? <SkuCreateForm session={session} /> : null}
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
