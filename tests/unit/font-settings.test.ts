import { afterEach, describe, expect, it } from 'vitest';
import { applyFonts, normalizeFontSettings, sanitizeFontName } from '../../src/core/font-settings';
import { prepareMediaSizes } from '../../src/core/media-sizes';

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

const DEFAULTS = { body: '', code: '', size: 'normal', width: 'normal', image: 100 } as const;

describe('normalizeFontSettings', () => {
  it('keeps an image scale from the list', () => {
    for (const image of [50, 75, 100, 150, 200]) expect(normalizeFontSettings({ image }).image).toBe(image);
  });

  it('migrates the old image size caps to scales', () => {
    expect(normalizeFontSettings({ image: 'normal' }).image).toBe(100);
    expect(normalizeFontSettings({ image: 'large' }).image).toBe(100);
    expect(normalizeFontSettings({ image: 'medium' }).image).toBe(75);
    expect(normalizeFontSettings({ image: 'small' }).image).toBe(50);
  });

  it('falls back to 100% for anything else', () => {
    for (const image of [undefined, 120, '150', 'huge', '__proto__', 'toString', null]) {
      expect(normalizeFontSettings({ image }).image).toBe(100);
    }
    expect(normalizeFontSettings(null)).toEqual(DEFAULTS);
  });
});

describe('applyFonts', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('sets the CSS variables with the default stack as fallback', () => {
    applyFonts({ ...DEFAULTS, body: 'Georgia', code: 'Menlo' });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--font-body')).toBe('"Georgia", var(--font-body-default)');
    expect(style.getPropertyValue('--font-code')).toBe('"Menlo", var(--font-code-default)');
  });

  it('removes the override when a font is cleared', () => {
    applyFonts({ ...DEFAULTS, body: 'Georgia', code: 'Menlo' });
    applyFonts(DEFAULTS);
    expect(document.documentElement.style.getPropertyValue('--font-body')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--font-code')).toBe('');
  });

  it('sets the document size and width, and clears them on default', () => {
    const style = document.documentElement.style;
    applyFonts({ ...DEFAULTS, size: 'large', width: 'full' });
    expect(style.getPropertyValue('--doc-font-size')).toBe('18px');
    expect(style.getPropertyValue('--doc-max-width')).toBe('none');
    applyFonts(DEFAULTS);
    expect(style.getPropertyValue('--doc-font-size')).toBe('');
    expect(style.getPropertyValue('--doc-max-width')).toBe('');
  });

  it('scales document images by the image setting', () => {
    document.body.innerHTML = '<p><img src="a.png" width="200"></p>';
    prepareMediaSizes(document.body);
    applyFonts({ ...DEFAULTS, image: 50 });
    expect(document.querySelector('img')!.style.getPropertyValue('--media-w')).toBe('100px');
    applyFonts(DEFAULTS);
    expect(document.querySelector('img')!.style.getPropertyValue('--media-w')).toBe('200px');
    expect(document.documentElement.style.getPropertyValue('--doc-img-max')).toBe('');
    document.body.replaceChildren();
  });
});
