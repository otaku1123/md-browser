// Going to a search hit (search-panel.ts): the block of its source line is scrolled into view and
// the query's matches are highlighted on the page (source-line.ts), those on that line as the
// current match. A file:// tab carries the jump across the page load in the URL hash
// (#mdb-line=…&mdb-q=…), which the content script reads once and removes; `#:~:text=` would not
// survive the content script's re-rendering.
import {
  clearHighlight,
  elementForLine,
  findTextRanges,
  scrollToLine,
  SEARCH_HIGHLIGHT,
  SEARCH_HIGHLIGHT_CURRENT,
  setHighlight,
} from './source-line';

export interface SearchJump {
  /** 1-based source line. */
  line: number;
  /** The query as typed, so the panel can show the same results again. */
  query: string;
}

const LINE_PARAM = 'mdb-line';
const QUERY_PARAM = 'mdb-q';

export function jumpHash(line: number, query: string): string {
  return `#${new URLSearchParams({ [LINE_PARAM]: String(line), [QUERY_PARAM]: query })}`;
}

/** The jump a URL hash asks for, or null for any other hash (a heading anchor, nothing). */
export function parseJumpHash(hash: string): SearchJump | null {
  if (!hash.startsWith(`#${LINE_PARAM}=`)) return null;
  const params = new URLSearchParams(hash.slice(1));
  const line = Number(params.get(LINE_PARAM));
  if (!Number.isInteger(line) || line < 1) return null;
  return { line, query: params.get(QUERY_PARAM) ?? '' };
}

/**
 * Highlights every match of `terms` in `root`; the matches inside the block of `line` are the
 * current ones. No terms: clears both. Called again after every re-render, as highlights are
 * ranges of the old nodes.
 */
export function highlightSearch(root: HTMLElement, terms: readonly string[], line?: number): void {
  const all = terms.flatMap((term) => findTextRanges(root, term));
  setHighlight(SEARCH_HIGHLIGHT, all);
  const block = line === undefined ? null : elementForLine(root, line);
  setHighlight(SEARCH_HIGHLIGHT_CURRENT, block ? all.filter((r) => r.intersectsNode(block)) : []);
}

export function clearSearchHighlight(): void {
  clearHighlight(SEARCH_HIGHLIGHT);
  clearHighlight(SEARCH_HIGHLIGHT_CURRENT);
}

/** Scrolls the block of `line` into view and highlights `terms`, the ones on that line as current. */
export function jumpToLine(root: HTMLElement, line: number, terms: readonly string[]): void {
  scrollToLine(root, line);
  highlightSearch(root, terms, line);
}
