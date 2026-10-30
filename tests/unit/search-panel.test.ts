import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HITS_SHOWN, matchesSearchKey, mountSearchPanel, SEARCH_DEBOUNCE_MS, type SearchPanel } from '../../src/core/search-panel';
import type { CorpusDoc, LoadOptions, SearchCorpus } from '../../src/core/search-corpus';
import type { SearchHit } from '../../src/core/search';

/** A corpus whose load() resolves when the test says so, reporting progress on the way. */
function fakeCorpus(docs: CorpusDoc[]) {
  let resolve: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  const corpus: SearchCorpus = {
    docs: () => docs,
    put: (path, text) => {
      const d = docs.find((x) => x.path === path);
      if (d) d.text = text;
    },
    load: vi.fn((opts: LoadOptions = {}) => {
      signal = opts.signal;
      opts.onProgress?.(1, docs.length);
      return new Promise<CorpusDoc[]>((r) => (resolve = () => r(docs)));
    }),
  };
  return { corpus, finish: () => resolve?.(), aborted: () => signal?.aborted ?? false };
}

describe('mountSearchPanel', () => {
  const press = (target: EventTarget, init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const shortcut = () => press(document, { key: 'F', ctrlKey: true, shiftKey: true });
  const panelEl = () => document.querySelector<HTMLElement>('.search-panel')!;
  const input = () => document.querySelector<HTMLInputElement>('.search-panel-input')!;
  const status = () => document.querySelector<HTMLElement>('.search-panel-status')!.textContent;
  const hits = () => Array.from(document.querySelectorAll<HTMLElement>('.search-hit'));
  const type = (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  };

  let toolbar: HTMLElement;
  let panel: SearchPanel;
  let onOpen: ReturnType<typeof vi.fn<(path: string, hit: SearchHit, query: string) => void>>;
  let onClose: ReturnType<typeof vi.fn<() => void>>;
  let truncated = false;
  let fake: ReturnType<typeof fakeCorpus>;

  beforeEach(() => {
    vi.useFakeTimers();
    toolbar = document.createElement('header');
    const gear = document.createElement('div');
    gear.className = 'font-settings';
    toolbar.append(gear);
    document.body.append(toolbar);
    onOpen = vi.fn();
    onClose = vi.fn();
    truncated = false;
    fake = fakeCorpus([
      { path: 'docs/a.md', text: '# A\n\nble once\n\n```\nble in code\n```\n' },
      { path: 'README.md', text: 'ble here\nand BLE there\nＢＬＥ again' },
      { path: 'c.md', text: 'nothing' },
    ]);
    panel = mountSearchPanel(toolbar, { corpus: () => fake.corpus, truncated: () => truncated, onOpen, onClose });
  });

  afterEach(() => {
    panel.close();
    toolbar.remove();
    panelEl().remove();
    vi.useRealTimers();
  });

  it('matches ⌘/Ctrl+Shift+F only', () => {
    expect(matchesSearchKey(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matchesSearchKey(new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true }))).toBe(true);
    expect(matchesSearchKey(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))).toBe(false);
    expect(matchesSearchKey(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false);
  });

  it('is offered only once something can be searched', () => {
    const button = toolbar.querySelector<HTMLButtonElement>('.search-toggle')!;
    expect(button.hidden).toBe(true);
    expect(button.nextElementSibling?.className).toBe('font-settings');
    expect(shortcut().defaultPrevented).toBe(false);
    expect(panelEl().hidden).toBe(true);
    panel.setAvailable(true);
    expect(button.hidden).toBe(false);
    expect(shortcut().defaultPrevented).toBe(true);
    expect(panelEl().hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(input());
  });

  it('reads the folder on opening, then searches as you type, grouping the matches by file', async () => {
    panel.setAvailable(true);
    panel.open();
    expect(fake.corpus.load).toHaveBeenCalledTimes(1);
    expect(status()).toBe('Reading files… 1 / 3');
    type('ble');
    expect(hits()).toHaveLength(0); // still reading
    fake.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(status()).toBe('5 matches in 2 files');
    const files = Array.from(document.querySelectorAll('.search-file-path'), (h) => h.textContent);
    expect(files).toEqual(['README.md3', 'docs/a.md2']); // most matches first
    const first = hits()[0];
    expect(first.dataset.path).toBe('README.md');
    expect(first.dataset.line).toBe('1');
    expect(first.querySelector('mark')?.textContent).toBe('ble');
    const inCode = hits().find((h) => h.dataset.path === 'docs/a.md' && h.dataset.line === '6')!;
    expect(inCode.querySelector('.search-hit-heading')?.textContent).toBe('A');
    expect(inCode.querySelector('.search-hit-code')?.textContent).toBe('code');
    expect(document.querySelector<HTMLElement>('.search-panel-note')!.hidden).toBe(true);

    first.click();
    expect(onOpen).toHaveBeenCalledWith('README.md', expect.objectContaining({ line: 1 }), 'ble');
    expect(panelEl().hidden).toBe(false); // stays open to browse the rest

    type('zzz');
    expect(status()).toBe('No matches');
    type(' ');
    expect(status()).toBe('');
    expect(hits()).toHaveLength(0);
  });

  it('searches again without reading when the shown document was updated', async () => {
    panel.setAvailable(true);
    panel.open();
    fake.finish();
    await vi.advanceTimersByTimeAsync(0);
    type('nothing');
    expect(hits()).toHaveLength(1);
    fake.corpus.put('c.md', 'ble now', 'v2');
    type('ble');
    expect(fake.corpus.load).toHaveBeenCalledTimes(1);
    expect(hits().some((h) => h.dataset.path === 'c.md')).toBe(true);
  });

  it('lists ten matches per file, the rest on request', async () => {
    fake = fakeCorpus([{ path: 'many.md', text: Array.from({ length: 15 }, () => 'hit').join('\n') }]);
    panel.setAvailable(true);
    panel.open();
    fake.finish();
    await vi.advanceTimersByTimeAsync(0);
    type('hit');
    expect(hits()).toHaveLength(HITS_SHOWN);
    const more = document.querySelector<HTMLButtonElement>('.search-more')!;
    expect(more.textContent).toBe('Show 5 more');
    more.click();
    expect(hits()).toHaveLength(15);
    expect(document.querySelector('.search-more')).toBeNull();
    expect(document.activeElement).toBe(hits()[HITS_SHOWN]);
  });

  it('notes a cut-off listing and documents skipped for their size', async () => {
    truncated = true;
    fake = fakeCorpus([
      { path: 'a.md', text: 'x' },
      { path: 'big.md', text: 'x'.repeat(2_000_001) },
    ]);
    panel.setAvailable(true);
    panel.open();
    fake.finish();
    await vi.advanceTimersByTimeAsync(0);
    type('x');
    const note = document.querySelector<HTMLElement>('.search-panel-note')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Only part of the folder is listed, so some files are not searched. 1 files skipped (too large)');
  });

  it('moves through the results with the arrow keys and closes with Esc, giving the focus back', async () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    panel.setAvailable(true);
    shortcut();
    fake.finish();
    await vi.advanceTimersByTimeAsync(0);
    type('ble');
    press(input(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(hits()[0]);
    press(hits()[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(hits()[1]);
    press(hits()[1], { key: 'ArrowUp' });
    press(hits()[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(input());
    press(input(), { key: 'ArrowUp' }); // nowhere to go
    expect(document.activeElement).toBe(input());
    press(input(), { key: 'Escape' });
    expect(panelEl().hidden).toBe(true);
    expect(document.activeElement).toBe(before);
    expect(onClose).toHaveBeenCalledTimes(1);
    before.remove();
    // The shortcut toggles; the button too.
    shortcut();
    expect(panelEl().hidden).toBe(false);
    shortcut();
    expect(panelEl().hidden).toBe(true);
    toolbar.querySelector<HTMLButtonElement>('.search-toggle')!.click();
    expect(panelEl().hidden).toBe(false);
    document.querySelector<HTMLButtonElement>('.search-panel-close')!.click();
    expect(panelEl().hidden).toBe(true);
    expect(document.activeElement).toBe(toolbar.querySelector('.search-toggle'));
  });

  it('reopens with a given query without taking the focus (after a file:// page load)', async () => {
    const reader = document.createElement('button');
    document.body.append(reader);
    reader.focus();
    panel.setAvailable(true);
    panel.setQuery('ble');
    panel.open(false);
    expect(panelEl().hidden).toBe(false);
    expect(document.activeElement).toBe(reader);
    expect(input().value).toBe('ble');
    fake.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(hits().length).toBeGreaterThan(0); // searched as soon as the texts were read
    panel.close();
    expect(document.activeElement).toBe(reader); // the focus was never in the panel: left alone
    reader.remove();
  });

  it('stops reading when closed, and resets when the folder changes', async () => {
    panel.setAvailable(true);
    panel.open();
    expect(fake.aborted()).toBe(false);
    panel.close();
    expect(fake.aborted()).toBe(true);
    panel.open();
    fake.finish();
    await vi.advanceTimersByTimeAsync(0);
    type('ble');
    expect(hits().length).toBeGreaterThan(0);
    panel.setAvailable(true); // another folder: read again
    expect(hits()).toHaveLength(0);
    expect(fake.corpus.load).toHaveBeenCalledTimes(3);
    panel.setAvailable(false);
    expect(panelEl().hidden).toBe(true);
    expect(toolbar.querySelector<HTMLButtonElement>('.search-toggle')!.hidden).toBe(true);
  });
});
