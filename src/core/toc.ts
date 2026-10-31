import type { TocItem } from './render';
import { scrollIntoPanel } from './scroll-into-panel';
import { t } from '../i18n';

export interface TocController {
  render(items: TocItem[]): void;
  /** Re-evaluates which entry is active from the scroll position. */
  update(): void;
  /** Forgets the clicked entry (call when switching documents). */
  reset(): void;
  /** Names the shown document: its folded entries are kept per document (this tab only, see FOLD_KEY). */
  setDoc(key: string): void;
}

// Folded headings per document, in sessionStorage: they survive the page loads a file:// tab does
// for every document and the viewer's document switches, and go away with the tab. Never synced.
const FOLD_KEY = 'md-browser:toc-folded';
const MAX_DOCS = 20;

type FoldMap = Record<string, string[]>;

function readFoldMap(): FoldMap {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(FOLD_KEY) ?? 'null');
    const map: FoldMap = Object.create(null);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.assign(map, raw) : map;
  } catch {
    return Object.create(null);
  }
}

/** Heading ids folded in the document `key`. */
export function loadFolded(key: string): Set<string> {
  const list = readFoldMap()[key];
  return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
}

/** Remembers `folded` for `key`; the most recently used documents are kept. */
export function saveFolded(key: string, folded: Set<string>): void {
  const map = readFoldMap();
  delete map[key]; // re-inserted last, so object order is oldest first
  if (folded.size) map[key] = [...folded];
  const keys = Object.keys(map);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_DOCS))) delete map[old];
  try {
    sessionStorage.setItem(FOLD_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable: the fold state lasts until the next document.
  }
}

const CHEVRON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M6 3.5 10.5 8 6 12.5z"/></svg>';

let uid = 0;

/**
 * Sidebar TOC: renders the headings as a tree, scrolls on click, highlights the current section and
 * lets sections with sub-headings fold (chevron, or ← / → on a focused entry). Folds are kept across
 * re-renders (auto-reload) and, per document, in sessionStorage. The current section is never
 * unfolded automatically: inside a folded section, the section's own entry is the active one.
 */
export function createToc(tocEl: HTMLElement): TocController {
  // Entry the user clicked; wins over scroll position until they scroll manually (needed near page end).
  let pinnedTarget: string | null = null;
  let docKey = '';
  let folded = new Set<string>();
  const id = `md-toc-tree-${++uid}`;

  function render(items: TocItem[]): void {
    // Only the list: the resize handle (toc-panel.ts) lives in the TOC too.
    tocEl.querySelector(':scope > ul')?.remove();
    if (items.length === 0) {
      tocEl.classList.add('empty');
      return;
    }
    tocEl.classList.remove('empty');
    const minLevel = Math.min(...items.map((i) => i.level));
    const list = document.createElement('ul');
    // Each entry nests under the nearest previous entry with a smaller level (a jump from h1 to h3 still nests).
    const stack: { level: number; li: HTMLElement | null }[] = [{ level: minLevel - 1, li: null }];
    let n = 0;
    for (const item of items) {
      while (stack.length > 1 && stack[stack.length - 1].level >= item.level) stack.pop();
      const parent = stack[stack.length - 1].li;
      const li = document.createElement('li');
      li.className = `toc-l${item.level - minLevel + 1}`;
      const a = document.createElement('a');
      a.href = `#${item.id}`;
      a.dataset.target = item.id;
      a.textContent = item.text;
      li.append(a);
      if (parent) {
        let sub = parent.querySelector<HTMLElement>(':scope > ul');
        if (!sub) {
          sub = document.createElement('ul');
          sub.id = `${id}-${++n}`;
          parent.append(sub);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'toc-fold';
          button.innerHTML = CHEVRON;
          button.setAttribute('aria-controls', sub.id);
          parent.prepend(button);
          setFolded(parent, folded.has(parent.querySelector<HTMLAnchorElement>(':scope > a')!.dataset.target!));
        }
        sub.append(li);
      } else list.append(li);
      stack.push({ level: item.level, li });
    }
    tocEl.prepend(list);
  }

  function setFolded(li: HTMLElement, fold: boolean): void {
    li.classList.toggle('toc-folded', fold);
    const button = li.querySelector<HTMLButtonElement>(':scope > .toc-fold');
    if (!button) return;
    button.setAttribute('aria-expanded', String(!fold));
    button.setAttribute('aria-label', t(fold ? 'tocExpand' : 'tocFold'));
  }

  function toggle(li: HTMLElement, fold: boolean): void {
    const target = li.querySelector<HTMLAnchorElement>(':scope > a')!.dataset.target!;
    if (fold) folded.add(target);
    else folded.delete(target);
    setFolded(li, fold);
    saveFolded(docKey, folded);
    update();
  }

  /** The entry to highlight for `link`: itself, or the outermost folded section hiding it. */
  function shownEntry(link: HTMLAnchorElement): HTMLAnchorElement {
    let shown = link;
    for (let el = link.parentElement; el && el !== tocEl; el = el.parentElement) {
      if (el.classList.contains('toc-folded')) shown = el.querySelector<HTMLAnchorElement>(':scope > a')!;
    }
    return shown;
  }

  function update(): void {
    const links = Array.from(tocEl.querySelectorAll<HTMLAnchorElement>('a[data-target]'));
    let active = pinnedTarget ? links.find((l) => l.dataset.target === pinnedTarget) : undefined;
    if (!active) for (const link of links) {
      const h = document.getElementById(link.dataset.target!);
      if (h && h.getBoundingClientRect().top <= 80) active = link;
    }
    active ??= links[0];
    const shown = active && shownEntry(active);
    for (const link of links) link.classList.toggle('active', link === shown);
    if (shown) scrollIntoPanel(shown, tocEl);
  }

  tocEl.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.toc-fold');
    if (button) {
      const li = button.parentElement!;
      toggle(li, !li.classList.contains('toc-folded'));
      return;
    }
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-target]');
    if (!a) return;
    e.preventDefault();
    pinnedTarget = a.dataset.target!;
    document.getElementById(a.dataset.target!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${a.dataset.target}`);
  });

  // ← folds the entry (or moves to its section), → unfolds it (or moves into it).
  tocEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-target]');
    if (!a) return;
    const li = a.parentElement!;
    const hasSub = li.querySelector(':scope > ul') !== null;
    const isFolded = li.classList.contains('toc-folded');
    e.preventDefault();
    if (e.key === 'ArrowLeft') {
      if (hasSub && !isFolded) toggle(li, true);
      else li.parentElement?.closest('li')?.querySelector<HTMLAnchorElement>(':scope > a')?.focus();
    } else if (hasSub && isFolded) toggle(li, false);
    else if (hasSub) li.querySelector<HTMLAnchorElement>(':scope > ul > li > a')?.focus();
  });

  let scrollRaf = 0;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(update);
  });

  for (const type of ['wheel', 'touchmove', 'keydown', 'mousedown'] as const) {
    window.addEventListener(type, (e) => {
      if (type === 'mousedown' && tocEl.contains(e.target as Node)) return;
      pinnedTarget = null;
    }, { passive: true });
  }

  return {
    render,
    update,
    reset: () => (pinnedTarget = null),
    setDoc: (key) => {
      docKey = key;
      folded = loadFolded(key);
    },
  };
}
