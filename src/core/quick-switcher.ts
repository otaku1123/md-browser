// Quick file switcher: a shortcut (⌘/Ctrl+P by default: quick-open-key.ts) opens a palette that
// fuzzy-finds a document of the open folder by its path, like VS Code's "Go to File".
// Shared by the web viewer and file:// tabs; each supplies its file list and how to open a path.
import { t } from '../i18n';
import { matchesQuickOpenKey, QUICK_OPEN_KEY_DEFAULT, quickOpenKeyStore, type QuickOpenKey } from './quick-open-key';

export interface FuzzyMatch {
  path: string;
  score: number;
  /** Indices in `path` of the matched characters, ascending. */
  positions: number[];
}

const MAX_RESULTS = 50;
// Tried as the first matched character, so "arch" can start at "architecture" rather than at the
// first "a" in "docs/android/…". Enough for real paths; keeps the worst case small.
const MAX_STARTS = 8;

const isBoundary = (path: string, i: number) =>
  i === 0 || '/\\-_. '.includes(path[i - 1]) || (/[a-z]/.test(path[i - 1]) && /[A-Z]/.test(path[i]));

/** Scores one in-order match of `needle` in `hay` (both lower case) starting at `start`, or null. */
function matchFrom(needle: string, hay: string, path: string, start: number, nameStart: number): FuzzyMatch | null {
  const positions: number[] = [];
  let score = 0;
  let at = start;
  for (const ch of needle) {
    const i = hay.indexOf(ch, at);
    if (i === -1) return null;
    const prev = positions[positions.length - 1];
    score += 1;
    if (prev !== undefined && i === prev + 1) score += 5; // consecutive
    if (isBoundary(path, i)) score += 4;
    if (i >= nameStart) score += 2; // in the file name, not the folders
    positions.push(i);
    at = i + 1;
  }
  return { path, score, positions };
}

/**
 * Case-insensitive fuzzy match: every character of the query (spaces ignored) appears in the path
 * in order. Higher scores for consecutive runs, word starts and the file name; shorter paths win ties.
 */
export function fuzzyMatch(query: string, path: string): FuzzyMatch | null {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return { path, score: 0, positions: [] };
  // Lower-cased one character at a time, so indices stay those of `path` (see source-line.ts).
  let hay = '';
  for (const ch of path) {
    const lower = ch.toLowerCase();
    hay += lower.length === ch.length ? lower : ch;
  }
  const nameStart = path.lastIndexOf('/') + 1;
  let best: FuzzyMatch | null = null;
  for (let i = hay.indexOf(needle[0]), n = 0; i !== -1 && n < MAX_STARTS; i = hay.indexOf(needle[0], i + 1), n++) {
    const m = matchFrom(needle, hay, path, i, nameStart);
    if (!m) break; // a later start can't match more
    if (!best || m.score > best.score) best = m;
  }
  if (best) best.score -= path.length / 100;
  return best;
}

/**
 * The switcher's list. Empty query: documents opened recently (except the current one, so Enter
 * goes back to the previous document), then the rest by path. Otherwise the best matches first,
 * ties broken by recency, then path.
 */
export function rankPaths(query: string, paths: readonly string[], recent: readonly string[] = [], current: string | null = null): FuzzyMatch[] {
  const rank = new Map<string, number>();
  for (const p of recent) if (p !== current && !rank.has(p)) rank.set(p, rank.size);
  const recency = (p: string) => rank.get(p) ?? Infinity;

  if (!query.trim()) {
    const known = new Set(paths);
    const first = [...rank.keys()].filter((p) => known.has(p));
    const rest = paths.filter((p) => !rank.has(p)).sort((a, b) => a.localeCompare(b));
    return [...first, ...rest].slice(0, MAX_RESULTS).map((path) => ({ path, score: 0, positions: [] }));
  }
  const matches: FuzzyMatch[] = [];
  for (const p of paths) {
    const m = fuzzyMatch(query, p);
    if (m) matches.push(m);
  }
  matches.sort((a, b) => b.score - a.score || recency(a.path) - recency(b.path) || a.path.localeCompare(b.path));
  return matches.slice(0, MAX_RESULTS);
}

export interface QuickSwitcherOptions {
  /** Root-relative paths of the folder's documents (the sidebar's list). */
  paths(): readonly string[];
  current(): string | null;
  recent(): readonly string[];
  onOpen(path: string): void;
}

export interface QuickSwitcher {
  open(): void;
  close(): void;
}

let uid = 0;

