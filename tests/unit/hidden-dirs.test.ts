import { beforeEach, describe, expect, it } from 'vitest';
import {
  HIDDEN_DIRS_MAX,
  addHiddenDir,
  isDefaultSkippedDir,
  isHiddenDir,
  normalizeHiddenDirs,
  removeHiddenDir,
} from '../../src/core/hidden-dirs';
import { HIDDEN_DIRS_KEY, loadHiddenDirs, saveHiddenDirs } from '../../src/core/hidden-dirs-store';

describe('isDefaultSkippedDir', () => {
  it('skips dot folders and dependency / build output folders', () => {
    for (const name of ['.git', '.venv', 'node_modules', 'bower_components', 'vendor', 'dist', 'build', 'out', 'target', 'coverage', 'venv', '__pycache__'])
      expect(isDefaultSkippedDir(name)).toBe(true);
    for (const name of ['docs', 'src', 'Build-notes', 'outline']) expect(isDefaultSkippedDir(name)).toBe(false);
  });
});

describe('normalizeHiddenDirs', () => {
  it('keeps trimmed relative folder paths, unique and sorted', () => {
    expect(normalizeHiddenDirs([' src/ ', '/docs/old/', 'src', 'b'])).toEqual(['b', 'docs/old', 'src']);
  });

  it('drops anything that is not a plain relative path', () => {
    expect(normalizeHiddenDirs(['', '/', '.', '..', 'a/../b', 'a/./b', 'a//b', 'a\\b', 1, null, { x: 1 }])).toEqual([]);
    expect(normalizeHiddenDirs('src')).toEqual([]);
    expect(normalizeHiddenDirs(undefined)).toEqual([]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: HIDDEN_DIRS_MAX + 50 }, (_, i) => `d${String(i).padStart(4, '0')}`);
    expect(normalizeHiddenDirs(many)).toHaveLength(HIDDEN_DIRS_MAX);
  });
});

describe('isHiddenDir', () => {
  it('matches the folder and everything below it, not name prefixes', () => {
    expect(isHiddenDir('src', ['src'])).toBe(true);
    expect(isHiddenDir('src/lib', ['src'])).toBe(true);
    expect(isHiddenDir('srcs', ['src'])).toBe(false);
    expect(isHiddenDir('docs', ['docs/old'])).toBe(false);
    expect(isHiddenDir('src', [])).toBe(false);
  });
});

describe('addHiddenDir / removeHiddenDir', () => {
  it('adds a folder, replacing the folders below it', () => {
    expect(addHiddenDir(['a/b', 'c'], 'a')).toEqual(['a', 'c']);
    expect(addHiddenDir(['a'], 'a/b')).toEqual(['a']);
    expect(addHiddenDir(['a'], '../x')).toEqual(['a']);
  });

  it('removes only the exact folder', () => {
    expect(removeHiddenDir(['a', 'a/b', 'c'], 'a')).toEqual(['a/b', 'c']);
    expect(removeHiddenDir(['a'], 'x')).toEqual(['a']);
  });
});

describe('hidden-dirs store (localStorage)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps one list per folder name and forgets empty lists', async () => {
    await saveHiddenDirs('proj', ['src', 'docs/old']);
    await saveHiddenDirs('other', ['x']);
    expect(await loadHiddenDirs('proj')).toEqual(['docs/old', 'src']);
    expect(await loadHiddenDirs('missing')).toEqual([]);
    await saveHiddenDirs('other', []);
    expect(JSON.parse(localStorage.getItem(HIDDEN_DIRS_KEY)!)).toEqual({ proj: ['docs/old', 'src'] });
  });

  it('ignores corrupted values and odd folder names', async () => {
    localStorage.setItem(HIDDEN_DIRS_KEY, '{not json');
    expect(await loadHiddenDirs('proj')).toEqual([]);
    localStorage.setItem(HIDDEN_DIRS_KEY, JSON.stringify({ proj: ['../x', 'ok'], bad: 'src' }));
    expect(await loadHiddenDirs('proj')).toEqual(['ok']);
    expect(await loadHiddenDirs('constructor')).toEqual([]);
    await saveHiddenDirs('__proto__', ['a']);
    expect(await loadHiddenDirs('__proto__')).toEqual(['a']);
  });
});
