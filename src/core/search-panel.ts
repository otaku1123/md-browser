// Full-text search panel: ⌘/Ctrl+Shift+F (never Ctrl+F, the browser's own find) or the toolbar
// button opens a panel floating under the toolbar, with the matches of every document of the
// open folder grouped by file. Shared by the web viewer and file:// tabs; each supplies its
// corpus (search-corpus.ts) and how to open a result. The texts are read once when the panel
// opens; every keystroke then searches them in memory (search.ts).
import { t } from '../i18n';
import { searchDocs, type DocHits, type SearchHit } from './search';
import type { CorpusDoc, SearchCorpus } from './search-corpus';

export type SearchScope = 'folder' | 'file';

export interface SearchPanelOptions {
  /** null until a folder (or a file:// listing) is there to search. */
  corpus(): SearchCorpus | null;
  /** The document shown, for the "this file" scope: searched without reading the folder. */
  current(): CorpusDoc | null;
  /** The listing stopped at a limit, so the search misses some files. */
  truncated(): boolean;
  /** A match was chosen; `query` is the text it was found with (its terms are highlighted). */
  onOpen(path: string, hit: SearchHit, query: string): void;
  /** The panel was closed: the page's highlights go. */
  onClose?(): void;
}

export interface SearchPanel {
  /** `focus` false keeps the focus where it is (reopening after a file:// page load). */
  open(focus?: boolean): void;
  close(): void;
  toggle(): void;
  /** Offered only while there is something to search. Resets the panel: the folder changed. */
  setAvailable(available: boolean): void;
  /** Fills the field, as if typed. */
  setQuery(query: string): void;
}

export const SEARCH_DEBOUNCE_MS = 150;
/** Matches listed per file before "Show n more". */
export const HITS_SHOWN = 10;

/** ⌘/Ctrl+Shift+F. */
export function matchesSearchKey(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f';
}

// Octicons search.
const SEARCH_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>';

let uid = 0;

