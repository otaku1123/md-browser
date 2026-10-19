import { describe, expect, it } from 'vitest';
import { fromFiles } from '../../src/workspace';

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
