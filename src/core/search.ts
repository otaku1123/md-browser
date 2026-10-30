// Full-text search over the documents of the open folder (search-corpus.ts): a substring scan of
// each text, with no index. Japanese has no word breaks for a tokenizer, and reading a folder is
// fast enough (#127), so the texts are folded (NFKC, lower case) and scanned on every search.
// Pure functions, so the panel's behaviour is unit-tested here.
import type { CorpusDoc } from './search-corpus';

/** Documents longer than this are not searched: folding and scanning them would stall the page. */
export const MAX_DOC_CHARS = 2_000_000;
/** Hits kept per document; `total` still counts them all. */
export const MAX_HITS_PER_DOC = 200;
/** Characters of a line shown around the first match. */
const EXCERPT_CHARS = 200;
const EXCERPT_BEFORE = 60;

export interface SearchHit {
  /** 1-based source line (front matter counted, as data-line does). */
  line: number;
  /** The nearest ATX heading above the line, outside code fences; null before the first one. */
  heading: string | null;
  /** The line is inside a fenced code block. */
  inCode: boolean;
  /** The line, cut around the first match when long ("…" marks a cut). */
  excerpt: string;
  /** [start, end) of the matches in `excerpt`, merged, ascending. */
  ranges: [number, number][];
}

export interface DocHits {
  path: string;
  hits: SearchHit[];
  /** Every match's line, including those beyond MAX_HITS_PER_DOC. */
  total: number;
}

export interface SearchResult {
  /** Documents holding every term, most hits first. */
  docs: DocHits[];
  /** Documents left out for their size. */
  skipped: string[];
}

/** Lower-case NFKC terms of a query, split at (full-width too) spaces, without duplicates. */
export function parseQuery(raw: string): string[] {
  return [...new Set(raw.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean))];
}

const foldMemo = new Map<string, string>();

/** Folds one character the way parseQuery folds the query. Memoized: a text has few distinct ones. */
function foldChar(ch: string): string {
  let f = foldMemo.get(ch);
  if (f === undefined) {
    f = ch.normalize('NFKC').toLowerCase();
    foldMemo.set(ch, f);
  }
  return f;
}

const COMBINING = /^[̀-゙゚ͯ]/;

export interface FoldedText {
  folded: string;
  /** Original offset where folded character i starts; map[folded.length] is text.length. */
  map: number[];
}

/**
 * The text folded character by character, with the original offset of each folded character, so
 * a match in `folded` becomes a range of `text`. A character that folds to a combining mark (a
 * half-width voiced sound mark, "ﾊﾟ") is composed onto the previous one, so it matches "パ".
 */
export function foldText(text: string): FoldedText {
  let folded = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    let f: string;
    if (code < 128) f = code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch;
    else {
      f = foldChar(ch);
      if (COMBINING.test(f) && folded) {
        const prev = folded[folded.length - 1];
        const composed = (prev + f).normalize('NFC');
        if (composed.length === 1) {
          folded = folded.slice(0, -1) + composed;
          i += ch.length;
          continue;
        }
      }
    }
    folded += f;
    for (let k = 0; k < f.length; k++) map.push(i);
    i += ch.length;
  }
  map.push(text.length);
  return { folded, map };
}

/** The offset of the first character of each line. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/** Index of the line holding `offset` (binary search over the starts). */
function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/;

interface LineContext {
  heading: string | null;
  inCode: boolean;
}

/**
 * For each line: the heading it belongs to and whether it is in a fenced code block. A "#" line
 * inside a fence, or in the front matter, is not a heading. Setext headings are not recognised.
 */
