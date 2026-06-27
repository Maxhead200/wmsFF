import { GitCompareArrows, PackagePlus, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AuthSession, AuthUser } from '../../lib/api';
import { ArticleMappingPanel } from './ArticleMappingPanel';
import { ClientCreateForm } from './ClientCreateForm';
import { ClientImportForm } from './ClientImportForm';
import { ClientRequisitesForm } from './ClientRequisitesForm';
import './directories.css';
import { SkuCreateForm } from './SkuCreateForm';
import { SkuDirectoryTable } from './SkuDirectoryTable';
import { SkuImportForm } from './SkuImportForm';

type DirectoryPanelProps = {
  session: AuthSession;
};

const directoryTabs = [
  { id: 'clients', label: 'Клиент', permission: 'clients:write', icon: UserPlus },
  { id: 'skus', label: 'Номенклатура', permission: 'skus:write', icon: PackagePlus },
  { id: 'article-mappings', label: 'Соответствия', permission: 'skus:write', icon: GitCompareArrows },
] as const;

type DirectoryTab = (typeof directoryTabs)[number]['id'];

export function DirectoryPanel({ session }: DirectoryPanelProps) {
  const [activeTab, setActiveTab] = useState<DirectoryTab>('clients');
  const [skuReloadKey, setSkuReloadKey] = useState(0);
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
      {activeTab === 'skus' ? (
        <div className="directory-stack">
          <SkuImportForm session={session} onImported={() => setSkuReloadKey((current) => current + 1)} />
          <SkuCreateForm session={session} onCreated={() => setSkuReloadKey((current) => current + 1)} />
          <SkuDirectoryTable session={session} reloadKey={skuReloadKey} />
        </div>
      ) : null}
      {activeTab === 'article-mappings' ? <ArticleMappingPanel session={session} /> : null}
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
