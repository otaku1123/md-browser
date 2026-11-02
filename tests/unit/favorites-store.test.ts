import { afterEach, describe, expect, it } from 'vitest';
import { FAVORITES_KEY, FAVORITES_MAX, loadFavorites, normalizeFavorites, saveFavorites, toggleFavorite } from '../../src/core/favorites-store';

afterEach(() => localStorage.clear());

describe('normalizeFavorites', () => {
  it('keeps valid, unique paths in their order and drops the rest', () => {
    expect(normalizeFavorites(['docs/b.md', ' a.md ', 'docs/b.md', '/c.md/', '', 'x/../y.md', './z.md', 'a\\b.md', 3, null])).toEqual([
      'docs/b.md',
      'a.md',
      'c.md',
    ]);
    expect(normalizeFavorites('a.md')).toEqual([]);
    expect(normalizeFavorites(Array.from({ length: FAVORITES_MAX + 5 }, (_, i) => `${i}.md`))).toHaveLength(FAVORITES_MAX);
  });
});

describe('toggleFavorite', () => {
  it('adds at the end, removes when present, ignores a bad path', () => {
    expect(toggleFavorite([], 'b.md')).toEqual(['b.md']);
    expect(toggleFavorite(['b.md'], 'a.md')).toEqual(['b.md', 'a.md']);
    expect(toggleFavorite(['b.md', 'a.md'], 'b.md')).toEqual(['a.md']);
    expect(toggleFavorite(['b.md'], '../x.md')).toEqual(['b.md']);
  });
});

describe('load / save (localStorage without chrome.storage)', () => {
  it('remembers lists per folder and removes an emptied one', async () => {
    expect(await loadFavorites('sample')).toEqual([]);
    await saveFavorites('sample', ['docs/a.md', 'b.md']);
    await saveFavorites('other', ['x.md']);
    expect(await loadFavorites('sample')).toEqual(['docs/a.md', 'b.md']);
    expect(await loadFavorites('other')).toEqual(['x.md']);
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY)!)).toEqual({ sample: ['docs/a.md', 'b.md'], other: ['x.md'] });
    await saveFavorites('sample', []);
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY)!)).toEqual({ other: ['x.md'] });
  });

  it('survives a corrupted stored value and a "__proto__" folder name', async () => {
    localStorage.setItem(FAVORITES_KEY, '{not json');
    expect(await loadFavorites('sample')).toEqual([]);
    localStorage.setItem(FAVORITES_KEY, '{"__proto__":["a.md"],"sample":"nope"}'); // a literal would set the prototype instead
    expect(await loadFavorites('__proto__')).toEqual(['a.md']);
    expect(await loadFavorites('sample')).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
