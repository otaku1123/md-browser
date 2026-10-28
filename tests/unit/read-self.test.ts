import { describe, expect, it, vi } from 'vitest';
import { readSelf, sha256Hex } from '../../src/extension/read-self';

const fetchOf = (body: string) =>
  vi.fn(async () => new Response(new TextEncoder().encode(body))) as unknown as typeof fetch;

describe('readSelf', () => {
  it('returns text and hash when the page has no version yet', async () => {
    const res = await readSelf(fetchOf('# hi'), 'file:///a.md');
    expect(res).toMatchObject({ ok: true, text: '# hi' });
    expect((res as { hash: string }).hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers unchanged, without text, when the known hash matches', async () => {
    const first = await readSelf(fetchOf('# hi'), 'file:///a.md');
    const hash = (first as { hash: string }).hash;
    const res = await readSelf(fetchOf('# hi'), 'file:///a.md', hash);
    expect(res).toEqual({ ok: true, unchanged: true });
    expect(res).not.toHaveProperty('text');
  });

  it('returns the new text when the known hash is stale', async () => {
    const res = await readSelf(fetchOf('# new'), 'file:///a.md', 'deadbeef');
    expect(res).toMatchObject({ ok: true, text: '# new' });
  });

  it('fetches without the cache', async () => {
    const f = fetchOf('x');
    await readSelf(f, 'file:///a.md');
    expect(f).toHaveBeenCalledWith('file:///a.md', { cache: 'no-store' });
  });

  it('maps a fetch failure to an error response', async () => {
    const f = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;
    expect(await readSelf(f, 'file:///a.md')).toEqual({ ok: false, error: 'Error: boom' });
  });

  it('hashes UTF-8 bytes stably and decodes non-ASCII text', async () => {
    const a = await readSelf(fetchOf('日本語'), 'file:///a.md');
    const b = await readSelf(fetchOf('日本語'), 'file:///a.md');
    expect(a).toMatchObject({ ok: true, text: '日本語' });
    expect(a).toEqual(b);
  });

  it('matches the hash the page computes from the text it shows', async () => {
    const shown = await sha256Hex(new TextEncoder().encode('# 見出し\n'));
    expect(await readSelf(fetchOf('# 見出し\n'), 'file:///a.md', shown)).toEqual({ ok: true, unchanged: true });
  });
});
