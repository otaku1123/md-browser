import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let hidden = false;

beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.head.innerHTML = '<link rel="icon" href="/favicon.ico">';
  vi.resetModules();
});
afterEach(() => {
  document.head.innerHTML = '';
});

function setHidden(next: boolean): void {
  hidden = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

function iconSvg(): string {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  expect(links).toHaveLength(1);
  return decodeURIComponent(links[0].href.replace(/^data:image\/svg\+xml,/, ''));
}

describe('favicon', () => {
  it('draws a dot only for the updated and error states', async () => {
    const { faviconSvg } = await import('../../src/core/favicon');
    expect(faviconSvg('normal')).not.toContain('<circle');
    expect(faviconSvg('updated')).toContain('#f59e0b');
    expect(faviconSvg('error')).toContain('#e5484d');
    expect(faviconSvg('normal')).toContain('prefers-color-scheme:dark');
  });

  it('replaces existing icons with its own', async () => {
    const { initFavicon } = await import('../../src/core/favicon');
    initFavicon();
    expect(iconSvg()).not.toContain('<circle');
  });

  it('flags updates only while hidden, and clears them once the tab is shown', async () => {
    const { initFavicon, faviconUpdated } = await import('../../src/core/favicon');
    initFavicon();
    faviconUpdated();
    expect(iconSvg()).not.toContain('<circle');

    setHidden(true);
    faviconUpdated();
    expect(iconSvg()).toContain('#f59e0b');

    setHidden(false);
    expect(iconSvg()).not.toContain('<circle');
  });

  it('shows errors over updates until cleared', async () => {
    const { initFavicon, faviconUpdated, faviconError } = await import('../../src/core/favicon');
    initFavicon();
    setHidden(true);
    faviconUpdated();
    faviconError(true);
    expect(iconSvg()).toContain('#e5484d');
    faviconError(false);
    expect(iconSvg()).toContain('#f59e0b');
  });
});
