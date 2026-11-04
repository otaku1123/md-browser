// Click an image in the document to see it at full size in an overlay (the display size may differ:
// media-sizes.ts). An image larger than the window is shown fitted; a click or Esc closes the overlay.
// Diagrams (Mermaid, PlantUML) open the same way, scaled to fit the window, with Save SVG / Save PNG buttons.
// Inside the overlay, Ctrl/⌘ + wheel (or a trackpad pinch) zooms around the pointer, the wheel or a
// drag pans, a double-click toggles fit / 100%, and + − 0 and the arrow keys do the same from the keyboard.
// An overlay rather than a new tab: viewer images are blob: URLs that are revoked on re-render.
import { t } from '../i18n';
import { renderForExport } from './diagrams';
import { diagramFilename, savePng, saveSvg } from './diagram-export';

export interface ViewState {
  /** Factor on top of the fitted size (1 = as first shown). */
  scale: number;
  tx: number;
  ty: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 20;
const ZOOM_STEP = 1.25; // + / − keys
const PAN_STEP = 40; // arrow keys, px
const WHEEL_ZOOM = 0.002; // factor = exp(−deltaY × this): a wheel notch (100) ≈ ×1.22, pinch deltas stay smooth
const DRAG_THRESHOLD = 4; // px: less is a click (closes the overlay)
const DBLCLICK_MS = 250; // a click closes after this unless a double-click follows

export const FIT: ViewState = { scale: 1, tx: 0, ty: 0 };

export function clampScale(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/**
 * The state that scales to `scale` while the content under `pointer` stays put. `center` is where
 * the element's center sits on screen without any translation (transforms are around the center).
 */
export function zoomAround(
  state: ViewState,
  scale: number,
  pointer: { x: number; y: number },
  center: { x: number; y: number },
): ViewState {
  const next = clampScale(scale);
  const k = next / state.scale;
  return {
    scale: next,
    tx: pointer.x - center.x - (pointer.x - center.x - state.tx) * k,
    ty: pointer.y - center.y - (pointer.y - center.y - state.ty) * k,
  };
}

let overlay: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;
let view: { el: HTMLElement; state: ViewState; base(): number; level: HTMLElement } | null = null;

function close(): void {
  document.removeEventListener('keydown', onKeydown, true);
  overlay?.remove();
  overlay = null;
  view = null;
  returnFocus?.focus();
  returnFocus = null;
}

function show(label: string, bar: HTMLElement, el: HTMLElement, base: () => number): HTMLElement {
  close();
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay = document.createElement('div');
  overlay.className = 'image-zoom';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', label);
  overlay.title = t('imageZoomClose');
  overlay.tabIndex = -1;
  const level = document.createElement('span');
  level.className = 'zoom-level';
  level.setAttribute('role', 'status');
  level.title = t('zoomHint');
  bar.append(level);
  bar.addEventListener('click', (e) => e.stopPropagation()); // not a click on the backdrop
  el.classList.add('zoom-target');
  overlay.append(bar, el);
  view = { el, state: FIT, base, level };
  attachPanZoom(overlay);
  // On the document, not the overlay: Esc must close it wherever focus is.
  document.addEventListener('keydown', onKeydown, true);
  document.body.append(overlay);
  overlay.focus();
  apply();
  return overlay;
}

/** Pushes the view state into the DOM. The level is relative to the content's own pixels (100% = 1:1). */
function apply(): void {
  if (!view) return;
  const { el, state, level } = view;
  el.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  level.textContent = `${Math.round(state.scale * view.base() * 100)}%`;
}

function setState(next: ViewState): void {
  if (!view) return;
  view.state = next;
  apply();
}

/** Where the element's center is on screen without the translation. */
function centerOf(): { x: number; y: number } {
  const r = view!.el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - view!.state.tx, y: r.top + r.height / 2 - view!.state.ty };
}

function zoomBy(factor: number, pointer?: { x: number; y: number }): void {
  if (!view) return;
  const center = centerOf();
  setState(zoomAround(view.state, view.state.scale * factor, pointer ?? { x: center.x + view.state.tx, y: center.y + view.state.ty }, center));
}

/** Fit ↔ 100%: at 100% already (or when fit is 100%), back to fit. */
function toggleActual(pointer?: { x: number; y: number }): void {
  if (!view) return;
  const actual = 1 / view.base();
  const atActual = Math.abs(view.state.scale - actual) < 0.01;
  if (atActual || Math.abs(actual - 1) < 0.01) setState(FIT);
  else zoomBy(actual / view.state.scale, pointer);
}

function attachPanZoom(root: HTMLElement): void {
  root.addEventListener(
    'wheel',
    (e) => {
      if (!view) return;
      e.preventDefault();
      const dy = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-dy * WHEEL_ZOOM), { x: e.clientX, y: e.clientY });
      else {
        const dx = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaX * 16 : e.deltaX;
        setState({ ...view.state, tx: view.state.tx - dx, ty: view.state.ty - dy });
      }
    },
    { passive: false },
  );

  // Drag pans; a click (no real movement) still closes. Presses on the buttons are left alone, so
  // pointer capture never retargets their click onto the backdrop.
  let drag: { x: number; y: number; moved: number } | null = null;
  let dragged = false;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('.diagram-actions')) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    dragged = false;
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || !view) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) };
    if (drag.moved < DRAG_THRESHOLD) return;
    if (!dragged) root.classList.add('dragging');
    dragged = true;
    setState({ ...view.state, tx: view.state.tx + dx, ty: view.state.ty + dy });
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    root.classList.remove('dragging');
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('click', (e) => {
    if (dragged) {
      dragged = false;
      e.stopImmediatePropagation();
    }
  });
  // A click closes, but only once it is clear that it is not the start of a double-click.
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  root.addEventListener('dblclick', (e) => {
    clearTimeout(closeTimer);
    if ((e.target as Element).closest('.diagram-actions')) return;
    e.preventDefault();
    toggleActual({ x: e.clientX, y: e.clientY });
  });
  root.addEventListener('click', () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, DBLCLICK_MS);
  });
}

