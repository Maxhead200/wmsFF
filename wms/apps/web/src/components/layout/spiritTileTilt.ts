const TILES = '.workspace-tile,.warehouse-topic-tile,.fbs-tile,.metric-tile,.module-card,.access-topic-tile,.admin-tech-tile,.billing-invoice-kind-tile,.billing-topic-tile,.directory-topic-tile,.fbs-warehouse-tile,.print-topic-tile,.turnover-summary-tile,.turnover-tile,.modern-dashboard__metrics article,.modern-dashboard__quick button';
type Bounds = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
// FIX: bounded rotation brings the pointer-side corner towards the viewer.
export function tileTilt(rect: Bounds, clientX: number, clientY: number) {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { x: clamp((clientY - rect.top) / rect.height * 2 - 1) * 4 || 0,
    y: -clamp((clientX - rect.left) / rect.width * 2 - 1) * 4 || 0 };
}

// FIX: delegated events handle dynamically rendered tiles without React re-renders.
export function installSpiritTileTilt(doc: Document = document, win: Window = window) {
  const media = win.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let active: HTMLElement | null = null;
  let bounds: Bounds | null = null;
  let frame: number | null = null;
  let attached = false;
  let point = { x: 0, y: 0 };
  const reset = () => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    active?.style.removeProperty('--spirit-tilt-x');
    active?.style.removeProperty('--spirit-tilt-y');
    active = null; bounds = null;
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) { reset(); return; }
    const target = event.target as Element | null;
    const tile = target?.closest?.(TILES) as HTMLElement | null;
    if (!tile || !tile.closest('.app-layout[data-ui-variant="spirit"]') || tile.matches(':disabled,[aria-disabled="true"]')) { reset(); return; }
    if (tile !== active) { reset(); active = tile; bounds = tile.getBoundingClientRect(); }
    point = { x: event.clientX, y: event.clientY };
    if (frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      if (!active?.isConnected || !bounds) { reset(); return; }
      const tilt = tileTilt(bounds, point.x, point.y);
      active.style.setProperty('--spirit-tilt-x', `${tilt.x.toFixed(2)}deg`);
      active.style.setProperty('--spirit-tilt-y', `${tilt.y.toFixed(2)}deg`);
    });
  };
  const leave = (event: PointerEvent) => {
    if (active && (!event.relatedTarget || !active.contains(event.relatedTarget as Node))) reset();
  };
  const detach = () => {
    if (attached) {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerout', leave);
      doc.removeEventListener('pointercancel', reset);
      doc.removeEventListener('scroll', reset, true);
      win.removeEventListener('blur', reset);
      win.removeEventListener('resize', reset);
    }
    attached = false; reset();
  };
  const sync = () => {
    detach();
    if (!media.matches) return;
    attached = true;
    doc.addEventListener('pointermove', move, { passive: true });
    doc.addEventListener('pointerout', leave, { passive: true });
    doc.addEventListener('pointercancel', reset);
    doc.addEventListener('scroll', reset, true);
    win.addEventListener('blur', reset);
    win.addEventListener('resize', reset);
  };
  media.addEventListener('change', sync);
  sync();
  return () => { media.removeEventListener('change', sync); detach(); };
}
