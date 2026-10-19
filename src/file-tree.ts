export interface FileTreeController {
  /** Renders workspace-relative paths (e.g. "docs/guide.md") as a collapsible folder tree. */
  render(paths: string[]): void;
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

/** Sidebar file list: folders first, then files, each sorted by name. */
export function createFileTree(el: HTMLElement, onOpen: (path: string) => void): FileTreeController {
  let buttons = new Map<string, HTMLButtonElement>();
  let active: HTMLButtonElement | null = null;

  function renderDir(node: DirNode): HTMLUListElement {
    const ul = document.createElement('ul');
    for (const name of [...node.dirs.keys()].sort(byName)) {
      const li = document.createElement('li');
      const details = document.createElement('details');
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = name;
      details.append(summary, renderDir(node.dirs.get(name)!));
      li.append(details);
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

  el.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-path]');
    if (btn) onOpen(btn.dataset.path!);
  });

  return {
    render(paths) {
      buttons = new Map();
      active = null;
      const list = renderDir(buildTree(paths));
      list.className = 'file-tree';
      el.replaceChildren(list);
    },
    setActive(path) {
      const btn = buttons.get(path);
      if (!btn || btn === active) return;
      active?.classList.remove('active');
      active?.removeAttribute('aria-current');
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
      active = btn;
      for (let d = btn.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
      btn.scrollIntoView?.({ block: 'nearest' });
    },
  };
}
