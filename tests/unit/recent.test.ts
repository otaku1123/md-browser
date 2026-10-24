import { describe, expect, it } from 'vitest';
import { MAX_RECENT, normalizeEntries, removeEntry, upsertEntry, type IsSame, type RecentEntry, type RecentHandle } from '../../src/recent';

// Fake handles: same `id` means the same file / folder.
const handle = (id: string, kind: 'file' | 'directory' = 'directory') =>
  ({ id, kind, name: id, queryPermission: async () => 'granted' }) as unknown as RecentHandle;
const isSame: IsSame = async (a, b) => (a as unknown as { id: string }).id === (b as unknown as { id: string }).id;
const entry = (id: string, openedAt = 1, docPath?: string): RecentEntry => ({
  handle: handle(id),
  kind: 'directory',
  name: id,
  docPath,
  openedAt,
});
const names = (list: RecentEntry[]) => list.map((e) => e.name);

describe('upsertEntry', () => {
  it('puts the newest entry first', async () => {
    expect(names(await upsertEntry([entry('a')], entry('b'), isSame))).toEqual(['b', 'a']);
  });

  it('moves a reopened entry to the top and takes its new docPath', async () => {
    const list = await upsertEntry([entry('a'), entry('b'), entry('c')], entry('c', 9, 'docs/x.md'), isSame);
    expect(names(list)).toEqual(['c', 'a', 'b']);
    expect(list[0].docPath).toBe('docs/x.md');
    expect(list[0].openedAt).toBe(9);
  });

  it('keeps at most MAX_RECENT entries, dropping the oldest', async () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < MAX_RECENT + 3; i++) list = await upsertEntry(list, entry(`e${i}`), isSame);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].name).toBe(`e${MAX_RECENT + 2}`);
    expect(names(list)).not.toContain('e0');
  });
});

describe('removeEntry', () => {
  it('removes only the matching entry', async () => {
    expect(names(await removeEntry([entry('a'), entry('b')], handle('a'), isSame))).toEqual(['b']);
  });
});

describe('normalizeEntries', () => {
  it('migrates the old single record into a one-entry list', () => {
    const [first, ...rest] = normalizeEntries(undefined, { handle: handle('old', 'file'), docPath: 'a.md' });
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ kind: 'file', name: 'old', docPath: 'a.md', openedAt: 0 });
  });

  it('prefers the list over the old record and drops malformed items', () => {
    const list = normalizeEntries([entry('a'), { handle: {} }, null], { handle: handle('old') });
    expect(names(list)).toEqual(['a']);
  });

  it('returns an empty list when nothing is stored', () => {
    expect(normalizeEntries(undefined, undefined)).toEqual([]);
    expect(normalizeEntries(undefined, { docPath: 'x' })).toEqual([]);
  });
});
