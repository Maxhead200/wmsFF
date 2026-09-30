import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './panthera-windows.css';

type Props = { activeId: string; onOpen: (id: string) => void; render: (id: string) => ReactNode };
type WindowEntry = { element: HTMLElement; button: HTMLButtonElement; title: string; minimized: boolean };

// FIX: retain only pages with minimized windows. Their forms stay mounted in React.
export function PantheraWorkspaces({ activeId, onOpen, render }: Props) {
  const [retained, setRetained] = useState<string[]>([]);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const retain = (id: string, needed: boolean) => setRetained(old => needed
    ? old.includes(id) ? old : [...old, id]
    : old.includes(id) ? old.filter(key => key !== id) : old);
  return <>{Array.from(new Set([...retained, activeId])).map(id =>
    <PantheraWindowSurface key={id} dock={dock} active={id === activeId} onOpen={() => onOpen(id)}
      onRetain={needed => retain(id, needed)}>{render(id)}</PantheraWindowSurface>)}
    {createPortal(<aside ref={setDock} className="panthera-window-dock" aria-label="Свёрнутые окна" />, document.body)}</>;
}

function PantheraWindowSurface({ active, onOpen, onRetain, children, dock }: {
  active: boolean; onOpen: () => void; onRetain: (needed: boolean) => void; children: ReactNode; dock: HTMLElement | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [windows, setWindows] = useState<WindowEntry[]>([]);
  const callbacks = useRef({ onOpen, onRetain });
  callbacks.current = { onOpen, onRetain };
  useEffect(() => {
    const surface = root.current!;
    const entries = new Map<HTMLElement, WindowEntry>();
    const publish = () => {
      setWindows([...entries.values()]);
      callbacks.current.onRetain([...entries.values()].some(entry => entry.minimized));
    };
    const sync = () => {
      let changed = false;
      for (const [element, entry] of entries) if (!surface.contains(element)) {
        entry.button.remove(); entries.delete(element); changed = true;
      }
      // Explicit operational dialogs only: confirmations and native date pickers keep their behavior.
      surface.querySelectorAll<HTMLElement>('.online-execution-modal, .fbs-assembly-dialog-backdrop').forEach(element => {
        if (entries.has(element)) return;
        const header = element.querySelector<HTMLElement>('.online-execution-modal__header, .fbs-assembly-dialog__heading');
        if (!header) return;
        const title = header.querySelector('h2,h3')?.textContent?.trim() || element.getAttribute('aria-label') || 'Окно WMS';
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'panthera-window-minimize';
        button.textContent = '−'; button.title = 'Свернуть окно'; button.setAttribute('aria-label', 'Свернуть окно');
        const entry: WindowEntry = { element, button, title, minimized: false };
        button.onclick = () => {
          entry.minimized = true; element.classList.add('panthera-window-minimized');
          (document.activeElement as HTMLElement | null)?.blur(); publish();
        };
        header.classList.add('panthera-window-header'); header.append(button);
        entries.set(element, entry); changed = true;
      });
      if (changed) publish();
    };
    const observer = new MutationObserver(sync);
    observer.observe(surface, { childList: true, subtree: true }); sync();
    return () => {
      observer.disconnect();
      entries.forEach(entry => { entry.button.remove(); entry.element.classList.remove('panthera-window-minimized'); });
    };
  }, []);
  const minimized = windows.filter(entry => entry.minimized);
  return <><div ref={root} hidden={!active} className="panthera-window-surface">{children}</div>
    {dock && minimized.length > 0 && createPortal(<>
      {minimized.map((entry, index) => <button type="button" key={index} title={`Развернуть: ${entry.title}`} onClick={() => {
        callbacks.current.onOpen(); entry.minimized = false; entry.element.classList.remove('panthera-window-minimized');
        setWindows([...windows]); callbacks.current.onRetain(windows.some(item => item.minimized));
        requestAnimationFrame(() => entry.button.focus());
      }}><span aria-hidden="true">▣</span><span>{entry.title}</span><span aria-hidden="true">↗</span></button>)}
    </>, dock)}
  </>;
}
