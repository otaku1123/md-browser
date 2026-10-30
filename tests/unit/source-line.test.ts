import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../../src/core/render';
import {
  clearHighlight,
  elementForLine,
  findTextRanges,
  scrollToLine,
  SEARCH_HIGHLIGHT,
  SEARCH_HIGHLIGHT_CURRENT,
  setHighlight,
} from '../../src/core/source-line';

function dom(src: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(src).html;
  return div;
}

const lineOf = (el: Element | null) => el?.getAttribute('data-line');

describe('data-line', () => {
  it('marks each block with the 1-based line it starts on', () => {
    const root = dom('# Title\n\nPara one\nstill one\n\n- a\n- b\n\n```js\nx\n```\n\n---\n');
    expect(lineOf(root.querySelector('h1'))).toBe('1');
    expect(lineOf(root.querySelector('p'))).toBe('3');
    expect(Array.from(root.querySelectorAll('li'), lineOf)).toEqual(['6', '7']);
    expect(lineOf(root.querySelector('pre [data-line]'))).toBe('9');
    expect(lineOf(root.querySelector('hr'))).toBe('13');
  });

  it('leaves inline elements without a line', () => {
    const root = dom('Some **bold** and `code`\n');
    expect(root.querySelectorAll('[data-line]')).toHaveLength(1);
  });

  it('counts the front matter lines', () => {
    const root = dom('---\ntitle: x\ntags: []\n---\n# Heading\n\nText\n');
    expect(lineOf(root.querySelector('details.front-matter'))).toBe('1');
    expect(lineOf(root.querySelector('h1'))).toBe('5');
    expect(lineOf(root.querySelector('p'))).toBe('7');
  });

  it('marks tables, alerts, diagrams and math blocks', () => {
    const root = dom('| a |\n|---|\n| 1 |\n\n> [!NOTE]\n> body\n\n```mermaid\ngraph TD\n```\n\n$$\nx\n$$\n\n```math\ny\n```\n');
    expect(lineOf(root.querySelector('table'))).toBe('1');
    expect(lineOf(root.querySelector('tbody tr'))).toBe('3');
    expect(lineOf(root.querySelector('.markdown-alert'))).toBe('5');
    expect(lineOf(root.querySelector('.diagram-mermaid'))).toBe('8');
    expect(Array.from(root.querySelectorAll('.math-display'), lineOf)).toEqual(['12', '16']);
  });
});

describe('elementForLine', () => {
  const root = dom('# A\n\nfirst\n\n- item\n\n  nested para\n\nlast\n');

  it('finds the innermost block starting at or before the line', () => {
    expect(elementForLine(root, 1)?.tagName).toBe('H1');
    expect(elementForLine(root, 4)?.textContent).toBe('first');
    expect(elementForLine(root, 7)?.textContent).toBe('nested para');
    expect(elementForLine(root, 99)?.textContent).toBe('last');
  });

  it('is null before the first block', () => {
    expect(elementForLine(dom('\n\n\ntext\n'), 1)).toBeNull();
  });

  it('scrolls the block to the top', () => {
    const el = elementForLine(root, 3)!;
    const spy = vi.fn();
    el.scrollIntoView = spy;
    expect(scrollToLine(root, 3, 'smooth')).toBe(el);
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});

describe('findTextRanges', () => {
  it('matches case-insensitively across inline elements', () => {
    const root = dom('**BLE** reconnect, then ble Reconnect again\n');
    expect(findTextRanges(root, 'ble reconnect').map(String)).toEqual(['BLE reconnect', 'ble Reconnect']);
  });

  it('does not match across blocks', () => {
    expect(findTextRanges(dom('foo\n\nbar\n'), 'foobar')).toEqual([]);
    expect(findTextRanges(dom('foo\n\nbar\n'), 'bar')).toHaveLength(1);
  });

  it('finds Japanese text and keeps offsets after characters with a longer lower case', () => {
    const root = dom('İstanbul の再接続シーケンス\n');
    expect(findTextRanges(root, '再接続').map(String)).toEqual(['再接続']);
  });

  it('skips diagram sources', () => {
    expect(findTextRanges(dom('```mermaid\ngraph TD; reconnect\n```\n'), 'reconnect')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(findTextRanges(dom('text\n'), '')).toEqual([]);
  });
});

describe('setHighlight', () => {
  const registry = new Map<string, { ranges: Range[]; priority: number }>();

  afterEach(() => {
    registry.clear();
    vi.unstubAllGlobals();
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

  it('registers the ranges, drawing the current match on top', () => {
    stub();
    const ranges = findTextRanges(dom('a b a\n'), 'a');
    setHighlight(SEARCH_HIGHLIGHT, ranges);
    setHighlight(SEARCH_HIGHLIGHT_CURRENT, ranges.slice(0, 1));
    expect(registry.get(SEARCH_HIGHLIGHT)?.ranges).toHaveLength(2);
    expect(registry.get(SEARCH_HIGHLIGHT)?.priority).toBe(0);
    expect(registry.get(SEARCH_HIGHLIGHT_CURRENT)?.priority).toBe(1);
    setHighlight(SEARCH_HIGHLIGHT, []);
    expect(registry.has(SEARCH_HIGHLIGHT)).toBe(false);
    clearHighlight(SEARCH_HIGHLIGHT_CURRENT);
    expect(registry.size).toBe(0);
  });

  it('does nothing without the Highlight API', () => {
    vi.stubGlobal('CSS', {});
    expect(() => setHighlight(SEARCH_HIGHLIGHT, findTextRanges(dom('a\n'), 'a'))).not.toThrow();
    expect(() => clearHighlight(SEARCH_HIGHLIGHT)).not.toThrow();
  });
});