/** Text with the matched characters in <mark>; built from nodes, never HTML. */
function highlighted(text: string, offset: number, positions: readonly number[]): Node[] {
  const nodes: Node[] = [];
  let plain = '';
  const flush = () => {
    if (plain) nodes.push(document.createTextNode(plain));
    plain = '';
  };
  const hit = new Set(positions);
  for (let i = 0; i < text.length; i++) {
    if (hit.has(offset + i)) {
      flush();
      const mark = document.createElement('mark');
      mark.textContent = text[i];
      nodes.push(mark);
    } else plain += text[i];
  }
  flush();
  return nodes;
}

/**
 * Listens for the shortcut on this page. It is left to the browser (e.g. print for ⌘/Ctrl+P) when
 * the folder has fewer than two documents, so a single open file still prints as before.
 */
export function mountQuickSwitcher(opts: QuickSwitcherOptions): QuickSwitcher {
  const id = `md-quick-${++uid}`;
  let shortcut: QuickOpenKey = QUICK_OPEN_KEY_DEFAULT;
  const keyStore = quickOpenKeyStore();
  void keyStore.load().then((k) => (shortcut = k));
  keyStore.onChange((k) => (shortcut = k));

  let backdrop: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;

  function close(): void {
    if (!backdrop) return;
    backdrop.remove();
    backdrop = null;
    returnFocus?.focus();
    returnFocus = null;
  }

  function open(): void {
    if (backdrop) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    backdrop = document.createElement('div');
    backdrop.className = 'quick-switcher';
    const dialog = document.createElement('div');
    dialog.className = 'quick-switcher-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', t('quickOpen'));

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-switcher-input';
    input.placeholder = t('quickOpenPlaceholder');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', t('quickOpen'));
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', `${id}-list`);

    const list = document.createElement('ul');
    list.className = 'quick-switcher-list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', t('files'));

    const empty = document.createElement('p');
    empty.className = 'quick-switcher-empty';
    empty.textContent = t('quickOpenEmpty');
    empty.hidden = true;

    dialog.append(input, list, empty);
    backdrop.append(dialog);

    let results: FuzzyMatch[] = [];
    let active = 0;

    function setActive(i: number): void {
      const items = list.children;
      items[active]?.setAttribute('aria-selected', 'false');
      active = i;
      const el = items[active] as HTMLElement | undefined;
      if (!el) {
        input.removeAttribute('aria-activedescendant');
        return;
      }
      el.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView?.({ block: 'nearest' });
    }

    function update(): void {
      results = rankPaths(input.value, opts.paths(), opts.recent(), opts.current());
      const current = opts.current();
      list.replaceChildren(
        ...results.map((m, i) => {
          const li = document.createElement('li');
          li.id = `${id}-opt-${i}`;
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', 'false');
          li.dataset.path = m.path;
          const slash = m.path.lastIndexOf('/') + 1;
          const name = document.createElement('span');
          name.className = 'quick-switcher-name';
          name.append(...highlighted(m.path.slice(slash), slash, m.positions));
          li.append(name);
          if (slash) {
            const dir = document.createElement('span');
            dir.className = 'quick-switcher-dir';
            dir.append(...highlighted(m.path.slice(0, slash - 1), 0, m.positions));
            li.append(dir);
          }
          if (m.path === current) li.classList.add('current');
          return li;
        }),
      );
      empty.hidden = results.length > 0;
      active = 0;
      setActive(0);
    }

    function choose(i: number): void {
      const path = results[i]?.path;
      if (path === undefined) return;
      close();
      if (path !== opts.current()) opts.onOpen(path);
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      const n = results.length;
      if (e.key === 'ArrowDown' && n) setActive((active + 1) % n);
      else if (e.key === 'ArrowUp' && n) setActive((active - 1 + n) % n);
      else if (e.key === 'Enter' && !e.isComposing) choose(active);
      else if (e.key === 'Escape') close();
      // Focus stays in the field: the list is navigated with the arrow keys.
      else if (e.key !== 'Tab') return;
      e.preventDefault();
    });
    // mousedown, not click: keeps focus in the field, and a click that starts outside doesn't close it late.
    list.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[role="option"]');
      e.preventDefault();
      if (li) choose(Array.prototype.indexOf.call(list.children, li));
    });
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close();
    });

    document.body.append(backdrop);
    update();
    input.focus();
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (!matchesQuickOpenKey(e, shortcut)) return;
      if (!backdrop && opts.paths().length < 2) return;
      e.preventDefault();
      e.stopPropagation();
      if (backdrop) close();
      else open();
    },
    true,
  );

  return { open, close };
}
