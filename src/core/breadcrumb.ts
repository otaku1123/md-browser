// Where the shown document is: "root / folder / folder / file.md" in the toolbar. Folders are
// buttons that reveal the folder in the file sidebar; the file name is the current page.
import { t } from '../i18n';

export interface Breadcrumb {
  el: HTMLElement;
  /**
   * `root`: the opened folder's label, first (null: none). `path`: the document's root-relative
   * path (null: nothing is shown). `clickable`: the sidebar can show the folders.
   */
  set(root: string | null, path: string | null, clickable: boolean): void;
}

export function createBreadcrumb(onFolder: (dir: string) => void): Breadcrumb {
  const el = document.createElement('nav');
  el.className = 'breadcrumb';
  el.setAttribute('aria-label', t('breadcrumb'));
  el.hidden = true;
  el.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-dir]');
    if (btn) onFolder(btn.dataset.dir!);
  });

  function set(root: string | null, path: string | null, clickable: boolean): void {
    if (path === null) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const ol = document.createElement('ol');
    /** `dir`: the folder's path ('' for the root); null for the file itself. */
    const crumb = (name: string, dir: string | null, className: string) => {
      const li = document.createElement('li');
      li.className = className;
      if (dir === null) {
        li.setAttribute('aria-current', 'page');
        li.textContent = name;
      } else if (clickable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'breadcrumb-dir';
        btn.dataset.dir = dir;
        btn.textContent = name;
        btn.title = t('breadcrumbFolder', { name: dir || name });
        li.append(btn);
      } else {
        const span = document.createElement('span');
        span.className = 'breadcrumb-dir';
        span.textContent = name;
        li.append(span);
      }
      ol.append(li);
    };
    const segs = path.split('/');
    // The folder label ends in "/" (workspace.ts); the separator already says that.
    if (root !== null) crumb(root.replace(/\/$/, ''), '', 'breadcrumb-root');
    segs.slice(0, -1).forEach((seg, i) => crumb(seg, segs.slice(0, i + 1).join('/'), 'breadcrumb-folder'));
    crumb(segs[segs.length - 1], null, 'breadcrumb-file');
    el.title = path;
    el.replaceChildren(ol);
    el.hidden = false;
  }

  return { el, set };
}
