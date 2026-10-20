import { describe, expect, it } from 'vitest';
import { fromDirectoryHandle, fromFiles } from '../../src/workspace';

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
});
