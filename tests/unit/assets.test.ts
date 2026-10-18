import { describe, expect, it } from 'vitest';
import { isRelativeRef, resolvePath } from '../../src/core/assets';

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
