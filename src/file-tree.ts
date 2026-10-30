import { PANEL_RESIZER_CLASS } from './core/panel-resizer';
import { scrollIntoPanel } from './core/scroll-into-panel';
import { t } from './i18n';

export interface FileTreeController {
  /**
   * Renders workspace-relative paths (e.g. "docs/guide.md") as a collapsible folder tree, then the
   * folders the user hid (same coordinates, e.g. "docs/old") so they can be shown again.
   * `hidden` null: this list can't hide folders, so no hide buttons are offered.
   */
  render(paths: string[], hidden?: string[] | null): void;
  /** Highlights the open document and expands the folders containing it. */
  setActive(path: string): void;
}

interface DirNode {
  dirs: Map<string, DirNode>;
  files: { name: string; path: string }[];
}

function buildTree(paths: string[]): DirNode {
  const root: DirNode = { dirs: new Map(), files: [] };
  for (const path of paths) {
    const segs = path.split('/');
    let node = root;
    for (const seg of segs.slice(0, -1)) {
      let next = node.dirs.get(seg);
      if (!next) node.dirs.set(seg, (next = { dirs: new Map(), files: [] }));
      node = next;
    }
    node.files.push({ name: segs[segs.length - 1], path });
  }
  return root;
}

const byName = (a: string, b: string) => a.localeCompare(b);

export interface FileTreeOptions {
  /** Offers a "hide" button on every folder row; `dir` is its path ("docs/old"). */
  onHide?(dir: string): void;
  /** Called from the hidden-folders section with a path given to render(). */
  onUnhide?(dir: string): void;
}

// Eye with a slash (Octicons eye-closed).
const HIDE_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z"/></svg>';

/** Sidebar file list: folders first, then files, each sorted by name. */
export function createFileTree(el: HTMLElement, onOpen: (path: string) => void, opts: FileTreeOptions = {}): FileTreeController {
  let buttons = new Map<string, HTMLButtonElement>();
  let active: HTMLButtonElement | null = null;
  let activePath: string | null = null;
  let hideable = false;

  function renderDir(node: DirNode, prefix: string): HTMLUListElement {
    const ul = document.createElement('ul');
    for (const name of [...node.dirs.keys()].sort(byName)) {
      const li = document.createElement('li');
      li.className = 'file-tree-dir';
      // Closed by default: a big folder stays short, and only the open document's folders expand
      // (setActive), so the current place stands out.
      const details = document.createElement('details');
      details.dataset.dir = `${prefix}${name}`;
      const summary = document.createElement('summary');
      summary.textContent = name;
      details.append(summary, renderDir(node.dirs.get(name)!, `${prefix}${name}/`));
      li.append(details);
      // Next to <details>, not inside <summary>: a button in a summary is nested-interactive.
      // Placed first, so keyboard focus reaches it right before its folder, not after the subtree.
      if (hideable) {
        const hide = document.createElement('button');
        hide.type = 'button';
        hide.className = 'file-tree-hide';
        hide.innerHTML = HIDE_ICON;
        hide.dataset.hideDir = `${prefix}${name}`;
        hide.title = t('hideFolder', { name: `${prefix}${name}` });
        hide.setAttribute('aria-label', hide.title);
        li.prepend(hide);
      }
      ul.append(li);
    }
    for (const file of [...node.files].sort((a, b) => byName(a.name, b.name))) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'file-tree-file';
      btn.textContent = file.name;
      btn.title = file.path;
      btn.dataset.path = file.path;
      buttons.set(file.path, btn);
      li.append(btn);
      ul.append(li);
    }
    return ul;
  }

  /** "Hidden folders (n)", collapsed: each folder with a button that lists it again. */
  function renderHidden(hidden: string[]): HTMLDetailsElement {
    const details = document.createElement('details');
    details.className = 'files-hidden';
    const summary = document.createElement('summary');
    summary.textContent = t('hiddenFolders', { count: hidden.length });
    const ul = document.createElement('ul');
    for (const dir of hidden) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'files-hidden-name';
      name.textContent = dir;
      const show = document.createElement('button');
      show.type = 'button';
      show.className = 'files-hidden-show';
      show.textContent = t('showFolder');
      show.dataset.unhideDir = dir;
      show.setAttribute('aria-label', t('showFolderLabel', { name: dir }));
      li.append(name, show);
      ul.append(li);
    }
    details.append(summary, ul);
    return details;
  }

  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const hide = target.closest<HTMLButtonElement>('button[data-hide-dir]');
    if (hide) return opts.onHide?.(hide.dataset.hideDir!);
    const show = target.closest<HTMLButtonElement>('button[data-unhide-dir]');
    if (show) return opts.onUnhide?.(show.dataset.unhideDir!);
    const btn = target.closest<HTMLButtonElement>('button[data-path]');
    if (btn) onOpen(btn.dataset.path!);
  });

  function setActive(path: string): void {
    activePath = path;
    const btn = buttons.get(path);
    if (!btn || btn === active) return;
    active?.classList.remove('active');
    active?.removeAttribute('aria-current');
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'page');
    active = btn;
    for (let d = btn.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    scrollIntoPanel(btn, el);
  }

  return {
    render(paths, hidden = []) {
      buttons = new Map();
      active = null;
      hideable = !!opts.onHide && hidden !== null;
      // The folders the user expanded stay expanded across a re-render (e.g. after hiding one).
      const expanded = new Set(Array.from(el.querySelectorAll<HTMLDetailsElement>('.file-tree details[open]'), (d) => d.dataset.dir));
      const list = renderDir(buildTree(paths), '');
      list.className = 'file-tree';
      for (const d of list.querySelectorAll<HTMLDetailsElement>('details')) if (expanded.has(d.dataset.dir)) d.open = true;
      const extra = hidden?.length && opts.onUnhide ? [renderHidden(hidden)] : [];
      // Keep the resize handle (files-sidebar.ts), which lives in the sidebar too.
      el.replaceChildren(list, ...extra, ...el.querySelectorAll(`:scope > .${PANEL_RESIZER_CLASS}`));
      // A re-render (e.g. after hiding a folder) keeps the open document marked.
      if (activePath !== null) setActive(activePath);
    },
    setActive,
  };
}
