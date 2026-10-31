import { describe, expect, it } from 'vitest';
import { corpusSource, fromDirectoryHandle, fromFiles } from '../../src/workspace';

/** File as produced by <input webkitdirectory>, which sets webkitRelativePath. */
function picked(rel: string): File {
  const file = new File(['# x'], rel.split('/').pop()!);
  Object.defineProperty(file, 'webkitRelativePath', { value: rel });
  return file;
}

describe('fromFiles', () => {
  it('skips Markdown inside excluded and hidden directories', () => {
    const ws = fromFiles([
      'proj/README.md',
      'proj/docs/guide.md',
      'proj/node_modules/pkg/README.md',
      'proj/.github/CONTRIBUTING.md',
      'proj/docs/build/out.md',
      'proj/dist/index.md',
      'proj/img/a.png',
    ].map(picked));
    expect(ws.docs.map((d) => d.path)).toEqual(['proj/docs/guide.md', 'proj/README.md'].sort());
  });

  it('never skips the picked folder itself', () => {
    const ws = fromFiles([picked('build/notes.md'), picked('.config/a.md')]);
    expect(ws.docs.map((d) => d.path)).toEqual(['.config/a.md', 'build/notes.md']);
  });

  it('leaves out hidden folders, relative to the picked folder as listed, and filters again on rescan', async () => {
    const ws = fromFiles(['proj/README.md', 'proj/src/a.md', 'proj/src/lib/b.md', 'proj/srcs/c.md', 'proj/vendor/v.md'].map(picked), ['proj/src']);
    expect(ws.docs.map((d) => d.path)).toEqual(['proj/README.md', 'proj/srcs/c.md']);
    expect(ws.folder).toBe('proj');
    expect(ws.hiddenDirs).toEqual(['proj/src']);
    const shown = await ws.rescan!([]);
    expect(shown.docs.map((d) => d.path)).toEqual(['proj/README.md', 'proj/src/a.md', 'proj/src/lib/b.md', 'proj/srcs/c.md']);
  });

  it('offers no rescan for plain dropped files', () => {
    const ws = fromFiles([new File(['x'], 'a.md'), new File(['y'], 'b.md')]);
    expect(ws.rescan).toBeUndefined();
    expect(ws.folder).toBeUndefined();
  });

  it('keeps plain dropped files and still resolves assets in excluded folders', async () => {
    const ws = fromFiles([new File(['x'], 'note.md'), picked('proj/dist/logo.png'), picked('proj/a.md')]);
    expect(ws.docs.map((d) => d.path)).toEqual(['note.md', 'proj/a.md']);
    const { resolve, release } = ws.assetResolver({ path: 'proj/a.md' });
    expect(await resolve!('dist/logo.png')).toMatch(/^blob:/);
    release();
  });
});

/** Minimal stand-in for a picked folder: only what scanning uses (kind, name, values()). */
type FakeTree = { [name: string]: FakeTree | string };
function dirHandle(name: string, tree: FakeTree): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const [n, v] of Object.entries(tree)) yield typeof v === 'string' ? { kind: 'file', name: n } : dirHandle(n, v);
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('fromDirectoryHandle', () => {
  it('finds nested Markdown and skips excluded folders', async () => {
    const ws = await fromDirectoryHandle(
      dirHandle('root', {
        'README.md': '',
        docs: { 'guide.md': '', deep: { 'more.md': '' } },
        node_modules: { 'pkg.md': '' },
        '.git': { 'x.md': '' },
      }),
    );
    expect(ws.docs.map((d) => d.path)).toEqual(['docs/deep/more.md', 'docs/guide.md', 'README.md']);
    expect(ws.truncatedAt).toBeUndefined();
  });

  it('keeps shallower folders when a large one exhausts the scan limit', async () => {
    const limit = 20;
    const code: FakeTree = {};
    for (let i = 0; i < limit; i++) code[`f${i}.ts`] = '';
    code['deep.md'] = ''; // listed past the limit
    const ws = await fromDirectoryHandle(
      dirHandle('root', {
        app: { src: code },
        docs: { 'readme.md': '' },
        'notes.md': '',
      }),
      limit,
    );
    // Depth-first used to stop inside app/src and lose docs/ entirely.
    expect(ws.docs.map((d) => d.path)).toEqual(['docs/readme.md', 'notes.md']);
    expect(ws.truncatedAt).toBe(limit);
  });

  it('skips the new default exclusions', async () => {
    const ws = await fromDirectoryHandle(
      dirHandle('root', {
        'a.md': '',
        vendor: { 'v.md': '' },
        target: { 't.md': '' },
        __pycache__: { 'p.md': '' },
        venv: { 'x.md': '' },
        coverage: { 'c.md': '' },
      }),
    );
    expect(ws.docs.map((d) => d.path)).toEqual(['a.md']);
  });

  it('never enters hidden folders, so they cost nothing of the limit, and rescans with a new list', async () => {
    const big: FakeTree = {};
    for (let i = 0; i < 50; i++) big[`f${i}.ts`] = '';
    big['in-big.md'] = '';
    const root = dirHandle('root', { app: { src: big, 'app.md': '' }, docs: { 'readme.md': '' } });
    const ws = await fromDirectoryHandle(root, 10, ['app/src']);
    expect(ws.docs.map((d) => d.path)).toEqual(['app/app.md', 'docs/readme.md']);
    expect(ws.truncatedAt).toBeUndefined();
    expect(ws.hiddenDirs).toEqual(['app/src']);
    expect(ws.folder).toBe('root');
    const all = await ws.rescan!(['docs']);
    expect(all.docs.map((d) => d.path)).toEqual(['app/app.md']);
    expect(all.truncatedAt).toBe(10); // same limit as before
  });
});

describe('corpusSource', () => {
  it('reads the text with its stamp, and answers unchanged when the stamp is the known one', async () => {
    const file = picked('proj/a.md');
    const ws = fromFiles([file, picked('proj/b.md')]);
    const source = corpusSource(ws);
    expect(source.paths()).toEqual(['proj/a.md', 'proj/b.md']);
    const first = await source.read('proj/a.md');
    expect(first).toEqual({ text: '# x', version: `${file.lastModified}:${file.size}` });
    expect(await source.read('proj/a.md', (first as { version: string }).version)).toBe('unchanged');
    expect(await source.read('proj/a.md', 'stale')).toEqual(first);
  });
});
