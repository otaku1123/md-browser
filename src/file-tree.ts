import { PANEL_RESIZER_CLASS } from './core/panel-resizer';
import { scrollIntoPanel } from './core/scroll-into-panel';
import { t } from './i18n';

export interface FileTreeController {
  /**
   * Renders workspace-relative paths (e.g. "docs/guide.md") as a collapsible folder tree, then the
   * folders the user hid (same coordinates, e.g. "docs/old") so they can be shown again.
   * `hidden` null: this list can't hide folders, so no hide buttons are offered.
   * `favorites`: starred paths, listed first in their own section (those not in `paths` are left
   * out); null: this list can't star files, so no star buttons are offered.
   */
  render(paths: string[], hidden?: string[] | null, favorites?: string[] | null): void;
  /** Highlights the open document and expands the folders containing it. */
  setActive(path: string): void;
  /** Expands the folder ('' for the root) and its parents, scrolls to it and focuses its row. */
  reveal(dir: string): void;
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
  /** Offers a star button on every file row; `favorite` is the new state asked for. */
  onToggleFavorite?(path: string, favorite: boolean): void;
}

// Octicons star / star-fill.
const STAR_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"/></svg>';
const STAR_FILL_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>';

// Chevrons pointing away from / towards a line: expand all / collapse all.
const UNFOLD_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M4.5 5.5 8 2l3.5 3.5M4.5 10.5 8 14l3.5-3.5M3 8h10"/></svg>';
const FOLD_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M4.5 2 8 5.5 11.5 2M4.5 14 8 10.5 11.5 14M3 8h10"/></svg>';

// Eye with a slash (Octicons eye-closed).
const HIDE_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z"/></svg>';

