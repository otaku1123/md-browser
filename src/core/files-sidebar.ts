// Show/hide toggle and drag-to-resize handle for the left-hand file list, shared by the web viewer
// and file:// tabs. The choice (open + width) lives in the settings store, so every tab and the
// viewer share it like the TOC panel.
import { t } from '../i18n';
import { clampWidth, createPanelResizer } from './panel-resizer';
import { createSettingsStore } from './settings-store';

export interface FilesSidebar {
  /** The sidebar is only offered when there is more than one document. */
  setAvailable(available: boolean): void;
}

export const FILES_WIDTH_DEFAULT = 240;
export const FILES_WIDTH_MIN = 160;
export const FILES_WIDTH_MAX = 480;

export interface FilesSidebarSettings {
  open: boolean;
  width: number;
}

/** Open at the default width unless saved otherwise. Earlier versions saved only the open state:
 *  a boolean, or 'closed' / 'open' from the web viewer's first localStorage format. */
export function normalizeFilesSidebar(raw: unknown): FilesSidebarSettings {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return { open: o.open !== false, width: clampWidth(o.width, FILES_WIDTH_MIN, FILES_WIDTH_MAX, FILES_WIDTH_DEFAULT) };
  }
  return { open: raw !== false && raw !== 'closed', width: FILES_WIDTH_DEFAULT };
}

const FILES_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M1 3.75A.75.75 0 0 1 1.75 3h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 3.75Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 8Zm.75 3.5h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z"/></svg>';

/** The toolbar button index.html declares statically, for pages built in script (file:// tabs). */
export function createFilesToggle(filesEl: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.innerHTML = FILES_ICON;
  button.title = t('files');
  button.setAttribute('aria-label', t('files'));
  button.setAttribute('aria-controls', filesEl.id);
  button.hidden = true;
  return button;
}

export function mountFilesSidebar(toggle: HTMLButtonElement, filesEl: HTMLElement): FilesSidebar {
  const store = createSettingsStore('md-browser:files-sidebar', normalizeFilesSidebar);
  let current: FilesSidebarSettings = normalizeFilesSidebar(null);
  let available = false;

  const resizer = createPanelResizer({
    panel: filesEl,
    edge: 'right',
    className: 'files-resizer',
    label: t('filesResize'),
    min: FILES_WIDTH_MIN,
    max: FILES_WIDTH_MAX,
    reset: FILES_WIDTH_DEFAULT,
    width: () => current.width,
    onResize: (width) => {
      current = { ...current, width };
      apply();
    },
    onCommit: (width) => commit({ ...current, width }),
  });
  // Inside the list's <nav>, so it belongs to that landmark; file-tree.ts keeps it on re-render.
  filesEl.append(resizer.el);

  function apply(): void {
    toggle.hidden = !available;
    toggle.setAttribute('aria-expanded', String(current.open));
    filesEl.hidden = !(available && current.open);
    document.documentElement.style.setProperty('--files-w', `${current.width}px`);
    resizer.sync();
  }

  function commit(next: FilesSidebarSettings): void {
    current = next;
    apply();
    void store.save(current);
  }

  toggle.addEventListener('click', () => commit({ ...current, open: !current.open }));

  void store.load().then((s) => {
    current = s;
    apply();
  });
  store.onChange((s) => {
    current = s;
    apply();
  });

  return {
    setAvailable(next) {
      available = next;
      apply();
    },
  };
}