export function lineContexts(lines: readonly string[]): LineContext[] {
  const out: LineContext[] = [];
  let heading: string | null = null;
  let fence: string | null = null;
  let frontMatter = lines[0]?.trimEnd() === '---';
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].replace(/\r$/, '');
    if (frontMatter) {
      out.push({ heading, inCode: false });
      if (n > 0 && /^---\s*$/.test(line)) frontMatter = false;
      continue;
    }
    if (fence) {
      out.push({ heading, inCode: true });
      const m = FENCE.exec(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.slice(m[0].length).trim() === '') fence = null;
      continue;
    }
    const open = FENCE.exec(line);
    if (open) {
      fence = open[1];
      out.push({ heading, inCode: true });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) heading = (h[1] ?? '').replace(/[ \t]+#+$/, '').trim();
    out.push({ heading, inCode: false });
  }
  return out;
}

/** Sorted, overlapping or touching ranges merged. */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** The line as shown: no indentation or line end, cut around the first match when long. */
function excerptOf(line: string, ranges: [number, number][]): { excerpt: string; ranges: [number, number][] } {
  const lead = line.length - line.trimStart().length;
  let text = line.slice(lead).replace(/\r$/, '');
  let shifted = ranges.map(([s, e]): [number, number] => [Math.max(0, s - lead), Math.max(0, Math.min(e - lead, text.length))]).filter(([s, e]) => e > s);
  if (text.length > EXCERPT_CHARS) {
    let start = Math.max(0, (shifted[0]?.[0] ?? 0) - EXCERPT_BEFORE);
    let end = Math.min(text.length, start + EXCERPT_CHARS);
    if (end === text.length) start = Math.max(0, end - EXCERPT_CHARS);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    text = prefix + text.slice(start, end) + suffix;
    const shift = prefix.length - start;
    shifted = shifted
      .map(([s, e]): [number, number] => [Math.max(start, s) + shift, Math.min(end, e) + shift])
      .filter(([s, e]) => e > s);
  }
  return { excerpt: text, ranges: shifted };
}

/**
 * One document's hits for `terms` (already folded, see parseQuery): null unless every term
 * occurs in it. Lines are listed in order, with every term's matches on them.
 */
export function searchText(text: string, terms: readonly string[], maxHits = MAX_HITS_PER_DOC): { hits: SearchHit[]; total: number } | null {
  if (!terms.length) return null;
  const { folded, map } = foldText(text);
  // Every term first: a missing one skips the rest of the work for this document.
  for (const term of terms) if (!folded.includes(term)) return null;

  const starts = lineStarts(text);
  const byLine = new Map<number, [number, number][]>();
  for (const term of terms) {
    for (let i = folded.indexOf(term); i !== -1; i = folded.indexOf(term, i + 1)) {
      const from = map[i];
      const to = map[i + term.length];
      const n = lineAt(starts, from);
      const base = starts[n];
      let list = byLine.get(n);
      if (!list) byLine.set(n, (list = []));
      // A match cannot span lines: terms hold no newline, and folding adds none.
      list.push([from - base, to - base]);
    }
  }
  const lineNos = [...byLine.keys()].sort((a, b) => a - b);
  const lines = text.split('\n');
  const contexts = lineContexts(lines);
  const hits: SearchHit[] = [];
  for (const n of lineNos.slice(0, maxHits)) {
    const { excerpt, ranges } = excerptOf(lines[n], mergeRanges(byLine.get(n)!));
    hits.push({ line: n + 1, heading: contexts[n].heading, inCode: contexts[n].inCode, excerpt, ranges });
  }
  return { hits, total: lineNos.length };
}

/** Searches every document; `query` is the user's text, parsed with parseQuery. */
export function searchDocs(docs: readonly CorpusDoc[], query: string, maxHits = MAX_HITS_PER_DOC): SearchResult {
  const terms = parseQuery(query);
  const result: SearchResult = { docs: [], skipped: [] };
  if (!terms.length) return result;
  for (const doc of docs) {
    if (doc.text.length > MAX_DOC_CHARS) {
      result.skipped.push(doc.path);
      continue;
    }
    const found = searchText(doc.text, terms, maxHits);
    if (found) result.docs.push({ path: doc.path, ...found });
  }
  result.docs.sort((a, b) => b.total - a.total || a.path.localeCompare(b.path));
  return result;
}