/** Sidebar file list: folders first, then files, each sorted by name. */
export function createFileTree(el: HTMLElement, onOpen: (path: string) => void, opts: FileTreeOptions = {}): FileTreeController {
  /** A starred document has two rows: one in the favorites section and one in the tree. */
  let buttons = new Map<string, HTMLButtonElement[]>();
  let active: HTMLButtonElement[] = [];
  let activePath: string | null = null;
  let hideable = false;
  let starred: ReadonlySet<string> | null = null;

  /** A row that opens the document, as in the tree and in the favorites section. */
  function fileButton(file: { name: string; path: string }): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'file-tree-file';
    btn.textContent = file.name;
    btn.title = file.path;
    btn.dataset.path = file.path;
    buttons.set(file.path, [...(buttons.get(file.path) ?? []), btn]);
    return btn;
  }

  /** The star beside a file row: pressed when the document is a favorite. */
  function starButton(path: string): HTMLButtonElement {
    const favorite = starred!.has(path);
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'file-tree-star';
    star.innerHTML = favorite ? STAR_FILL_ICON : STAR_ICON;
    star.dataset.starPath = path;
    star.setAttribute('aria-pressed', String(favorite));
    star.title = t(favorite ? 'favoriteRemove' : 'favoriteAdd', { name: path });
    star.setAttribute('aria-label', star.title);
    return star;
  }

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
      li.append(fileButton(file));
      if (starred) {
        li.className = 'file-tree-item';
        li.append(starButton(file.path));
      }
      ul.append(li);
    }
    return ul;
  }

  /** Opens or closes a folder together with every folder inside it. */
  function setOpenDeep(details: HTMLDetailsElement, open: boolean): void {
    details.open = open;
    for (const d of details.querySelectorAll('details')) d.open = open;
  }

  /** "Expand all" / "Collapse all" above the tree (#190); only offered when there is a folder to fold. */
  function renderTools(): HTMLDivElement {
    const tools = document.createElement('div');
    tools.className = 'files-tools';
    for (const [open, icon, label] of [
      [true, UNFOLD_ICON, t('expandAllFolders')],
      [false, FOLD_ICON, t('collapseAllFolders')],
    ] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'files-fold-all';
      btn.innerHTML = icon;
      btn.dataset.foldAll = String(open);
      btn.title = label;
      btn.setAttribute('aria-label', label);
      tools.append(btn);
    }
    return tools;
  }

  /** "Favorites (n)", open: the starred documents in the order they were starred, with their stars. */
  function renderFavorites(favorites: string[]): HTMLDetailsElement {
    const details = document.createElement('details');
    details.className = 'files-favorites';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = t('favorites', { count: favorites.length });
    const ul = document.createElement('ul');
    for (const path of favorites) {
      const li = document.createElement('li');
      li.className = 'file-tree-item';
      li.append(fileButton({ name: path.split('/').pop()!, path }), starButton(path));
      ul.append(li);
    }
    details.append(summary, ul);
    return details;
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
    const foldAll = target.closest<HTMLButtonElement>('button[data-fold-all]');
    if (foldAll) {
      for (const d of el.querySelectorAll<HTMLDetailsElement>('.file-tree details')) d.open = foldAll.dataset.foldAll === 'true';
      return;
    }
    // Alt+click on a folder row opens or closes it with all its subfolders (the plain click is the
    // browser's own toggle of the <details>, stopped here so it doesn't flip it back).
    const summary = target.closest<HTMLElement>('.file-tree summary');
    if (summary && e.altKey) {
      e.preventDefault();
      const details = summary.parentElement as HTMLDetailsElement;
      return setOpenDeep(details, !details.open);
    }
    const hide = target.closest<HTMLButtonElement>('button[data-hide-dir]');
    if (hide) return opts.onHide?.(hide.dataset.hideDir!);
    const show = target.closest<HTMLButtonElement>('button[data-unhide-dir]');
    if (show) return opts.onUnhide?.(show.dataset.unhideDir!);
    const star = target.closest<HTMLButtonElement>('button[data-star-path]');
    if (star) return opts.onToggleFavorite?.(star.dataset.starPath!, star.getAttribute('aria-pressed') !== 'true');
    const btn = target.closest<HTMLButtonElement>('button[data-path]');
    if (btn) onOpen(btn.dataset.path!);
  });

  const ROW = '.files-favorites summary, .files-favorites .file-tree-file, .file-tree summary, .file-tree .file-tree-file';
  /** The folder holding a row or a folder's <details>, or null at the top level. */
  const parentFolder = (node: HTMLElement): HTMLDetailsElement | null => {
    const from = node.tagName === 'SUMMARY' ? node.parentElement! : node;
    const d = from.parentElement?.closest('details') ?? null;
    return d && el.contains(d) ? d : null;
  };
  /** Folder and file rows in order, leaving out those inside a closed folder. */
  function visibleRows(): HTMLElement[] {
    return Array.from(el.querySelectorAll<HTMLElement>(ROW)).filter((row) => {
      for (let d = parentFolder(row); d; d = parentFolder(d)) if (!d.open) return false;
      return true;
    });
  }

  // Arrow keys move through the list like a tree view (#123). Enter and Space keep their native
  // meaning: a <summary> opens or closes its folder, a file button opens the document.
  // Alt+Right / Alt+Left on a folder row open / close it with all its subfolders (#190).
  el.addEventListener('keydown', (e) => {
    const row = e.target as HTMLElement;
    if (!row.matches?.(ROW) || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const folder = row.tagName === 'SUMMARY' ? (row.parentElement as HTMLDetailsElement) : null;
    if (e.altKey) {
      if (!folder || !el.querySelector('.file-tree')?.contains(folder) || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      e.preventDefault();
      return setOpenDeep(folder, e.key === 'ArrowRight');
    }
    const rows = visibleRows();
    const i = rows.indexOf(row);
    let next: HTMLElement | null | undefined;
    switch (e.key) {
      case 'ArrowDown':
        next = rows[i + 1];
        break;
      case 'ArrowUp':
        next = rows[i - 1];
        break;
      case 'Home':
        next = rows[0];
        break;
      case 'End':
        next = rows[rows.length - 1];
        break;
      case 'ArrowRight':
        if (!folder) return; // a file: nothing to expand
        if (folder.open) next = rows[i + 1]; // its first entry
        else folder.open = true;
        break;
      case 'ArrowLeft':
        if (folder?.open) folder.open = false;
        else next = parentFolder(row)?.querySelector<HTMLElement>(':scope > summary');
        break;
      default:
        return;
    }
    e.preventDefault(); // no page scroll
    next?.focus();
  });

  function setActive(path: string): void {
    activePath = path;
    const btns = buttons.get(path);
    if (!btns || btns[0] === active[0]) return;
    for (const old of active) {
      old.classList.remove('active');
      old.removeAttribute('aria-current');
    }
    for (const btn of btns) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    }
    active = btns;
    // The tree's row (the last one) is where the document lives: expand down to it and show it.
    const inTree = btns[btns.length - 1];
    for (let d = inTree.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    scrollIntoPanel(inTree, el);
  }

  function reveal(dir: string): void {
    const details = dir ? el.querySelector<HTMLDetailsElement>(`details[data-dir="${CSS.escape(dir)}"]`) : null;
    if (dir && !details) return; // not listed (hidden, or below the depth limit)
    for (let d = details; d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    const row = details?.querySelector<HTMLElement>(':scope > summary') ?? el.querySelector<HTMLElement>('.file-tree summary, .file-tree button');
    if (!row) return;
    scrollIntoPanel(row, el);
    row.focus();
  }

  return {
    render(paths, hidden = [], favorites = null) {
      buttons = new Map();
      active = [];
      hideable = !!opts.onHide && hidden !== null;
      starred = opts.onToggleFavorite && favorites !== null ? new Set(favorites) : null;
      // The folders the user expanded stay expanded across a re-render (e.g. after hiding one).
      const expanded = new Set(Array.from(el.querySelectorAll<HTMLDetailsElement>('.file-tree details[open]'), (d) => d.dataset.dir));
      const known = new Set(paths);
      const listed = starred ? favorites!.filter((p) => known.has(p)) : [];
      // Rendered first, so a starred document's first button is the favorites row, the last the tree's.
      const first = listed.length ? [renderFavorites(listed)] : [];
      const list = renderDir(buildTree(paths), '');
      list.className = 'file-tree';
      for (const d of list.querySelectorAll<HTMLDetailsElement>('details')) if (expanded.has(d.dataset.dir)) d.open = true;
      const tools = list.querySelector('details') ? [renderTools()] : [];
      const extra = hidden?.length && opts.onUnhide ? [renderHidden(hidden)] : [];
      // Keep the resize handle (files-sidebar.ts), which lives in the sidebar too.
      el.replaceChildren(...first, ...tools, list, ...extra, ...el.querySelectorAll(`:scope > .${PANEL_RESIZER_CLASS}`));
      // A re-render (e.g. after hiding a folder) keeps the open document marked.
      if (activePath !== null) setActive(activePath);
    },
    setActive,
    reveal,
  };
}