// The dialog is modal: Tab cycles through its buttons (or stays on the overlay) instead of
// reaching the page behind it.
function onKeydown(e: KeyboardEvent): void {
  if (!overlay) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const items = Array.from(overlay.querySelectorAll<HTMLElement>('button'));
    if (!items.length) {
      overlay.focus();
      return;
    }
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
    items[next].focus();
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey || !view) return;
  const pan: Record<string, [number, number]> = {
    ArrowLeft: [PAN_STEP, 0],
    ArrowRight: [-PAN_STEP, 0],
    ArrowUp: [0, PAN_STEP],
    ArrowDown: [0, -PAN_STEP],
  };
  if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
  else if (e.key === '-') zoomBy(1 / ZOOM_STEP);
  else if (e.key === '0') setState(FIT);
  else if (e.key in pan) setState({ ...view.state, tx: view.state.tx + pan[e.key][0], ty: view.state.ty + pan[e.key][1] });
  else return;
  e.preventDefault();
}

function zoomable(img: HTMLImageElement | null, content: HTMLElement): img is HTMLImageElement {
  return !!img && !img.closest('a') && !img.classList.contains('img-missing') && content.contains(img);
}

/** Makes document images reachable with Tab, like diagrams; call on each render's new content. */
export function prepareImageZoom(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img:not(.img-missing)')) {
    if (img.closest('a, .diagram')) continue; // links keep working as links; diagrams open as a whole
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', t('imageZoomOpen', { alt: img.alt || t('imageZoom') }));
  }
}

function open(img: HTMLImageElement): void {
  const full = document.createElement('img');
  full.src = img.currentSrc || img.src;
  full.alt = img.alt;
  const bar = document.createElement('div');
  bar.className = 'diagram-actions';
  // Layout width (unaffected by the transform) over the natural width: < 1 when fitted to the window.
  show(img.alt || t('imageZoom'), bar, full, () => (full.naturalWidth ? full.offsetWidth / full.naturalWidth : 1));
  full.addEventListener('load', apply, { once: true });
}

function openDiagram(node: HTMLElement, index: number): void {
  const svg = node.querySelector<SVGSVGElement>('.diagram-screen svg, :scope > svg');
  if (!svg) return;
  const bg = getComputedStyle(document.body).backgroundColor;
  const bar = document.createElement('div');
  bar.className = 'diagram-actions';
  const status = document.createElement('span');
  status.className = 'diagram-save-error';
  status.setAttribute('role', 'alert');
  const button = (label: string, save: () => void | Promise<void>) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', async (e) => {
      e.stopPropagation(); // not a click on the backdrop
      status.textContent = '';
      try {
        await save();
      } catch (err) {
        status.textContent = t('diagramSaveFailed', { error: err instanceof Error ? err.message : String(err) });
      }
    });
    return b;
  };
  bar.append(
    button(t('saveSvg'), () => saveSvg(svg, bg, diagramFilename(index, 'svg'))),
    button(t('savePng'), async () => savePng(await renderForExport(node), bg, diagramFilename(index, 'png'))),
    status,
  );
  // A clone, so the document's copy keeps its own size; the id stays so Mermaid's scoped styles apply.
  const full = svg.cloneNode(true) as SVGSVGElement;
  full.removeAttribute('width');
  full.removeAttribute('height');
  full.classList.add('diagram-zoom-svg');
  // The svg box fills the window; the drawing is scaled to fit inside it (xMidYMid meet), so one
  // viewBox unit is that many screen pixels at scale 1.
  const base = () => {
    const box = full.viewBox.baseVal;
    if (!box?.width || !box.height) return 1;
    const r = full.getBoundingClientRect();
    const scale = view?.state.scale ?? 1;
    return Math.min(r.width / scale / box.width, r.height / scale / box.height) || 1;
  };
  show(t('diagramZoom'), bar, full as unknown as HTMLElement, base);
}

/** Opens document images (not linked ones, which keep working as links) at full size on click. */
export function enableImageZoom(content: HTMLElement): void {
  content.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target as Element;
    if (target instanceof HTMLImageElement && zoomable(target, content)) {
      e.preventDefault();
      open(target);
      return;
    }
    const diagram = target.closest?.<HTMLElement>('.diagram:not(.diagram-error)');
    if (!diagram || target !== diagram) return;
    e.preventDefault();
    openDiagram(diagram, indexOf(content, diagram));
  });
  content.addEventListener('click', (e) => {
    const diagram = (e.target as Element).closest?.<HTMLElement>('.diagram:not(.diagram-error)');
    if (diagram && content.contains(diagram)) {
      openDiagram(diagram, indexOf(content, diagram));
      return;
    }
    const img = (e.target as Element).closest?.('img') ?? null;
    if (!zoomable(img, content)) return;
    e.preventDefault();
    open(img);
  });
}

function indexOf(content: HTMLElement, diagram: HTMLElement): number {
  return Array.from(content.querySelectorAll('.diagram')).indexOf(diagram) + 1;
}
