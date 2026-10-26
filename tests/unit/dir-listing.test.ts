import { describe, expect, it } from 'vitest';
import { chooseRoot, folderOf, isSkipped, listMarkdownTree, parseListing, relativePath } from '../../src/extension/dir-listing';

/** A trimmed-down Chrome file:// directory listing page. */
function listing(rows: [name: string, isDir: boolean][], withParent = false): string {
  const row = (name: string, url: string, isDir: boolean) =>
    `<script>addRow(${JSON.stringify(name)},${JSON.stringify(url)},${isDir ? 1 : 0},96,"96 B",1700000000,"1/1/24");</script>`;
  return [
    '<script>function addRow(name, url, isdir, size, size_string, date_modified, date_modified_string) {',
    '  if (name == "." || name == "..") return;',
    '}</script>',
    withParent ? row('..', '..', true) : '',
    ...rows.map(([name, isDir]) => row(name, encodeURIComponent(name), isDir)),
  ].join('\n');
}

/** Fake fetch over a { folderUrl: rows } map; records which folders were read. */
function fakeFs(tree: Record<string, [string, boolean][]>) {
  const fetched: string[] = [];
  const fetchText = async (url: string) => {
    fetched.push(url);
    const rows = tree[url];
    if (!rows) throw new Error(`not found: ${url}`);
    return listing(rows, true);
  };
  return { fetched, fetchText };
}

const ROOT = 'file:///home/u/docs/';

describe('parseListing', () => {
  it('reads name, url and isdir, skipping the function definition and the parent row', () => {
    const html = listing(
      [
        ['docs', true],
        ['README.md', false],
      ],
      true,
    );
    expect(parseListing(html)).toEqual([
      { name: 'docs', url: 'docs', isDir: true },
      { name: 'README.md', url: 'README.md', isDir: false },
    ]);
  });

  it('decodes escaped names with quotes, backslashes, unicode and spaces', () => {
    const names = ['say "hi".md', 'back\\slash.md', '日本語 メモ.md', 'a, b (1).md', '<tag>.md'];
    const rows = parseListing(listing(names.map((n) => [n, false])));
    expect(rows.map((r) => r.name)).toEqual(names);
    expect(rows[2].url).toBe('%E6%97%A5%E6%9C%AC%E8%AA%9E%20%E3%83%A1%E3%83%A2.md');
  });

  it('accepts Chrome-style \\u escapes', () => {
    expect(parseListing('addRow("\\u003Cx\\u003E.md","%3Cx%3E.md",0,1,"1 B",0,"");')).toEqual([
      { name: '<x>.md', url: '%3Cx%3E.md', isDir: false },
    ]);
  });

  it('returns nothing for unrelated pages', () => {
    expect(parseListing('<html><body>hello addRow(foo, bar, 1)</body></html>')).toEqual([]);
  });
});

describe('isSkipped / folderOf', () => {
  it('skips hidden entries and node_modules', () => {
    for (const name of ['.git', '.github', '.notes.md', 'node_modules', 'vendor', 'dist', 'target', '__pycache__', 'a/b']) expect(isSkipped(name)).toBe(true);
    for (const name of ['docs', 'README.md', 'node_modules2']) expect(isSkipped(name)).toBe(false);
  });

  it('returns the folder of a file URL, ignoring query and hash', () => {
    expect(folderOf('file:///home/u/docs/README.md#intro')).toBe(ROOT);
    expect(folderOf('file:///C:/Users/u/a.md?x=1')).toBe('file:///C:/Users/u/');
  });
});

describe('chooseRoot / relativePath', () => {
  it('keeps the stored root for the same folder or one below it', () => {
    expect(chooseRoot('file:///a/b/', 'file:///a/b/')).toBe('file:///a/b/');
    expect(chooseRoot('file:///a/b/', 'file:///a/b/c/d/')).toBe('file:///a/b/');
  });

  it('starts over at a sibling or parent folder, or without a stored root', () => {
    expect(chooseRoot('file:///a/b/', 'file:///a/x/')).toBe('file:///a/x/');
    expect(chooseRoot('file:///a/b/', 'file:///a/')).toBe('file:///a/');
    expect(chooseRoot(undefined, 'file:///a/')).toBe('file:///a/');
  });

  it('does not treat a folder sharing a name prefix as below the root', () => {
    expect(chooseRoot('file:///a/b/', 'file:///a/bc/')).toBe('file:///a/bc/');
    expect(chooseRoot('file:///a/b', 'file:///a/bc/')).toBe('file:///a/bc/');
  });

  it('returns the decoded path below the root', () => {
    expect(relativePath(ROOT, `${ROOT}README.md`)).toBe('README.md');
    expect(relativePath(ROOT, `${ROOT}sub%20dir/deep%20%231.md#x`)).toBe('sub dir/deep #1.md');
  });
});

