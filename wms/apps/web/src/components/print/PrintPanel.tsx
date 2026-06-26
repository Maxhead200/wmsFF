import { Boxes, FileText, Layers3, ListChecks, Package, Printer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { AuthSession, AuthUser } from '../../lib/api';
import { BoxLabelForm } from './BoxLabelForm';
import { LabelTemplatePanel } from './LabelTemplatePanel';
import { PalletLabelForm } from './PalletLabelForm';
import './print.css';
import { PrintJobPanel } from './PrintJobPanel';
import { SkuLabelForm } from './SkuLabelForm';

type PrintPanelProps = {
  session: AuthSession;
};

type PrintTab = 'box' | 'sku' | 'pallet' | 'templates' | 'jobs';

const printTabs: Array<{ id: PrintTab; label: string; icon: LucideIcon }> = [
  { id: 'box', label: 'Короб', icon: Boxes },
  { id: 'sku', label: 'SKU', icon: Package },
  { id: 'pallet', label: 'Паллета', icon: Layers3 },
  { id: 'templates', label: 'Шаблоны', icon: FileText },
  { id: 'jobs', label: 'Задания', icon: ListChecks },
];

export function PrintPanel({ session }: PrintPanelProps) {
  const [activeTab, setActiveTab] = useState<PrintTab>('box');

  if (!canUse(session.user, 'print:write')) {
    return null;
  }

  return (
    <section className="print-panel" aria-label="Печать этикеток">
      <div className="section-heading print-panel__heading">
        <div>
          <p className="eyebrow">Print</p>
          <h2>Печать этикеток</h2>
        </div>
        <Printer size={20} aria-hidden="true" />
      </div>

      <div className="print-tabs" role="tablist" aria-label="Тип этикетки">
        {printTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              className={activeTab === tab.id ? 'active' : ''}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'box' ? <BoxLabelForm session={session} /> : null}
      {activeTab === 'sku' ? <SkuLabelForm session={session} /> : null}
      {activeTab === 'pallet' ? <PalletLabelForm session={session} /> : null}
      {activeTab === 'templates' ? <LabelTemplatePanel session={session} /> : null}
      {activeTab === 'jobs' ? <PrintJobPanel session={session} /> : null}
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
