import { Printer } from 'lucide-react';
import type { AuthSession, AuthUser } from '../../lib/api';
import { BoxLabelForm } from './BoxLabelForm';
import './print.css';

type PrintPanelProps = {
  session: AuthSession;
};

export function PrintPanel({ session }: PrintPanelProps) {
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

      <BoxLabelForm session={session} />
    </section>
  );
}

function canUse(user: AuthUser, permission: string) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes(permission);
}
