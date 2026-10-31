import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fuzzyMatch, mountQuickSwitcher, rankPaths, type QuickSwitcher } from '../../src/core/quick-switcher';
import { matchesQuickOpenKey, normalizeQuickOpenKey, quickOpenKeyLabel } from '../../src/core/quick-open-key';
import { noteRecentDoc, recentDocs } from '../../src/core/recent-docs';

const PATHS = ['README.md', 'docs/architecture.md', 'docs/system-architecture.md', 'old/architecture-v1.md', 'docs/android.md'];

describe('fuzzyMatch', () => {
  it('matches the query characters in order, ignoring case and spaces', () => {
    expect(fuzzyMatch('ARCH', 'docs/architecture.md')?.positions).toEqual([5, 6, 7, 8]);
    expect(fuzzyMatch('d arc', 'docs/architecture.md')).not.toBeNull();
    expect(fuzzyMatch('hcra', 'docs/architecture.md')).toBeNull();
  });

  it('prefers a consecutive run in the file name over scattered letters in folders', () => {
    // "a" first appears in "android"; the better match starts at "architecture".
    expect(fuzzyMatch('arch', 'android/architecture.md')?.positions).toEqual([8, 9, 10, 11]);
  });

  it('scores word starts and shorter paths higher', () => {
    const start = fuzzyMatch('sa', 'docs/system-architecture.md')!;
    const middle = fuzzyMatch('sa', 'docs/usage.md')!;
    expect(start.score).toBeGreaterThan(middle.score);
    expect(fuzzyMatch('a', 'a.md')!.score).toBeGreaterThan(fuzzyMatch('a', 'aaaa/a.md')!.score);
  });

  it('matches everything with an empty query', () => {
    expect(fuzzyMatch('  ', 'x.md')).toEqual({ path: 'x.md', score: 0, positions: [] });
  });
});

describe('rankPaths', () => {
  it('ranks the best matches first', () => {
    expect(rankPaths('arch', PATHS).map((m) => m.path)).toEqual([
      'docs/architecture.md',
      'old/architecture-v1.md',
      'docs/system-architecture.md',
    ]);
  });

  it('breaks ties by recency', () => {
    const recent = ['old/architecture-v1.md'];
    expect(rankPaths('architecture', ['b/architecture.md', 'a/architecture.md'], ['b/architecture.md'])[0].path).toBe('b/architecture.md');
    expect(rankPaths('arch', PATHS, recent)[0].path).toBe('docs/architecture.md'); // a better match still wins
  });

  it('lists recent documents first when the query is empty, without the current one', () => {
    const recent = ['docs/android.md', 'README.md', 'gone.md', 'old/architecture-v1.md'];
    expect(rankPaths('', PATHS, recent, 'docs/android.md').map((m) => m.path)).toEqual([
      'README.md',
      'old/architecture-v1.md',
      'docs/android.md',
      'docs/architecture.md',
      'docs/system-architecture.md',
    ]);
  });

  it('shows at most 50 results', () => {
    const many = Array.from({ length: 80 }, (_, i) => `doc-${i}.md`);
    expect(rankPaths('doc', many)).toHaveLength(50);
    expect(rankPaths('', many)).toHaveLength(50);
  });
});

describe('quick open key', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  it('falls back to ⌘/Ctrl+P', () => {
    expect(normalizeQuickOpenKey('mod+k')).toBe('mod+k');
    expect(normalizeQuickOpenKey('alt+x')).toBe('mod+p');
    expect(normalizeQuickOpenKey(undefined)).toBe('mod+p');
  });

  it('matches Ctrl or ⌘ with exactly the chosen Shift', () => {
    expect(matchesQuickOpenKey(key({ key: 'p', ctrlKey: true }), 'mod+p')).toBe(true);
    expect(matchesQuickOpenKey(key({ key: 'p', metaKey: true }), 'mod+p')).toBe(true);
    expect(matchesQuickOpenKey(key({ key: 'P', ctrlKey: true, shiftKey: true }), 'mod+p')).toBe(false);
    expect(matchesQuickOpenKey(key({ key: 'P', ctrlKey: true, shiftKey: true }), 'mod+shift+p')).toBe(true);
    expect(matchesQuickOpenKey(key({ key: 'p', ctrlKey: true, altKey: true }), 'mod+p')).toBe(false);
    expect(matchesQuickOpenKey(key({ key: 'p' }), 'mod+p')).toBe(false);
    expect(matchesQuickOpenKey(key({ key: 'k', ctrlKey: true }), 'mod+k')).toBe(true);
    expect(matchesQuickOpenKey(key({ key: 'p', ctrlKey: true }), 'off')).toBe(false);
  });

  it('labels the key for the platform', () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get');
    ua.mockReturnValue('Mozilla/5.0 (Windows NT 10.0)');
    expect(quickOpenKeyLabel('mod+shift+p')).toBe('Ctrl+Shift+P');
    ua.mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(quickOpenKeyLabel('mod+k')).toBe('⌘K');
    expect(quickOpenKeyLabel('off')).toBe('');
    ua.mockRestore();
  });
});