/** Text with the matched ranges in <mark>; built from nodes, never HTML. */
function marked(text: string, ranges: readonly [number, number][]): Node[] {
  const nodes: Node[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) nodes.push(document.createTextNode(text.slice(at, s)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(s, e);
    nodes.push(mark);
    at = e;
  }
  if (at < text.length) nodes.push(document.createTextNode(text.slice(at)));
  return nodes;
}

/** Adds the toolbar button (before the settings gear) and the panel (in <body>, floating). */
export function mountSearchPanel(toolbar: HTMLElement, opts: SearchPanelOptions): SearchPanel {
  const id = `md-search-${++uid}`;
  let available = false;
  let returnFocus: HTMLElement | null = null;
  let loading: AbortController | null = null;
  let loaded = false;
  let gen = 0;
  let timer: number | undefined;
  let scope: SearchScope = 'folder';
  /** The matches in the order listed, across files: what Next / Previous step through. */
  let flat: { path: string; hit: SearchHit }[] = [];
  let cursor = -1;
  let statusBase = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button search-toggle';
  button.innerHTML = SEARCH_ICON;
  button.title = t('searchFolder');
  button.setAttribute('aria-label', t('searchFolder'));
  button.setAttribute('aria-controls', id);
  button.setAttribute('aria-expanded', 'false');
  button.hidden = true;
  const gear = toolbar.querySelector('.font-settings');
  if (gear) gear.before(button);
  else toolbar.append(button);

  const panel = document.createElement('section');
  panel.className = 'search-panel';
  panel.id = id;
  panel.setAttribute('role', 'search');
  panel.setAttribute('aria-label', t('searchFolder'));
  panel.hidden = true;

  const head = document.createElement('div');
  head.className = 'search-panel-head';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-panel-input';
  input.placeholder = t('searchPlaceholder');
  input.setAttribute('aria-label', t('searchFolder'));
  input.autocomplete = 'off';
  input.spellcheck = false;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'search-panel-close';
  close.textContent = '×';
  close.title = t('searchClose');
  close.setAttribute('aria-label', t('searchClose'));
  head.append(input, close);

  // Scope (folder / this file) and Next / Previous.
  const tools = document.createElement('div');
  tools.className = 'search-panel-tools';
  const scopeGroup = document.createElement('div');
  scopeGroup.className = 'search-scope';
  scopeGroup.setAttribute('role', 'group');
  scopeGroup.setAttribute('aria-label', t('searchScope'));
  const scopeButtons = new Map<SearchScope, HTMLButtonElement>();
  for (const [value, label] of [
    ['folder', t('searchScopeFolder')],
    ['file', t('searchScopeFile')],
  ] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(value === scope));
    b.addEventListener('click', () => setScope(value));
    scopeButtons.set(value, b);
    scopeGroup.append(b);
  }
  const stepButton = (label: string, glyph: string, delta: 1 | -1) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'search-step';
    b.textContent = glyph;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => step(delta));
    return b;
  };
  tools.append(scopeGroup, stepButton(t('searchPrev'), '↑', -1), stepButton(t('searchNext'), '↓', 1));

  const status = document.createElement('p');
  status.className = 'search-panel-status';
  status.setAttribute('role', 'status');
  const note = document.createElement('p');
  note.className = 'search-panel-note';
  note.hidden = true;
  const results = document.createElement('div');
  results.className = 'search-panel-results';
  panel.append(head, tools, status, note, results);
  document.body.append(panel);

  function clearResults(): void {
    results.replaceChildren();
    status.textContent = '';
    statusBase = '';
    note.hidden = true;
    flat = [];
    cursor = -1;
  }

  function showStatus(): void {
    status.textContent = cursor < 0 ? statusBase : `${statusBase} · ${t('searchPosition', { n: cursor + 1, total: flat.length })}`;
  }

  /** Makes match `i` the current one: marked in the list, and opened on the page. */
  function select(i: number): void {
    cursor = i;
    const { path, hit } = flat[i];
    for (const el of results.querySelectorAll('.search-hit[aria-current]')) el.removeAttribute('aria-current');
    const row = results.querySelector<HTMLElement>(`.search-hit[data-path="${CSS.escape(path)}"][data-line="${hit.line}"]`);
    row?.setAttribute('aria-current', 'true');
    row?.scrollIntoView?.({ block: 'nearest' });
    showStatus();
    opts.onOpen(path, hit, input.value);
  }

  /** Next (1) or previous (-1) match, around the ends; from none, the first or the last. */
  function step(delta: 1 | -1): void {
    const n = flat.length;
    if (!n) return;
    select(cursor < 0 ? (delta > 0 ? 0 : n - 1) : (cursor + delta + n) % n);
  }

  function setScope(next: SearchScope): void {
    if (next === scope) return;
    scope = next;
    for (const [value, b] of scopeButtons) b.setAttribute('aria-pressed', String(value === scope));
    // The folder is read the first time it is searched; the shown file needs no reading.
    if (scope === 'folder' && !loaded && !loading) load();
    else runSearch();
  }

  function hitButton(doc: DocHits, hit: SearchHit): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-hit';
    btn.dataset.path = doc.path;
    btn.dataset.line = String(hit.line);
    const meta = document.createElement('span');
    meta.className = 'search-hit-meta';
    const line = document.createElement('span');
    line.className = 'search-hit-line';
    line.textContent = String(hit.line);
    meta.append(line);
    if (hit.heading) {
      const heading = document.createElement('span');
      heading.className = 'search-hit-heading';
      heading.textContent = hit.heading;
      meta.append(heading);
    }
    if (hit.inCode) {
      const code = document.createElement('span');
      code.className = 'search-hit-code';
      code.textContent = t('searchInCode');
      meta.append(code);
    }
    const text = document.createElement('span');
    text.className = 'search-hit-text';
    text.append(...marked(hit.excerpt, hit.ranges));
    btn.append(meta, text);
    btn.addEventListener('click', () => select(flat.findIndex((f) => f.path === doc.path && f.hit === hit)));
    return btn;
  }

  function fileSection(doc: DocHits): HTMLElement {
    const section = document.createElement('section');
    section.className = 'search-file';
    section.setAttribute('aria-label', doc.path);
    // Not a heading element: the document's own headings set the outline, and this would skip a level.
    const heading = document.createElement('div');
    heading.className = 'search-file-path';
    const path = document.createElement('span');
    path.textContent = doc.path;
    const count = document.createElement('span');
    count.className = 'search-file-count';
    count.textContent = String(doc.total);
    heading.append(path, count);
    const list = document.createElement('ul');
    list.className = 'search-hits';
    const add = (hits: SearchHit[]) => {
      for (const hit of hits) {
        const li = document.createElement('li');
        li.append(hitButton(doc, hit));
        list.append(li);
      }
    };
    add(doc.hits.slice(0, HITS_SHOWN));
    section.append(heading, list);
    const rest = doc.hits.slice(HITS_SHOWN);
    if (rest.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'search-more';
      more.textContent = t('searchMore', { count: rest.length });
      more.addEventListener('click', () => {
        add(rest);
        more.remove();
        list.querySelector<HTMLElement>(`li:nth-child(${HITS_SHOWN + 1}) button`)?.focus();
      });
      section.append(more);
    }
    return section;
  }

  function runSearch(): void {
    const query = input.value;
    if (!query.trim()) {
      clearResults();
      return;
    }
    let docs: CorpusDoc[];
    if (scope === 'file') {
      const current = opts.current();
      docs = current ? [current] : [];
    } else {
      const corpus = opts.corpus();
      if (!corpus || !loaded) return; // still reading: the status says so
      docs = corpus.docs();
    }
    const result = searchDocs(docs, query);
    flat = result.docs.flatMap((d) => d.hits.map((hit) => ({ path: d.path, hit })));
    cursor = -1;
    const hits = result.docs.reduce((n, d) => n + d.total, 0);
    statusBase = result.docs.length ? t('searchCount', { hits, files: result.docs.length }) : t('searchNone');
    showStatus();
    const notes = [
      scope === 'folder' && opts.truncated() ? t('searchTruncated') : '',
      result.skipped.length ? t('searchSkipped', { count: result.skipped.length }) : '',
    ].filter(Boolean);
    note.textContent = notes.join(' ');
    note.hidden = notes.length === 0;
    results.replaceChildren(...result.docs.map(fileSection));
  }

  /** Reads the folder's texts (only what changed since last time), then searches. */
  function load(): void {
    loading?.abort();
    const corpus = opts.corpus();
    if (!corpus) return;
    const controller = (loading = new AbortController());
    const mine = ++gen;
    loaded = false;
    void corpus
      .load({
        signal: controller.signal,
        onProgress: (done, total) => {
          if (mine === gen) status.textContent = t('searchReading', { done, total });
        },
      })
      .catch(() => undefined) // aborted, or the folder is unreadable now: search what was read
      .then(() => {
        if (mine !== gen) return;
        loading = null;
        loaded = true;
        runSearch();
      });
  }

  function open(focus = true): void {
    if (!available || !panel.hidden) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    if (focus) {
      input.focus();
      input.select();
    }
    if (scope === 'folder') load();
    else runSearch();
  }

  function closePanel(): void {
    if (panel.hidden) return;
    loading?.abort();
    loading = null;
    gen++;
    window.clearTimeout(timer);
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    const back = returnFocus && returnFocus.isConnected && !panel.contains(returnFocus) ? returnFocus : button;
    returnFocus = null;
    if (panel.contains(document.activeElement) && !back.hidden) back.focus();
    opts.onClose?.();
  }

  const toggle = () => (panel.hidden ? open() : closePanel());

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  });
  button.addEventListener('click', toggle);
  close.addEventListener('click', closePanel);

  const rows = () => Array.from(results.querySelectorAll<HTMLElement>('.search-hit, .search-more'));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      return;
    }
    // Enter / Shift+Enter in the field: next / previous match, as in the browser's find bar.
    if (e.key === 'Enter' && e.target === input && !e.isComposing) {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = rows();
    const target = e.target as HTMLElement;
    let next: HTMLElement | undefined;
    if (target === input) next = e.key === 'ArrowDown' ? list[0] : undefined;
    else {
      const i = list.indexOf(target);
      if (i === -1) return;
      next = e.key === 'ArrowDown' ? list[i + 1] : (list[i - 1] ?? input);
    }
    if (!next) return;
    e.preventDefault();
    next.focus();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (!available || !matchesSearchKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    true,
  );

  return {
    open,
    close: closePanel,
    toggle,
    setQuery(query) {
      input.value = query;
      runSearch();
    },
    setAvailable(next) {
      available = next;
      button.hidden = !next;
      loaded = false;
      clearResults();
      if (!next) closePanel();
      else if (!panel.hidden) scope === 'folder' ? load() : runSearch();
    },
  };
}
