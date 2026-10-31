import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createToc, loadFolded, saveFolded } from '../../src/core/toc';
import type { TocItem } from '../../src/core/render';

const ITEMS: TocItem[] = [
  { level: 1, text: 'Title', id: 'title' },
  { level: 2, text: 'Basics', id: 'basics' },
  { level: 2, text: 'Images', id: 'images' },
  { level: 3, text: 'Deep', id: 'deep' },
  { level: 4, text: 'Deeper', id: 'deeper' },
  { level: 2, text: 'End', id: 'end' },
];

let toc: HTMLElement;

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '<nav class="toc"></nav><main></main>';
  toc = document.querySelector('nav')!;
  // Headings in the page, so update() can find them (jsdom reports 0 for every rect).
  document.querySelector('main')!.innerHTML = ITEMS.map((i) => `<h${i.level} id="${i.id}">${i.text}</h${i.level}>`).join('');
});

afterEach(() => {
  document.body.innerHTML = '';
});

const li = (id: string) => toc.querySelector<HTMLAnchorElement>(`a[data-target="${id}"]`)!.parentElement!;
const foldButton = (id: string) => li(id).querySelector<HTMLButtonElement>(':scope > .toc-fold');
const visibleTargets = () =>
  Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[data-target]'))
    .filter((a) => !a.closest('li.toc-folded > ul'))
    .map((a) => a.dataset.target);

describe('createToc', () => {
  it('nests entries under the previous smaller level, with a fold button on sections that have children', () => {
    createToc(toc).render(ITEMS);
    expect(li('basics').parentElement!.parentElement).toBe(li('title'));
    expect(li('deep').parentElement!.parentElement).toBe(li('images'));
    expect(li('deeper').parentElement!.parentElement).toBe(li('deep'));
    expect(li('end').parentElement!.parentElement).toBe(li('title'));
    expect(li('title').className).toBe('toc-l1');
    expect(li('deeper').className).toBe('toc-l4');
    for (const id of ['title', 'images', 'deep']) {
      const button = foldButton(id)!;
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(button.getAttribute('aria-label')).toBe('Collapse section');
      expect(document.getElementById(button.getAttribute('aria-controls')!)).toBe(li(id).querySelector(':scope > ul'));
    }
    for (const id of ['basics', 'deeper', 'end']) expect(foldButton(id)).toBeNull();
    expect(toc.classList.contains('empty')).toBe(false);
  });

  it('folds and unfolds a section from its button, keeping the state across re-renders', () => {
    const ctl = createToc(toc);
    ctl.render(ITEMS);
    foldButton('images')!.click();
    expect(li('images').classList.contains('toc-folded')).toBe(true);
    expect(foldButton('images')!.getAttribute('aria-expanded')).toBe('false');
    expect(foldButton('images')!.getAttribute('aria-label')).toBe('Expand section');
    expect(visibleTargets()).toEqual(['title', 'basics', 'images', 'end']);

    ctl.render(ITEMS); // auto-reload
    expect(li('images').classList.contains('toc-folded')).toBe(true);
    expect(visibleTargets()).toEqual(['title', 'basics', 'images', 'end']);

    foldButton('images')!.click();
    expect(li('images').classList.contains('toc-folded')).toBe(false);
    expect(visibleTargets()).toHaveLength(6);
  });

  it('remembers folds per document in sessionStorage', () => {
    const ctl = createToc(toc);
    ctl.setDoc('folder/a.md');
    ctl.render(ITEMS);
    foldButton('title')!.click();
    expect(loadFolded('folder/a.md')).toEqual(new Set(['title']));

    ctl.setDoc('folder/b.md');
    ctl.render(ITEMS);
    expect(li('title').classList.contains('toc-folded')).toBe(false);

    ctl.setDoc('folder/a.md');
    ctl.render(ITEMS);
    expect(li('title').classList.contains('toc-folded')).toBe(true);
    expect(visibleTargets()).toEqual(['title']);
  });

  it('marks the folded section as active while the current heading is inside it', () => {
    const ctl = createToc(toc);
    ctl.render(ITEMS);
    // jsdom reports every rect at 0, so the last heading would win: push End below the fold line.
    document.getElementById('end')!.getBoundingClientRect = () => ({ top: 500 }) as DOMRect;
    ctl.update();
    expect(toc.querySelector<HTMLAnchorElement>('a.active')?.dataset.target).toBe('deeper');
    foldButton('images')!.click();
    expect(toc.querySelector<HTMLAnchorElement>('a.active')?.dataset.target).toBe('images');
    expect(toc.querySelectorAll('a.active')).toHaveLength(1);
    foldButton('title')!.click();
    expect(toc.querySelector<HTMLAnchorElement>('a.active')?.dataset.target).toBe('title');
  });

  it('folds with ArrowLeft and unfolds with ArrowRight, moving between levels otherwise', () => {
    createToc(toc).render(ITEMS);
    const key = (id: string, k: string) =>
      li(id).querySelector('a')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const link = (id: string) => li(id).querySelector<HTMLAnchorElement>(':scope > a')!;

    key('images', 'ArrowLeft');
    expect(li('images').classList.contains('toc-folded')).toBe(true);
    link('images').focus();
    key('images', 'ArrowLeft'); // already folded: go to the section above
    expect(document.activeElement).toBe(link('title'));

    key('images', 'ArrowRight');
    expect(li('images').classList.contains('toc-folded')).toBe(false);
    key('images', 'ArrowRight'); // already open: move into it
    expect(document.activeElement).toBe(link('deep'));

    key('basics', 'ArrowRight'); // no children: nothing happens
    expect(document.activeElement).toBe(link('deep'));
    key('basics', 'ArrowLeft');
    expect(document.activeElement).toBe(link('title'));
  });

  it('renders an empty list as the empty state', () => {
    createToc(toc).render([]);
    expect(toc.classList.contains('empty')).toBe(true);
    expect(toc.querySelector('ul')).toBeNull();
  });
});

describe('fold storage', () => {
  it('keeps the 20 most recent documents and drops empty sets', () => {
    for (let i = 0; i < 25; i++) saveFolded(`d${i}`, new Set(['x']));
    expect(loadFolded('d4').size).toBe(0);
    expect(loadFolded('d5')).toEqual(new Set(['x']));
    saveFolded('d5', new Set());
    expect(loadFolded('d5').size).toBe(0);
    expect(JSON.parse(sessionStorage.getItem('md-browser:toc-folded')!)).not.toHaveProperty('d5');
  });

  it('ignores corrupt storage', () => {
    sessionStorage.setItem('md-browser:toc-folded', '{bad');
    expect(loadFolded('a').size).toBe(0);
    sessionStorage.setItem('md-browser:toc-folded', '{"a": "nope", "b": [1, "ok"]}');
    expect(loadFolded('a').size).toBe(0);
    expect(loadFolded('b')).toEqual(new Set(['ok']));
  });
});
