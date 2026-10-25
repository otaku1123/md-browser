// Show/hide toggle and drag-to-resize handle for the right-hand TOC. The choice (open + width)
// lives in the settings store, so every tab and the viewer share it like the other display settings.
import { t } from '../i18n';
import { clampWidth, createPanelResizer } from './panel-resizer';
import { createSettingsStore } from './settings-store';
import { TOC_SOURCE_CLASS } from './source-view';

export const TOC_WIDTH_DEFAULT = 280;
export const TOC_WIDTH_MIN = 160;
export const TOC_WIDTH_MAX = 480;

export interface TocPanelSettings {
  open: boolean;
  width: number;
}

export function clampTocWidth(v: unknown): number {
  return clampWidth(v, TOC_WIDTH_MIN, TOC_WIDTH_MAX, TOC_WIDTH_DEFAULT);
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

  const resizer = createPanelResizer({
    panel: tocEl,
    edge: 'left',
    className: 'toc-resizer',
    label: t('tocResize'),
    min: TOC_WIDTH_MIN,
    max: TOC_WIDTH_MAX,
    reset: TOC_WIDTH_DEFAULT,
    width: () => current.width,
    onResize: (width) => {
      current = { ...current, width };
      apply();
    },
    onCommit: (width) => commit({ ...current, width }),
  });
  const handle = resizer.el;
  // Inside the TOC's <nav>, so it belongs to that landmark; toc.ts re-renders only the list.
  tocEl.append(handle);

  /** Pushes the current state into the DOM. The toggle only exists while the document has headings
   *  (and its source isn't shown instead, see source-view.ts). */
  function apply(): void {
    const hasToc = !tocEl.classList.contains('empty') && !tocEl.classList.contains(TOC_SOURCE_CLASS);
    button.hidden = !hasToc;
    button.setAttribute('aria-expanded', String(current.open));
    tocEl.classList.toggle('collapsed', !current.open);
    handle.hidden = !hasToc || !current.open;
    document.documentElement.style.setProperty('--toc-w', `${current.width}px`);
    resizer.sync();
  }

  function commit(next: TocPanelSettings): void {
    current = next;
    apply();
    void store.save(current);
  }

  button.addEventListener('click', () => commit({ ...current, open: !current.open }));

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