describe('listMarkdownTree', () => {
  it('walks subfolders breadth-first, keeping only Markdown files and skipping hidden / node_modules', async () => {
    const { fetched, fetchText } = fakeFs({
      [ROOT]: [
        ['README.md', false],
        ['notes.MARKDOWN', false],
        ['image.png', false],
        ['guide', true],
        ['node_modules', true],
        ['.git', true],
        ['.hidden.md', false],
      ],
      [`${ROOT}guide/`]: [
        ['intro.mkd', false],
        ['my folder', true],
      ],
      [`${ROOT}guide/my%20folder/`]: [['a#b.md', false]],
    });
    expect(await listMarkdownTree(ROOT, fetchText)).toEqual({
      paths: ['README.md', 'notes.MARKDOWN', 'guide/intro.mkd', 'guide/my folder/a#b.md'],
      truncated: false,
    });
    expect(fetched).toEqual([ROOT, `${ROOT}guide/`, `${ROOT}guide/my%20folder/`]);
  });

  it('never reads above the root, even when the listing has a parent row', async () => {
    const { fetched, fetchText } = fakeFs({ [ROOT]: [['a.md', false]] });
    await listMarkdownTree(ROOT, fetchText);
    expect(fetched).toEqual([ROOT]);
  });

  it('stops at the depth limit and reports truncation', async () => {
    const { fetched, fetchText } = fakeFs({
      [ROOT]: [['a', true]],
      [`${ROOT}a/`]: [['b', true], ['1.md', false]],
      [`${ROOT}a/b/`]: [['2.md', false]],
    });
    const res = await listMarkdownTree(ROOT, fetchText, { maxDepth: 1, maxFiles: 100, maxDirs: 100 });
    expect(res).toEqual({ paths: ['a/1.md'], truncated: true });
    expect(fetched).not.toContain(`${ROOT}a/b/`);
  });

  it('stops at the file limit', async () => {
    const { fetchText } = fakeFs({ [ROOT]: [['1.md', false], ['2.md', false], ['3.md', false]] });
    expect(await listMarkdownTree(ROOT, fetchText, { maxDepth: 4, maxFiles: 2, maxDirs: 100 })).toEqual({
      paths: ['1.md', '2.md'],
      truncated: true,
    });
  });

  it('is not truncated when the file count equals the limit', async () => {
    const { fetchText } = fakeFs({ [ROOT]: [['1.md', false], ['2.md', false]] });
    expect((await listMarkdownTree(ROOT, fetchText, { maxDepth: 4, maxFiles: 2, maxDirs: 100 })).truncated).toBe(false);
  });

  it('stops at the folder limit', async () => {
    const { fetched, fetchText } = fakeFs({
      [ROOT]: [['a', true], ['b', true], ['0.md', false]],
      [`${ROOT}a/`]: [['1.md', false]],
      [`${ROOT}b/`]: [['2.md', false]],
    });
    const res = await listMarkdownTree(ROOT, fetchText, { maxDepth: 4, maxFiles: 100, maxDirs: 2 });
    expect(res).toEqual({ paths: ['0.md', 'a/1.md'], truncated: true });
    expect(fetched).toHaveLength(2);
  });

  it('skips unreadable subfolders but rejects when the root cannot be read', async () => {
    const { fetchText } = fakeFs({ [ROOT]: [['gone', true], ['a.md', false]] });
    expect(await listMarkdownTree(ROOT, fetchText)).toEqual({ paths: ['a.md'], truncated: false });
    await expect(listMarkdownTree('file:///nope/', fetchText)).rejects.toThrow('not found');
  });

  it('never reads hidden folders (decoded, root-relative) or anything below them', async () => {
    const { fetched, fetchText } = fakeFs({
      [ROOT]: [['README.md', false], ['my src', true], ['docs', true]],
      [`${ROOT}my%20src/`]: [['a.md', false]],
      [`${ROOT}docs/`]: [['old', true], ['oldies', true], ['b.md', false]],
      [`${ROOT}docs/old/`]: [['c.md', false]],
      [`${ROOT}docs/oldies/`]: [['d.md', false]],
    });
    const res = await listMarkdownTree(ROOT, fetchText, undefined, ['my src', 'docs/old']);
    expect(res).toEqual({ paths: ['README.md', 'docs/b.md', 'docs/oldies/d.md'], truncated: false });
    expect(fetched).toEqual([ROOT, `${ROOT}docs/`, `${ROOT}docs/oldies/`]);
  });
});
