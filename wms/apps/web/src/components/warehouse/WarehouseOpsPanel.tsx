import { ArrowRightLeft } from 'lucide-react';
import type { AuthSession, AuthUser } from '../../lib/api';
import { BoxTransferForm } from './BoxTransferForm';
import { PickWavePanel } from './PickWavePanel';
import { StoragePanel } from './StoragePanel';
import './warehouse.css';

type WarehouseOpsPanelProps = {
  session: AuthSession;
};

export function WarehouseOpsPanel({ session }: WarehouseOpsPanelProps) {
  if (!canUse(session.user, 'stock:write')) {
    return null;
  }

  return (
    <section className="warehouse-panel" aria-label="Складские операции">
      <div className="section-heading warehouse-panel__heading">
        <div>
          <p className="eyebrow">Операции склада</p>
          <h2>Складские операции</h2>
        </div>
        <ArrowRightLeft size={20} aria-hidden="true" />
      </div>

      <BoxTransferForm session={session} />
      <StoragePanel session={session} />
      <PickWavePanel session={session} />
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
