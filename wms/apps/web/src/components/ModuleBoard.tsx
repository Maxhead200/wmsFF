import type { LucideIcon } from 'lucide-react';

export type WmsModuleCard = {
  title: string;
  status: 'ready' | 'in-progress' | 'planned';
  description: string;
  icon: LucideIcon;
};

export function ModuleBoard({ modules }: { modules: WmsModuleCard[] }) {
  return (
    <section className="module-board" aria-label="Модули WMS">
      <div className="section-heading">
        <p className="eyebrow">Модули MVP</p>
        <h2>Первый рабочий срез</h2>
      </div>

      <div className="module-grid">
        {modules.map((module) => (
          <article className="module-card" key={module.title}>
            <div className="module-card__header">
              <module.icon size={22} aria-hidden="true" />
              <span className={`status status--${module.status}`}>{labelByStatus[module.status]}</span>
            </div>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const labelByStatus = {
  ready: 'заложено',
  'in-progress': 'в работе',
  planned: 'план',
};
