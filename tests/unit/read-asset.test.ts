import { describe, expect, it, vi } from 'vitest';
import { ASSET_LIMITS, assetKind, isAssetPath, readAsset } from '../../src/extension/read-asset';
import { isBelowRoot, isDocPath } from '../../src/extension/dir-listing';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const fetchOf = (body: BufferSource | string, ok = true) =>
  vi.fn(async () => new Response(body, ok ? { status: 200 } : { status: 404 })) as unknown as typeof fetch;

describe('assetKind / isAssetPath', () => {
  it('names images and text files by their extension, in any case', () => {
    for (const p of ['a.png', 'img/b.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg', 'g.avif', 'h.bmp']) expect(assetKind(p), p).toBe('image');
    for (const p of ['a.puml', 'inc/b.PlantUML', 'c.iuml', 'd.pu', 'style/.md-browser.css']) expect(assetKind(p), p).toBe('text');
  });

  it('refuses every other kind of file, including documents and names without an extension', () => {
    for (const p of ['a.md', 'a.txt', 'a.html', 'a.js', 'a.png.exe', 'png', '.png', 'a.', 'a.ico', 'a.tiff', 'a.pdf']) expect(assetKind(p), p).toBeNull();
  });

  it('accepts only root-relative paths below the root', () => {
    expect(isAssetPath('a.png')).toBe(true);
    expect(isAssetPath('sub dir/deep #1.svg')).toBe(true);
    for (const bad of ['../x.png', 'a/../x.png', '/x.png', 'a//x.png', './x.png', '', 'x.png/', 'a\\x.png', 'x.md', 'x.txt']) {
      expect(isAssetPath(bad), bad).toBe(false);
    }
  });
});

describe('isBelowRoot', () => {
  it('bounds the number of segments, for documents too', () => {
    const deep = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`).join('/');
    expect(isBelowRoot(`${deep(31)}/x.png`)).toBe(true);
    expect(isBelowRoot(`${deep(32)}/x.png`)).toBe(false);
    expect(isDocPath(`${deep(32)}/x.md`)).toBe(false);
  });
});

describe('readAsset', () => {
  it('returns an image as a data: URL typed by its extension, with the hash', async () => {
    const f = fetchOf(PNG);
    const res = await readAsset(f, 'file:///docs/img/a.png', 'img/a.png');
    expect(res).toMatchObject({ ok: true, kind: 'image', data: `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}` });
    expect((res as { hash: string }).hash).toMatch(/^[0-9a-f]{64}$/);
    expect(f).toHaveBeenCalledWith('file:///docs/img/a.png', { cache: 'no-store' });
    expect((await readAsset(fetchOf(PNG), 'file:///a.svg', 'a.svg')) as { data: string }).toMatchObject({ data: expect.stringMatching(/^data:image\/svg\+xml;base64,/) });
  });

  it('returns a text file as text', async () => {
    expect(await readAsset(fetchOf('skinparam shadowing false\n'), 'file:///docs/inc/a.iuml', 'inc/a.iuml')).toMatchObject({
      ok: true,
      kind: 'text',
      data: 'skinparam shadowing false\n',
    });
  });

  it('answers unchanged, without data, when the known hash matches', async () => {
    const first = await readAsset(fetchOf(PNG), 'file:///a.png', 'a.png');
    const res = await readAsset(fetchOf(PNG), 'file:///a.png', 'a.png', (first as { hash: string }).hash);
    expect(res).toEqual({ ok: true, unchanged: true });
  });

  it('refuses a path of an unknown kind before reading, and files over the limit after', async () => {
    const f = fetchOf(PNG);
    expect(await readAsset(f, 'file:///a.md', 'a.md')).toEqual({ ok: false, error: 'bad path' });
    expect(f).not.toHaveBeenCalled();
    const big = new Uint8Array(ASSET_LIMITS.text + 1);
    expect(await readAsset(fetchOf(big), 'file:///a.css', 'a.css')).toEqual({ ok: false, error: 'too large' });
    expect(await readAsset(fetchOf(new Uint8Array(ASSET_LIMITS.text)), 'file:///a.css', 'a.css')).toMatchObject({ ok: true, kind: 'text' });
  });

  it('maps a missing file and a fetch failure to error responses', async () => {
    expect(await readAsset(fetchOf('', false), 'file:///a.png', 'a.png')).toEqual({ ok: false, error: 'HTTP 404' });
    const f = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;
    expect(await readAsset(f, 'file:///a.png', 'a.png')).toEqual({ ok: false, error: 'Error: boom' });
  });
});
