import { describe, expect, it, vi } from 'vitest';
import { createSearchCorpus, type CorpusSource } from '../../src/core/search-corpus';

/** A source over a { path: text } map; every read is recorded as [path, known]. */
function fakeSource(files: Record<string, string>) {
  const reads: [string, string | undefined][] = [];
  const version = (path: string) => `v:${files[path]}`;
  const source: CorpusSource = {
    paths: () => Object.keys(files),
    async read(path, known) {
      reads.push([path, known]);
      if (!(path in files)) throw new Error(`gone: ${path}`);
      if (known === version(path)) return 'unchanged';
      return { text: files[path], version: version(path) };
    },
  };
  return { files, reads, source };
}

describe('createSearchCorpus', () => {
  it('reads every document, in path order, and reports progress', async () => {
    const { source } = fakeSource({ 'b.md': 'B', 'a.md': 'A', 'docs/c.md': 'C' });
    const progress = vi.fn();
    const docs = await createSearchCorpus(source).load({ onProgress: progress });
    expect(docs).toEqual([
      { path: 'b.md', text: 'B' },
      { path: 'a.md', text: 'A' },
      { path: 'docs/c.md', text: 'C' },
    ]);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });

  it('asks again with the known versions and keeps the unchanged texts', async () => {
    const { files, reads, source } = fakeSource({ 'a.md': 'A', 'b.md': 'B' });
    const corpus = createSearchCorpus(source);
    await corpus.load();
    files['b.md'] = 'B2';
    reads.length = 0;
    expect(await corpus.load()).toEqual([
      { path: 'a.md', text: 'A' },
      { path: 'b.md', text: 'B2' },
    ]);
    expect(reads).toEqual([
      ['a.md', 'v:A'],
      ['b.md', 'v:B'],
    ]);
  });

  it('forgets documents that left the list or could not be read', async () => {
    const { files, source } = fakeSource({ 'a.md': 'A', 'b.md': 'B' });
    const corpus = createSearchCorpus(source);
    await corpus.load();
    delete files['b.md'];
    expect(await corpus.load()).toEqual([{ path: 'a.md', text: 'A' }]);
    // Listed, but the read fails: left out rather than searched with stale text.
    const flaky = createSearchCorpus({ paths: () => ['a.md', 'x.md'], read: source.read });
    expect(await flaky.load()).toEqual([{ path: 'a.md', text: 'A' }]);
    // The stale copy is not kept either when the next read fails.
    files['a.md'] = 'A2';
    const { source: later } = fakeSource({ 'a.md': 'A' });
    const corpus2 = createSearchCorpus({ paths: () => ['a.md'], read: later.read });
    await corpus2.load();
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    const corpus3 = createSearchCorpus({ paths: () => ['a.md'], read: failing });
    expect(await corpus3.load()).toEqual([]);
  });

  it('does not trust an unchanged answer for a document it never read', async () => {
    const source: CorpusSource = { paths: () => ['a.md'], read: async () => 'unchanged' };
    expect(await createSearchCorpus(source).load()).toEqual([]);
  });

  it('reads a bounded number of documents at once', async () => {
    let running = 0;
    let peak = 0;
    const source: CorpusSource = {
      paths: () => Array.from({ length: 20 }, (_, i) => `${i}.md`),
      async read(path) {
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, 1));
        running--;
        return { text: path, version: '1' };
      },
    };
    expect(await createSearchCorpus(source, 3).load()).toHaveLength(20);
    expect(peak).toBe(3);
  });

  it('stops at an abort and rejects', async () => {
    const controller = new AbortController();
    const read = vi.fn(async (path: string) => {
      if (path === '1.md') controller.abort();
      return { text: path, version: '1' };
    });
    const source: CorpusSource = { paths: () => ['0.md', '1.md', '2.md', '3.md'], read };
    await expect(createSearchCorpus(source, 1).load({ signal: controller.signal })).rejects.toThrow('aborted');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