describe('recent docs', () => {
  afterEach(() => sessionStorage.clear());

  it('keeps the newest first per folder, without duplicates', () => {
    noteRecentDoc('a', 'x.md');
    noteRecentDoc('a', 'y.md');
    noteRecentDoc('a', 'x.md');
    noteRecentDoc('b', 'z.md');
    expect(recentDocs('a')).toEqual(['x.md', 'y.md']);
    expect(recentDocs('b')).toEqual(['z.md']);
    expect(recentDocs('c')).toEqual([]);
  });

  it('caps documents and folders', () => {
    for (let i = 0; i < 30; i++) noteRecentDoc('a', `${i}.md`);
    expect(recentDocs('a')).toHaveLength(20);
    expect(recentDocs('a')[0]).toBe('29.md');
    for (let i = 0; i < 25; i++) noteRecentDoc(`root-${i}`, 'x.md');
    expect(recentDocs('a')).toEqual([]); // the least recently used folder went first
    expect(recentDocs('root-24')).toEqual(['x.md']);
  });

  it('treats "__proto__" as a plain folder key and ignores broken data', () => {
    noteRecentDoc('__proto__', 'x.md');
    expect(recentDocs('__proto__')).toEqual(['x.md']);
    sessionStorage.setItem('md-browser:recent-docs', '{not json');
    expect(recentDocs('a')).toEqual([]);
    sessionStorage.setItem('md-browser:recent-docs', JSON.stringify({ a: [1, 'ok.md'] }));
    expect(recentDocs('a')).toEqual(['ok.md']);
  });
});

describe('mountQuickSwitcher', () => {
  let switcher: QuickSwitcher;
  let paths: string[];
  let current: string | null;
  const opened: string[] = [];
  const press = (init: KeyboardEventInit, target: EventTarget = document) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const input = () => document.querySelector<HTMLInputElement>('.quick-switcher-input');
  const options = () => Array.from(document.querySelectorAll<HTMLElement>('.quick-switcher-list [role="option"]'));
  const type = (text: string) => {
    input()!.value = text;
    input()!.dispatchEvent(new Event('input'));
  };

  beforeEach(() => {
    paths = [...PATHS];
    current = 'README.md';
    opened.length = 0;
    // Mounted once: each mount adds a document listener, so later tests reuse it.
    switcher ??= mountQuickSwitcher({
      paths: () => paths,
      current: () => current,
      recent: () => ['docs/android.md'],
      onOpen: (p) => opened.push(p),
    });
  });

  afterEach(() => {
    switcher.close();
    localStorage.clear();
  });

  it('opens on Ctrl+P, filters as you type and opens the chosen file', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const e = press({ key: 'p', ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Go to file');
    // Empty query: the recent document first.
    expect(options()[0].dataset.path).toBe('docs/android.md');

    type('arch');
    expect(options().map((o) => o.dataset.path)).toEqual(['docs/architecture.md', 'old/architecture-v1.md', 'docs/system-architecture.md']);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(input()!.getAttribute('aria-activedescendant')).toBe(options()[0].id);
    expect(Array.from(options()[0].querySelectorAll('mark'), (m) => m.textContent).join('')).toBe('arch');
    expect(options()[0].querySelector('.quick-switcher-dir')?.textContent).toBe('docs');

    press({ key: 'ArrowDown' }, input()!);
    press({ key: 'ArrowDown' }, input()!);
    press({ key: 'ArrowDown' }, input()!); // wraps to the first
    press({ key: 'ArrowUp' }, input()!);
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    press({ key: 'Enter' }, input()!);
    expect(opened).toEqual(['docs/system-architecture.md']);
    expect(document.querySelector('.quick-switcher')).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('closes with Esc, the shortcut again or a click outside', () => {
    press({ key: 'p', metaKey: true });
    press({ key: 'Escape' }, input()!);
    expect(document.querySelector('.quick-switcher')).toBeNull();
    press({ key: 'p', ctrlKey: true });
    press({ key: 'p', ctrlKey: true });
    expect(document.querySelector('.quick-switcher')).toBeNull();
    press({ key: 'p', ctrlKey: true });
    document.querySelector('.quick-switcher')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.quick-switcher')).toBeNull();
    expect(opened).toEqual([]);
  });

  it('opens a file with a click, and does nothing for the current one', () => {
    press({ key: 'p', ctrlKey: true });
    type('readme');
    options()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(opened).toEqual([]);
    press({ key: 'p', ctrlKey: true });
    type('zzz');
    expect(options()).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('.quick-switcher-empty')?.hidden).toBe(false);
    press({ key: 'Enter' }, input()!);
    expect(opened).toEqual([]);
  });

  it('leaves the shortcut to the browser with fewer than two files', () => {
    paths = ['README.md'];
    const e = press({ key: 'p', ctrlKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(document.querySelector('.quick-switcher')).toBeNull();
  });

  it('follows the shortcut chosen in the settings', async () => {
    localStorage.setItem('md-browser:quick-open-key', JSON.stringify('mod+k'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'md-browser:quick-open-key' }));
    expect(press({ key: 'p', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    switcher.close();
    localStorage.setItem('md-browser:quick-open-key', JSON.stringify('off'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'md-browser:quick-open-key' }));
    expect(press({ key: 'k', ctrlKey: true }).defaultPrevented).toBe(false);
    localStorage.removeItem('md-browser:quick-open-key');
    window.dispatchEvent(new StorageEvent('storage', { key: 'md-browser:quick-open-key' }));
    expect(press({ key: 'p', ctrlKey: true }).defaultPrevented).toBe(true);
  });
});
