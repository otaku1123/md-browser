import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DARK_BOX_OPACITY, dimSequenceBoxes, withTheme } from '../../src/core/diagrams';

// jsdom has no matchMedia: fake the OS setting and let tests flip it.
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
});

describe('theme', () => {
  it('normalizes unknown stored values to auto', async () => {
    const { normalizeTheme } = await import('../../src/core/theme');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('blue')).toBe('auto');
    expect(normalizeTheme(null)).toBe('auto');
  });

  it('pins the theme with data-theme and follows the OS on auto', async () => {
    const { applyTheme, currentTheme } = await import('../../src/core/theme');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(currentTheme()).toBe('dark');
    applyTheme('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(currentTheme()).toBe('light');
    setOsDark(true);
    expect(currentTheme()).toBe('dark');
  });

  it('notifies only when the shown theme actually changes', async () => {
    const { applyTheme, onThemeChange } = await import('../../src/core/theme');
    const seen: string[] = [];
    onThemeChange((th) => seen.push(th));
    applyTheme('light'); // OS is light: nothing changes on screen
    setOsDark(true); // pinned to light: still nothing
    applyTheme('auto'); // now follows the dark OS
    setOsDark(false);
    applyTheme('dark');
    expect(seen).toEqual(['dark', 'light', 'dark']);
  });
});

describe('withTheme', () => {
  it('prepends the theme directive', () => {
    expect(withTheme('graph LR\n  A --> B', 'dark')).toBe('%%{init: {"theme": "dark"}}%%\ngraph LR\n  A --> B');
  });

  it('keeps Mermaid front matter first', () => {
    const src = '---\ntitle: Flow\n---\ngraph LR\n  A --> B';
    expect(withTheme(src, 'light')).toBe('---\ntitle: Flow\n---\n%%{init: {"theme": "default"}}%%\ngraph LR\n  A --> B');
  });
});

describe('dimSequenceBoxes', () => {
  const svg = (role: string) =>
    new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" aria-roledescription="${role}">` +
        '<rect class="rect" fill="rgb(220,232,250)"/><rect class="actor" fill="#eaeaea"/></svg>',
      'image/svg+xml',
    ).documentElement as unknown as SVGSVGElement;

  it('lets only a little of the box / rect colours through in sequence diagrams', () => {
    const el = svg('sequence');
    dimSequenceBoxes(el);
    expect(el.querySelector('rect.rect')!.getAttribute('fill-opacity')).toBe(String(DARK_BOX_OPACITY));
    expect(el.querySelector('rect.actor')!.hasAttribute('fill-opacity')).toBe(false); // themed by Mermaid
  });

  it('leaves other diagram types alone (pie charts also use rect.rect)', () => {
    const el = svg('pie');
    dimSequenceBoxes(el);
    expect(el.querySelector('rect.rect')!.hasAttribute('fill-opacity')).toBe(false);
  });
});
