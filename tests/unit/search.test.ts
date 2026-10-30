import { describe, expect, it } from 'vitest';
import { foldText, lineContexts, MAX_DOC_CHARS, parseQuery, searchDocs, searchText } from '../../src/core/search';

const DOC = [
  '---',
  'title: BLE notes',
  '# not a heading',
  '---',
  '# BLE 接続',
  '',
  'Reconnect after a drop. ＢＬＥ の再接続は 3 秒待つ。',
  '',
  '## 手順 ##',
  '',
  '```js',
  '# ble.reconnect()',
  'const x = reconnect();',
  '```',
  '',
  '    indented reconnect',
  '~~~',
  '## inside tilde fence',
  'reconnect here',
  '~~~',
  '### おわりに',
  'ﾊﾟｹｯﾄを再送する。',
].join('\n');

const hit = (text: string, q: string) => searchText(text, parseQuery(q));

describe('parseQuery', () => {
  it('folds case and width, splits at any space and drops duplicates', () => {
    expect(parseQuery('  BLE　ｂｌｅ Reconnect\t')).toEqual(['ble', 'reconnect']);
    expect(parseQuery('')).toEqual([]);
    expect(parseQuery('　 ')).toEqual([]);
  });
});

describe('foldText', () => {
  it('maps every folded character back to its original offset', () => {
    const { folded, map } = foldText('aＢ①c');
    expect(folded).toBe('ab1c');
    expect(map).toEqual([0, 1, 2, 3, 4]);
    // An expanding character: all of its folded characters start where it starts.
    const wide = foldText('x㍿y');
    expect(wide.folded).toBe('x株式会社y');
    expect(wide.map).toEqual([0, 1, 1, 1, 1, 2, 3]);
  });

  it('composes a half-width voiced mark onto its letter', () => {
    const { folded, map } = foldText('ﾊﾟﾝ');
    expect(folded).toBe('パン');
    expect(map).toEqual([0, 2, 3]);
  });

  it('keeps astral characters as one unit', () => {
    const { folded, map } = foldText('a😀B');
    expect(folded).toBe('a😀b');
    expect(map).toEqual([0, 1, 1, 3, 4]);
  });
});

describe('lineContexts', () => {
  it('tracks the nearest heading, ignoring code fences and the front matter', () => {
    const ctx = lineContexts(DOC.split('\n'));
    expect(ctx[2]).toEqual({ heading: null, inCode: false }); // "# not a heading" in the front matter
    expect(ctx[4].heading).toBe('BLE 接続');
    expect(ctx[6]).toEqual({ heading: 'BLE 接続', inCode: false });
    expect(ctx[8].heading).toBe('手順'); // closing hashes dropped
    expect(ctx[11]).toEqual({ heading: '手順', inCode: true }); // "# ble.reconnect()" inside the fence
    expect(ctx[13]).toEqual({ heading: '手順', inCode: true }); // the closing fence line
    expect(ctx[15]).toEqual({ heading: '手順', inCode: false });
    expect(ctx[17]).toEqual({ heading: '手順', inCode: true }); // "## inside tilde fence"
    expect(ctx[21]).toEqual({ heading: 'おわりに', inCode: false });
  });

  it('closes a fence only with the same character and at least the same length', () => {
    const ctx = lineContexts(['````', '```', 'still code', '~~~~', '````', 'text', '# H', 'x']);
    expect(ctx.map((c) => c.inCode)).toEqual([true, true, true, true, true, false, false, false]);
    expect(ctx[7].heading).toBe('H');
  });

  it('handles CRLF lines and a heading without text', () => {
    const ctx = lineContexts(['#\r', 'x\r', '```\r', '# y\r', '```\r', 'z']);
    expect(ctx[1]).toEqual({ heading: '', inCode: false });
    expect(ctx[3].inCode).toBe(true);
    expect(ctx[5]).toEqual({ heading: '', inCode: false });
  });
});

