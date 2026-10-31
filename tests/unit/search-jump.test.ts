import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../../src/core/render';
import { clearSearchHighlight, highlightSearch, jumpHash, jumpToLine, parseJumpHash } from '../../src/core/search-jump';
import { SEARCH_HIGHLIGHT, SEARCH_HIGHLIGHT_CURRENT } from '../../src/core/source-line';

describe('jump hash', () => {
  it('round-trips the line and the query', () => {
    const hash = jumpHash(138, 'BLE 再接続 a&b=c');
    expect(hash.startsWith('#mdb-line=138&mdb-q=')).toBe(true);
    expect(parseJumpHash(hash)).toEqual({ line: 138, query: 'BLE 再接続 a&b=c' });
    expect(parseJumpHash('#mdb-line=3')).toEqual({ line: 3, query: '' });
  });

  it('ignores other hashes and bad lines', () => {
    expect(parseJumpHash('')).toBeNull();
    expect(parseJumpHash('#heading')).toBeNull();
    expect(parseJumpHash('#mdb-q=x')).toBeNull();
    expect(parseJumpHash('#mdb-line=0')).toBeNull();
    expect(parseJumpHash('#mdb-line=abc')).toBeNull();
    expect(parseJumpHash('#mdb-line=1.5')).toBeNull();
  });
});

describe('highlightSearch', () => {
  const registry = new Map<string, { ranges: Range[]; priority: number }>();

  function dom(src: string): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = renderMarkdown(src).html;
    document.body.append(div);
    return div;
  }

  afterEach(() => {
    registry.clear();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  function stub() {
    vi.stubGlobal('CSS', { highlights: registry });
    vi.stubGlobal(
      'Highlight',
      class {
        priority = 0;
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    );
  }

  it('marks every term, and the matches on the jumped line as current', () => {
    stub();
    const root = dom('# BLE\n\nble one\n\nＢＬＥ two and ble\n');
    highlightSearch(root, ['ble', 'two'], 5);
    expect(registry.get(SEARCH_HIGHLIGHT)?.ranges.map(String)).toEqual(['BLE', 'ble', 'ＢＬＥ', 'ble', 'two']);
    expect(registry.get(SEARCH_HIGHLIGHT_CURRENT)?.ranges.map(String)).toEqual(['ＢＬＥ', 'ble', 'two']);
    highlightSearch(root, ['ble']); // no line: nothing current
    expect(registry.get(SEARCH_HIGHLIGHT)?.ranges).toHaveLength(4);
    expect(registry.has(SEARCH_HIGHLIGHT_CURRENT)).toBe(false);
    highlightSearch(root, []);
    expect(registry.size).toBe(0);
  });

  it('scrolls the line into view and clears on request', () => {
    stub();
    const root = dom('a\n\nb\n');
    const target = root.querySelectorAll('p')[1];
    const spy = vi.fn();
    target.scrollIntoView = spy;
    jumpToLine(root, 3, ['b']);
    expect(spy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(registry.get(SEARCH_HIGHLIGHT_CURRENT)?.ranges.map(String)).toEqual(['b']);
    clearSearchHighlight();
    expect(registry.size).toBe(0);
  });

  it('does nothing without the Highlight API', () => {
    vi.stubGlobal('CSS', {});
    expect(() => highlightSearch(dom('x\n'), ['x'], 1)).not.toThrow();
    expect(() => clearSearchHighlight()).not.toThrow();
  });
});
