import { Boxes, Database, Printer, Smartphone, Upload, UsersRound } from 'lucide-react';
import { ModuleBoard } from './components/ModuleBoard';
import { mvpModules } from './lib/modules';

const metrics = [
  { label: 'Остатки', value: 'WMS ledger', icon: Database },
  { label: 'Клиенты', value: '20+ ready', icon: UsersRound },
  { label: 'Короба', value: 'box-first', icon: Boxes },
  { label: 'Импорт', value: 'XLSX preview', icon: Upload },
  { label: 'ТСД', value: 'Kotlin online', icon: Smartphone },
  { label: 'Печать', value: 'TSC TSPL', icon: Printer },
];

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LOGOFF Fulfillment</p>
          <h1>WMS операционный контур</h1>
        </div>
        <button className="primary-button" type="button">Новая приёмка</button>
      </header>

      <section className="metrics-grid" aria-label="Состояние MVP">
        {metrics.map((metric) => (
          <article className="metric-tile" key={metric.label}>
            <metric.icon size={20} aria-hidden="true" />
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          </article>
        ))}
      </section>

      <ModuleBoard modules={mvpModules} />
    </main>
  );
}
