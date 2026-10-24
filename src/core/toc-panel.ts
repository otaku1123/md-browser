// Show/hide toggle and drag-to-resize handle for the right-hand TOC. The choice (open + width)
// lives in the settings store, so every tab and the viewer share it like the other display settings.
import { t } from '../i18n';
import { createSettingsStore } from './settings-store';
import { TOC_SOURCE_CLASS } from './source-view';

export const TOC_WIDTH_DEFAULT = 280;
export const TOC_WIDTH_MIN = 160;
export const TOC_WIDTH_MAX = 480;
const KEY_STEP = 16;

export interface TocPanelSettings {
  open: boolean;
  width: number;
}

export function clampTocWidth(v: unknown): number {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return TOC_WIDTH_DEFAULT;
  return Math.min(TOC_WIDTH_MAX, Math.max(TOC_WIDTH_MIN, Math.round(n)));
}

/** Unset or malformed: shown at the default width. */
export function normalizeTocPanel(raw: unknown): TocPanelSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { open: o.open !== false, width: clampTocWidth(o.width) };
}

// List glyph with the bars pushed right, to hint at the panel's side (the files toggle is a plain hamburger).
const TOC_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M1 3.75A.75.75 0 0 1 1.75 3h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 3.75ZM6 8a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 6 8Zm3 4.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z"/></svg>';

let uid = 0;

/** Adds the toolbar toggle (before the settings gear) and the resize handle next to the TOC. */
export function mountTocPanel(toolbar: HTMLElement, tocEl: HTMLElement): void {
  const store = createSettingsStore('md-browser:toc-panel', normalizeTocPanel);
  let current: TocPanelSettings = normalizeTocPanel(null);
  tocEl.id ||= `md-toc-${++uid}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button toc-toggle';
  button.innerHTML = TOC_ICON;
  button.title = t('toc');
  button.setAttribute('aria-label', t('toc'));
  button.setAttribute('aria-controls', tocEl.id);
  const gear = toolbar.querySelector('.font-settings');
  if (gear) gear.before(button);
  else toolbar.append(button);

  const handle = document.createElement('div');
  handle.className = 'toc-resizer';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', t('tocResize'));
  handle.setAttribute('aria-controls', tocEl.id);
  handle.setAttribute('aria-valuemin', String(TOC_WIDTH_MIN));
  handle.setAttribute('aria-valuemax', String(TOC_WIDTH_MAX));
  tocEl.parentElement?.append(handle);

  /** Pushes the current state into the DOM. The toggle only exists while the document has headings
   *  (and its source isn't shown instead, see source-view.ts). */
  function apply(): void {
    const hasToc = !tocEl.classList.contains('empty') && !tocEl.classList.contains(TOC_SOURCE_CLASS);
    button.hidden = !hasToc;
    button.setAttribute('aria-expanded', String(current.open));
    tocEl.classList.toggle('collapsed', !current.open);
    handle.hidden = !hasToc || !current.open;
    document.documentElement.style.setProperty('--toc-w', `${current.width}px`);
    handle.setAttribute('aria-valuenow', String(current.width));
  }

  function commit(next: TocPanelSettings): void {
    current = next;
    apply();
    void store.save(current);
  }

  button.addEventListener('click', () => commit({ ...current, open: !current.open }));

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.focus();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    // The TOC hugs the right edge of the layout, so its width is the distance from the pointer to it.
    const right = tocEl.parentElement!.getBoundingClientRect().right;
    current = { ...current, width: clampTocWidth(right - e.clientX) };
    apply();
  });
  const endDrag = (e: PointerEvent): void => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    handle.classList.remove('dragging');
    void store.save(current);
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('dblclick', () => commit({ ...current, width: TOC_WIDTH_DEFAULT }));
  handle.addEventListener('keydown', (e) => {
    // The handle sits on the TOC's left edge: moving it left widens the panel.
    if (e.key === 'ArrowLeft') commit({ ...current, width: clampTocWidth(current.width + KEY_STEP) });
    else if (e.key === 'ArrowRight') commit({ ...current, width: clampTocWidth(current.width - KEY_STEP) });
    else if (e.key === 'Home') commit({ ...current, width: TOC_WIDTH_MIN });
    else if (e.key === 'End') commit({ ...current, width: TOC_WIDTH_MAX });
    else if (e.key === 'Enter') commit({ ...current, width: TOC_WIDTH_DEFAULT });
    else return;
    e.preventDefault();
  });

  // The TOC toggles its `empty` class on every render; follow it without touching the render call sites.
  new MutationObserver(apply).observe(tocEl, { attributes: true, attributeFilter: ['class'] });

  apply();
  void store.load().then((s) => {
    current = s;
    apply();
  });
  store.onChange((s) => {
    current = s;
    apply();
  });
}
