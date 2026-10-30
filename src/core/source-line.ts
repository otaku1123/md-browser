// Finds the rendered block for a Markdown source line (render.ts writes data-line on each block),
// and highlights text with the CSS Custom Highlight API. Highlights are ranges, not wrapper
// elements, so they never touch the rendered DOM that diagrams, math and live reload rewrite.
import { LINE_ATTR } from './render';
import { foldText } from './search';

export const SEARCH_HIGHLIGHT = 'md-browser-search';
export const SEARCH_HIGHLIGHT_CURRENT = 'md-browser-search-current';

/**
 * The innermost block covering `line` (1-based): the last element in document order that starts
 * at or before it. Blocks start in source order, and a parent precedes its children, so this is
 * the deepest one. Null when the line is before the first block.
 */
export function elementForLine(root: ParentNode, line: number): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>(`[${LINE_ATTR}]`)) {
    const start = Number(el.getAttribute(LINE_ATTR));
    if (start > line) break;
    found = el;
  }
  return found;
}

/** Scrolls the block for `line` to the top (below the toolbar: html's scroll-padding-top). */
export function scrollToLine(root: ParentNode, line: number, behavior: ScrollBehavior = 'auto'): HTMLElement | null {
  const el = elementForLine(root, line);
  el?.scrollIntoView({ behavior, block: 'start' });
  return el;
}

// Text the reader doesn't see as text: diagram sources (replaced by the drawing), SVG labels,
// KaTeX's MathML copy (the visible part is the HTML one).
const SKIP = 'script, style, svg, .diagram-source, .katex-mathml';

/**
 * Ranges of every occurrence of `query` in `root`'s visible text, in document order, folded as
 * the search engine folds (search.ts: NFKC and lower case, so "ＢＬＥ" and "ﾊﾟ" match "ble" and
 * "パ"). A match may span inline elements ("**BLE** reconnect") but not two blocks.
 */
export function findTextRanges(root: Node, query: string): Range[] {
  const needle = foldText(query).folded;
  if (!needle) return [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  let block: Element | null | undefined;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    // A line break between blocks keeps "foo</p><p>bar" from matching "foobar".
    const b = n.parentElement?.closest(`[${LINE_ATTR}]`) ?? null;
    if (block !== undefined && b !== block) text += '\n';
    block = b;
    nodes.push(n as Text);
    starts.push(text.length);
    text += (n as Text).data;
  }
  // `map` turns an offset in the folded text back into one in `text`.
  const { folded: hay, map } = foldText(text);

  // Text node holding offset `pos`, and the offset inside it; an end offset sits in the node it ends.
  let k = 0;
  const locate = (pos: number, end: boolean): [Text, number] => {
    while (k + 1 < nodes.length && (end ? starts[k + 1] < pos : starts[k + 1] <= pos)) k++;
    return [nodes[k], pos - starts[k]];
  };

  const ranges: Range[] = [];
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
    const range = doc.createRange();
    range.setStart(...locate(map[i], false));
    range.setEnd(...locate(map[i + needle.length], true));
    ranges.push(range);
  }
  return ranges;
}

const highlights = (): HighlightRegistry | undefined => (typeof CSS !== 'undefined' ? CSS.highlights : undefined);

/** Shows `ranges` as highlight `name` (styled with ::highlight(name)), replacing what it showed. */
export function setHighlight(name: string, ranges: Range[]): void {
  const registry = highlights();
  if (!registry) return;
  if (!ranges.length) {
    registry.delete(name);
    return;
  }
  const highlight = new Highlight(...ranges);
  // The current match is also one of all matches: it must be drawn on top.
  if (name === SEARCH_HIGHLIGHT_CURRENT) highlight.priority = 1;
  registry.set(name, highlight);
}

export function clearHighlight(name: string): void {
  highlights()?.delete(name);
}
