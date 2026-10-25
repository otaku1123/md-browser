// Drag-to-resize handle for a side panel (the TOC on the right, the file list on the left):
// pointer drag, arrow keys, Home / End, and double-click or Enter to reset. The caller stores the
// width and appends the handle inside the panel, so it belongs to the panel's landmark.

/** Class every handle carries, so panel re-renders can keep it (see file-tree.ts). */
export const PANEL_RESIZER_CLASS = 'panel-resizer';
const KEY_STEP = 16;

export interface PanelResizerOptions {
  panel: HTMLElement;
  /** The panel edge the handle sits on: 'left' for a right-hand panel, 'right' for a left-hand one. */
  edge: 'left' | 'right';
  className: string;
  label: string;
  min: number;
  max: number;
  reset: number;
  /** Current width (the caller owns the value). */
  width(): number;
  /** While dragging: show the width, don't save it yet. */
  onResize(width: number): void;
  /** Drag end, key or reset: save it. */
  onCommit(width: number): void;
}

export function clampWidth(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function createPanelResizer(o: PanelResizerOptions): { el: HTMLElement; sync(): void } {
  const clamp = (v: number) => clampWidth(v, o.min, o.max, o.reset);
  const handle = document.createElement('div');
  handle.className = `${PANEL_RESIZER_CLASS} ${o.className}`;
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', o.label);
  handle.setAttribute('aria-controls', o.panel.id);
  handle.setAttribute('aria-valuemin', String(o.min));
  handle.setAttribute('aria-valuemax', String(o.max));

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.focus();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    // The panel's outer edge stays put, so its width is the distance from the pointer to that edge.
    const rect = o.panel.getBoundingClientRect();
    o.onResize(clamp(o.edge === 'left' ? rect.right - e.clientX : e.clientX - rect.left));
  });
  const endDrag = (e: PointerEvent): void => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    handle.classList.remove('dragging');
    o.onCommit(o.width());
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('dblclick', () => o.onCommit(o.reset));
  handle.addEventListener('keydown', (e) => {
    // Moving the handle away from the panel's outer edge widens it.
    const widen = o.edge === 'left' ? 'ArrowLeft' : 'ArrowRight';
    const narrow = o.edge === 'left' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === widen) o.onCommit(clamp(o.width() + KEY_STEP));
    else if (e.key === narrow) o.onCommit(clamp(o.width() - KEY_STEP));
    else if (e.key === 'Home') o.onCommit(o.min);
    else if (e.key === 'End') o.onCommit(o.max);
    else if (e.key === 'Enter') o.onCommit(o.reset);
    else return;
    e.preventDefault();
  });

  return { el: handle, sync: () => handle.setAttribute('aria-valuenow', String(o.width())) };
}