describe('searchText', () => {
  it('finds a term regardless of case and width, with the heading and line of each hit', () => {
    const res = hit(DOC, 'ble')!;
    expect(res.total).toBe(4);
    expect(res.hits.map((h) => [h.line, h.heading, h.inCode])).toEqual([
      [2, null, false],
      [5, 'BLE 接続', false],
      [7, 'BLE 接続', false],
      [12, '手順', true],
    ]);
    const line7 = res.hits[2];
    expect(line7.excerpt).toBe('Reconnect after a drop. ＢＬＥ の再接続は 3 秒待つ。');
    expect(line7.ranges.map(([s, e]) => line7.excerpt.slice(s, e))).toEqual(['ＢＬＥ']);
  });

  it('matches a half-width katakana word with its full-width spelling and highlights the whole of it', () => {
    const res = hit(DOC, 'パケット')!;
    expect(res.hits).toHaveLength(1);
    const h = res.hits[0];
    expect(h.line).toBe(22);
    expect(h.excerpt.slice(...h.ranges[0])).toBe('ﾊﾟｹｯﾄ');
  });

  it('requires every term in the document, and lists the lines of any of them', () => {
    expect(hit(DOC, 'ble nothing-here')).toBeNull();
    const res = hit(DOC, 'reconnect 再送')!;
    expect(res.hits.map((h) => h.line)).toEqual([7, 12, 13, 16, 19, 22]);
    expect(res.hits[0].ranges).toEqual([[0, 9]]);
  });

  it('merges overlapping and repeated matches on a line', () => {
    const res = hit('aaa aa', 'aa a')!;
    expect(res.hits[0].ranges).toEqual([[0, 3], [4, 6]]);
  });

  it('strips the indentation and cuts a long line around the first match', () => {
    const long = `    ${'x'.repeat(300)} needle ${'y'.repeat(300)}`;
    const res = hit(long, 'needle')!;
    const h = res.hits[0];
    expect(h.excerpt.startsWith('…')).toBe(true);
    expect(h.excerpt.endsWith('…')).toBe(true);
    expect(h.excerpt.length).toBeLessThanOrEqual(202);
    expect(h.excerpt.slice(...h.ranges[0])).toBe('needle');
    const short = hit('  padded needle', 'needle')!.hits[0];
    expect(short.excerpt).toBe('padded needle');
    expect(short.ranges).toEqual([[7, 13]]);
  });

  it('keeps counting beyond the hit cap', () => {
    const text = Array.from({ length: 300 }, (_, i) => `line ${i} hit`).join('\n');
    const res = searchText(text, ['hit'], 10)!;
    expect(res.hits).toHaveLength(10);
    expect(res.total).toBe(300);
    expect(res.hits[9].line).toBe(10);
  });

  it('returns null for an empty query or a term found nowhere', () => {
    expect(searchText(DOC, [])).toBeNull();
    expect(hit(DOC, 'zzz')).toBeNull();
  });
});

describe('searchDocs', () => {
  const docs = [
    { path: 'b.md', text: 'ble once' },
    { path: 'a.md', text: 'ble\nble\nble' },
    { path: 'c.md', text: 'nothing' },
    { path: 'big.md', text: 'ble'.padEnd(MAX_DOC_CHARS + 1, ' ') },
  ];

  it('lists the documents with the most hits first and names the ones skipped for size', () => {
    const res = searchDocs(docs, 'BLE');
    expect(res.docs.map((d) => [d.path, d.total])).toEqual([
      ['a.md', 3],
      ['b.md', 1],
    ]);
    expect(res.skipped).toEqual(['big.md']);
  });

  it('is empty for a blank query', () => {
    expect(searchDocs(docs, ' 　')).toEqual({ docs: [], skipped: [] });
  });

  it('scans a folder-sized corpus quickly', () => {
    const para = 'ここは本文です。BLE の再接続シーケンスについて説明します。 The quick brown fox. ';
    const many = Array.from({ length: 500 }, (_, i) => ({ path: `d/${i}.md`, text: `# Doc ${i}\n\n${para.repeat(30)}\n` }));
    const start = performance.now();
    const res = searchDocs(many, '再接続 fox');
    const ms = performance.now() - start;
    expect(res.docs).toHaveLength(500);
    expect(res.docs[0].total).toBe(1);
    // ~1 M characters; the panel runs this on every keystroke (debounced).
    expect(ms).toBeLessThan(2000);
    console.log(`searchDocs over ${many.length} docs: ${ms.toFixed(0)} ms`);
  });
});
