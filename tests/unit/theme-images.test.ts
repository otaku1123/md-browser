import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no matchMedia: fake the OS setting and let tests flip it (see theme.test.ts).
let osDark = false;
const mqlListeners = new Set<() => void>();
function setOsDark(dark: boolean): void {
  osDark = dark;
  for (const cb of mqlListeners) cb();
}

beforeEach(() => {
  osDark = false;
  mqlListeners.clear();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return osDark;
    },
    addEventListener: (_: string, cb: () => void) => mqlListeners.add(cb),
  }));
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  document.body.innerHTML = '';
});

const DOC = [
  '<p><img src="img/light.png#gh-light-mode-only" alt="l"> <img src="img/dark.png#gh-dark-mode-only" alt="d"> <img src="img/both.png" alt="b"></p>',
  '<span class="media-frame"><img src="framed.png#gh-dark-mode-only" alt="f"></span>',
  '<span class="media-frame"><span class="media-scroll"><img src="scrolled.png#gh-dark-mode-only" alt="g"></span></span>',
  '<picture><source media="(prefers-color-scheme: dark)" srcset="dark.png"><source media="(min-width: 600px)" srcset="wide.png"><img src="light.png" alt="p"></picture>',
].join('');

const hidden = (root: ParentNode) =>
  [...root.querySelectorAll('img')].filter((i) => i.hidden || i.closest<HTMLElement>('.media-frame')?.hidden).map((i) => i.alt);
const media = (root: ParentNode) => [...root.querySelectorAll('source')].map((s) => s.getAttribute('media'));

describe('applyThemeImages', () => {
  it('hides the images for the other theme and marks them, keeping the frame in step', async () => {
    const { applyThemeImages, THEME_ONLY_ATTR } = await import('../../src/core/theme-images');
    document.body.innerHTML = DOC;
    applyThemeImages(document.body, 'light');
    expect(hidden(document.body)).toEqual(['d', 'f', 'g']);
    // The frame is hidden, not the image (or the scroller) inside.
    expect(document.body.querySelector<HTMLImageElement>('img[alt="f"]')!.hidden).toBe(false);
    expect(document.body.querySelector<HTMLImageElement>('img[alt="g"]')!.hidden).toBe(false);
    expect(document.body.querySelector<HTMLElement>('.media-scroll')!.hidden).toBe(false);
    expect([...document.body.querySelectorAll(`[${THEME_ONLY_ATTR}]`)].map((i) => i.getAttribute(THEME_ONLY_ATTR))).toEqual(['light', 'dark', 'dark', 'dark']);
    applyThemeImages(document.body, 'dark');
    expect(hidden(document.body)).toEqual(['l']);
  });

  it('still knows the theme of an image after its src was resolved to another URL', async () => {
    const { applyThemeImages } = await import('../../src/core/theme-images');
    document.body.innerHTML = DOC;
    applyThemeImages(document.body, 'light');
    document.body.querySelector<HTMLImageElement>('img[alt="d"]')!.src = 'blob:http://x/1';
    applyThemeImages(document.body, 'dark');
    expect(hidden(document.body)).toEqual(['l']);
  });

  it('picks the <picture> source by the shown theme and leaves other media queries to the browser', async () => {
    const { applyThemeImages } = await import('../../src/core/theme-images');
    document.body.innerHTML = DOC;
    applyThemeImages(document.body, 'dark');
    expect(media(document.body)).toEqual(['all', '(min-width: 600px)']);
    applyThemeImages(document.body, 'light');
    expect(media(document.body)).toEqual(['not all', '(min-width: 600px)']);
    expect(document.body.querySelector('source')!.getAttribute('data-media')).toBe('(prefers-color-scheme: dark)');
  });

  it('defaults to the theme the page shows', async () => {
    const { applyThemeImages } = await import('../../src/core/theme-images');
    document.documentElement.dataset.theme = 'dark';
    document.body.innerHTML = DOC;
    applyThemeImages(document.body);
    expect(hidden(document.body)).toEqual(['l']);
    expect(media(document.body)[0]).toBe('all');
  });
});

describe('watchThemeImages', () => {
  it('follows theme changes and uses the light images while printing', async () => {
    const { applyTheme } = await import('../../src/core/theme');
    const { applyThemeImages, watchThemeImages } = await import('../../src/core/theme-images');
    document.body.innerHTML = DOC;
    applyThemeImages(document.body);
    watchThemeImages(document.body);
    expect(hidden(document.body)).toEqual(['d', 'f', 'g']);

    applyTheme('dark');
    expect(hidden(document.body)).toEqual(['l']);
    expect(media(document.body)[0]).toBe('all');

    window.dispatchEvent(new Event('beforeprint'));
    expect(hidden(document.body)).toEqual(['d', 'f', 'g']);
    expect(media(document.body)[0]).toBe('not all');
    window.dispatchEvent(new Event('afterprint'));
    expect(hidden(document.body)).toEqual(['l']);

    applyTheme('auto');
    expect(hidden(document.body)).toEqual(['d', 'f', 'g']);
    setOsDark(true);
    expect(hidden(document.body)).toEqual(['l']);
  });
});
