import { describe, expect, it } from 'vitest';
import { isRelativeRef, resolvePath, resolveImages, resolveSrcset } from '../../src/core/assets';

describe('isRelativeRef', () => {
  it.each(['img/a.png', './a.png', '../a.png', 'a b.png'])('treats %s as relative', (ref) => {
    expect(isRelativeRef(ref)).toBe(true);
  });
  it.each(['', 'https://example.com/a.png', '//cdn.example/a.png', 'data:image/png;base64,AA', '#anchor', 'mailto:a@b'])(
    'treats %j as not relative',
    (ref) => expect(isRelativeRef(ref)).toBe(false),
  );
});

describe('resolvePath', () => {
  it('resolves against the document directory', () => {
    expect(resolvePath('docs/guide.md', 'img/a.png')).toBe('docs/img/a.png');
    expect(resolvePath('docs/guide.md', './a.png')).toBe('docs/a.png');
    expect(resolvePath('docs/guide.md', '../img/a.png')).toBe('img/a.png');
    expect(resolvePath('README.md', 'docs/other.md')).toBe('docs/other.md');
  });

  it('treats a leading slash as the opened folder root', () => {
    expect(resolvePath('docs/guide.md', '/img/a.png')).toBe('img/a.png');
  });

  it('decodes percent-encoding and drops query / hash', () => {
    expect(resolvePath('a.md', 'my%20image.png?v=1#x')).toBe('my image.png');
    expect(resolvePath('a.md', '100%.png')).toBe('100%.png');
  });

  it('refuses paths that escape the opened folder', () => {
    expect(resolvePath('README.md', '../secret.txt')).toBeNull();
    expect(resolvePath('docs/a.md', '../../etc/passwd')).toBeNull();
    expect(resolvePath('docs/a.md', '%2e%2e/%2e%2e/x')).toBeNull();
  });
});

describe('resolveSrcset', () => {
  const resolver = async (ref: string) => (ref.includes('missing') ? null : `blob:${ref}`);

  it('rewrites each relative candidate and keeps the descriptors', async () => {
    expect(await resolveSrcset('img/a.png', resolver)).toBe('blob:img/a.png');
    expect(await resolveSrcset('img/a.png 1x, img/a@2x.png 2x', resolver)).toBe('blob:img/a.png 1x, blob:img/a@2x.png 2x');
    expect(await resolveSrcset('https://x/a.png 1x, img/b.png 2x', resolver)).toBe('https://x/a.png 1x, blob:img/b.png 2x');
  });

  it('gives up when a candidate cannot be resolved or there is no resolver', async () => {
    expect(await resolveSrcset('img/a.png, img/missing.png', resolver)).toBeNull();
    expect(await resolveSrcset('img/a.png', null)).toBeNull();
    expect(await resolveSrcset('https://x/a.png', null)).toBe('https://x/a.png');
  });
});

describe('resolveImages', () => {
  const resolver = async (ref: string) => (ref.includes('missing') ? null : `blob:${ref}`);

  it('resolves <img src> and <picture> sources, dropping a source it cannot resolve', async () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<picture><source media="(prefers-color-scheme: dark)" srcset="img/dark.png"><source srcset="img/missing.png"><img src="img/light.png#gh-light-mode-only"></picture>' +
      '<img src="img/missing.png" alt="x"><img src="https://x/a.png">';
    await resolveImages(root, resolver);
    expect([...root.querySelectorAll('source')].map((s) => s.getAttribute('srcset'))).toEqual(['blob:img/dark.png']);
    expect(root.querySelector('picture img')!.getAttribute('src')).toBe('blob:img/light.png#gh-light-mode-only');
    const missing = root.querySelector('img[alt]')!;
    expect(missing.classList.contains('img-missing')).toBe(true);
    expect(missing.hasAttribute('src')).toBe(false);
    expect(root.querySelector('img[src^="https"]')!.getAttribute('src')).toBe('https://x/a.png');
  });
});
