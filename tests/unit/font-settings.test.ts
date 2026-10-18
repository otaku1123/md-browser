import { afterEach, describe, expect, it } from 'vitest';
import { applyFonts, sanitizeFontName } from '../../src/core/font-settings';

describe('sanitizeFontName', () => {
  it('keeps ordinary font names', () => {
    expect(sanitizeFontName('  Hiragino Sans ')).toBe('Hiragino Sans');
    expect(sanitizeFontName('BIZ UDPゴシック')).toBe('BIZ UDPゴシック');
  });

  it('strips characters that could break out of a CSS string', () => {
    expect(sanitizeFontName('Georgia"; } body { display:none }')).toBe('Georgia  body  display:none');
    expect(sanitizeFontName("a'b\\c<d>e\nf")).toBe('abcdef');
  });

  it('rejects non-strings and limits length', () => {
    expect(sanitizeFontName(undefined)).toBe('');
    expect(sanitizeFontName({ toString: () => 'x' })).toBe('');
    expect(sanitizeFontName('x'.repeat(500))).toHaveLength(100);
  });
});

describe('applyFonts', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('sets the CSS variables with the default stack as fallback', () => {
    applyFonts({ body: 'Georgia', code: 'Menlo' });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--font-body')).toBe('"Georgia", var(--font-body-default)');
    expect(style.getPropertyValue('--font-code')).toBe('"Menlo", var(--font-code-default)');
  });

  it('removes the override when a font is cleared', () => {
    applyFonts({ body: 'Georgia', code: 'Menlo' });
    applyFonts({ body: '', code: '' });
    expect(document.documentElement.style.getPropertyValue('--font-body')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--font-code')).toBe('');
  });
});
