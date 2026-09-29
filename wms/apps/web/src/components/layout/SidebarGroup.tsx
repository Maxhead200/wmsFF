import { useEffect, useState, type ReactNode } from 'react';

type Props = { id: string; title: string; userId: string; activeId: string | null; collapsible: boolean; children: ReactNode };
// FIX: independent disclosures are enabled only in la_panthera; other themes keep their original markup.
export function SidebarGroup({ id, title, userId, activeId, collapsible, children }: Props) {
  const key = `wms.panthera.sidebar.${userId}.${id}`;
  const [open, setOpen] = useState(() => {
    if (activeId) return true;
    try { return localStorage.getItem(key) === 'open'; } catch { return false; }
  });
  useEffect(() => { if (collapsible && activeId) setOpen(true); }, [activeId, collapsible]);
  if (!collapsible) return <section className="workspace-nav__group"><p>{title}</p>{children}</section>;
  return <details className="workspace-nav__group workspace-nav__group--collapsible" open={open} onToggle={event => {
    const next = event.currentTarget.open;
    setOpen(next);
    try { localStorage.setItem(key, next ? 'open' : 'closed'); } catch { /* Storage may be unavailable. */ }
  }}>
    <summary>{title}</summary>
    {children}
  </details>;
}
