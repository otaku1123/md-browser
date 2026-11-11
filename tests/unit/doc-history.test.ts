import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountDocHistory, type DocEntry } from '../../src/core/doc-history';

/** jsdom traverses the history asynchronously: wait for the popstate it fires. */
function go(delta: number): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    history.go(delta);
  });
}

const stateOf = () => (history.state as { mdBrowserDoc?: DocEntry } | null)?.mdBrowserDoc;
const entry = (path: string, root = 'docs'): DocEntry => ({ root, path });

let pops: [DocEntry, number | undefined][];
let scrollY = 0;
let mounted: ReturnType<typeof mountDocHistory>[] = [];
const mount = (onPop: Parameters<typeof mountDocHistory>[0] = (e, y) => pops.push([e, y])) => {
  const h = mountDocHistory(onPop);
  mounted.push(h);
  return h;
};

beforeEach(() => {
  pops = [];
  scrollY = 0;
  // A fresh entry at the end of the history (the one window is shared by the tests), without a state.
  history.pushState(null, '', '/');
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
});
afterEach(() => {
  mounted.splice(0).forEach((h) => h.unmount());
  vi.restoreAllMocks();
});

describe('mountDocHistory', () => {
  it('makes the first document the page entry and adds one per document shown after it', async () => {
    const start = history.length;
    const h = mount();
    h.show(entry('README.md'), 0);
    expect(history.length).toBe(start);
    expect(stateOf()).toMatchObject({ root: 'docs', path: 'README.md' });
    h.show(entry('guide.md'), 120); // README.md was left scrolled to 120
    h.show(entry('api.md'), 0);
    expect(history.length).toBe(start + 2);
    expect(stateOf()).toMatchObject({ path: 'api.md' });

    await go(-1);
    expect(pops).toEqual([[entry('guide.md'), 0]]);
    await go(-1);
    expect(pops[1]).toEqual([entry('README.md'), 120]); // back where it was left
    await go(1);
    expect(pops[2]).toEqual([entry('guide.md'), 0]);
  });

  it('remembers where a document was left when leaving it by going back', async () => {
    const h = mount();
    h.show(entry('a.md'), 0);
    h.show(entry('b.md'), 0);
    scrollY = 300; // reading b.md
    await go(-1);
    expect(pops).toEqual([[entry('a.md'), 0]]);
    scrollY = 0;
    await go(1);
    expect(pops[1]).toEqual([entry('b.md'), 300]);
  });

  it('adds no entry when the same document is shown again (reload, rescan)', () => {
    const start = history.length;
    const h = mount(() => {});
    h.show(entry('a.md'), 0);
    h.show(entry('a.md'), 50);
    expect(history.length).toBe(start);
    h.show(entry('a.md', 'other'), 0); // the same path in another folder is another document
    expect(history.length).toBe(start + 1);
  });

  it('takes the entry left by the page before a reload as the current one', () => {
    history.replaceState({ mdBrowserDoc: { id: 'old:1', root: 'docs', path: 'a.md' } }, '', '/');
    const start = history.length;
    const h = mount(() => {});
    h.show(entry('a.md'), 0); // reopened after the reload: still that entry
    expect(history.length).toBe(start);
    h.show(entry('b.md'), 0);
    expect(history.length).toBe(start + 1);
  });

  it('stamps an anchor-link entry with the document shown, so going over it keeps the document', async () => {
    const h = mount();
    h.show(entry('a.md'), 0);
    // An in-page link: the browser adds an entry with no state and fires hashchange (and, in Chrome, popstate).
    location.hash = '#section';
    await new Promise((r) => setTimeout(r, 0));
    expect(stateOf()).toMatchObject({ root: 'docs', path: 'a.md' });
    expect(pops).toEqual([]);
    h.show(entry('b.md'), 0);
    expect(location.hash).toBe(''); // the new entry does not carry a.md's heading
    await go(-1); // the anchor entry of a.md, left (for b.md) at scroll 0
    expect(pops).toEqual([[entry('a.md'), 0]]);
    await go(-1); // a.md before the anchor link, never left by this module: no scroll of its own
    expect(pops[1]).toEqual([entry('a.md'), undefined]);
  });

  it('ignores states written by something else', async () => {
    const h = mount();
    h.show(entry('a.md'), 0);
    history.pushState({ other: true }, '', '/');
    history.pushState({ mdBrowserDoc: { id: 1, root: 'docs', path: 'x.md' } }, '', '/'); // malformed
    await go(-1); // the foreign entry: not a document, but stamped with the one shown
    expect(pops).toEqual([]);
    await go(-1); // a.md itself
    expect(pops).toEqual([[entry('a.md'), undefined]]);
    await go(1);
    expect(stateOf()).toMatchObject({ path: 'a.md' }); // the stamped foreign entry, left at scroll 0 just now
    expect(pops[1]).toEqual([entry('a.md'), 0]);
  });
});
