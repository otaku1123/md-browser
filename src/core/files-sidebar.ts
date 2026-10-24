// Show/hide toggle for the left-hand file list, shared by the web viewer and file:// tabs.
// The choice lives in the settings store, so every tab and the viewer share it like the TOC panel.
import { t } from '../i18n';
import { createSettingsStore } from './settings-store';

export interface FilesSidebar {
  /** The sidebar is only offered when there is more than one document. */
  setAvailable(available: boolean): void;
}

/** Open unless saved as closed: false, or 'closed' from the web viewer's earlier localStorage format. */
export const normalizeFilesSidebar = (raw: unknown): boolean => raw !== false && raw !== 'closed';

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
  let open = true;
  let available = false;

  function apply(): void {
    toggle.hidden = !available;
    toggle.setAttribute('aria-expanded', String(open));
    filesEl.hidden = !(available && open);
  }

  toggle.addEventListener('click', () => {
    open = !open;
    apply();
    void store.save(open);
  });

  void store.load().then((v) => {
    open = v;
    apply();
  });
  store.onChange((v) => {
    open = v;
    apply();
  });

  return {
    setAvailable(next) {
      available = next;
      apply();
    },
  };
}
