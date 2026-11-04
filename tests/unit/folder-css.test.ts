import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCustomCss, STYLE_ID as CUSTOM_CSS_STYLE_ID } from '../../src/core/custom-css';
import {
  applyFolderCss,
  FOLDER_CSS_KEY,
  folderCssStore,
  folderCssUrls,
  normalizeFolderCssSettings,
  scopedFolderCss,
  STYLE_ID,
} from '../../src/core/folder-css';

describe('normalizeFolderCssSettings', () => {
  it('is off unless explicitly switched on', () => {
    for (const raw of [undefined, null, {}, [], 'yes', { enabled: 'yes' }, { enabled: 1 }, { enabled: false }]) {
      expect(normalizeFolderCssSettings(raw)).toEqual({ enabled: false });
    }
    expect(normalizeFolderCssSettings({ enabled: true })).toEqual({ enabled: true });
  });
});

describe('scopedFolderCss', () => {
  it('limits the stylesheet to the document root and is empty when blank', () => {
    expect(scopedFolderCss('h1 { color: red; }')).toBe('@scope (.content) {\nh1 { color: red; }\n}');
    expect(scopedFolderCss(' \n ')).toBe('');
  });

  it('cannot close a <style> element it is written into', () => {
    expect(scopedFolderCss('p::after { content: "</style>"; }')).toContain('<\\/style>');
  });
});

describe('applyFolderCss', () => {
  afterEach(() => {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CUSTOM_CSS_STYLE_ID)?.remove();
  });

  it('goes before the custom CSS, whichever is applied first, and is updated in place', () => {
    applyCustomCss({ css: 'h1 { color: blue; }', enabled: true, exported: true });
    applyFolderCss('h1 { color: red; }');
    const folder = document.getElementById(STYLE_ID)!;
    expect(folder.nextElementSibling).toBe(document.getElementById(CUSTOM_CSS_STYLE_ID));
    expect(folder.textContent).toBe('@scope (.content) {\nh1 { color: red; }\n}');
    applyFolderCss('h1 { color: green; }');
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(folder.textContent).toContain('green');

    document.getElementById(STYLE_ID)!.remove();
    document.getElementById(CUSTOM_CSS_STYLE_ID)!.remove();
    applyFolderCss('h1 { color: red; }');
    applyCustomCss({ css: 'h1 { color: blue; }', enabled: true, exported: true });
    expect(document.getElementById(STYLE_ID)!.nextElementSibling).toBe(document.getElementById(CUSTOM_CSS_STYLE_ID));
  });

  it('removes the stylesheet for null or a blank one', () => {
    applyFolderCss('h1 {}');
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
    applyFolderCss(null);
    expect(document.getElementById(STYLE_ID)).toBeNull();
    applyFolderCss('h1 {}');
    applyFolderCss('  ');
    expect(document.getElementById(STYLE_ID)).toBeNull();
    applyFolderCss(null); // nothing to remove
  });
});

describe('folderCssUrls', () => {
  it('names the document folder first, then the root, once', () => {
    expect(folderCssUrls('file:///r/sub/', 'file:///r/')).toEqual(['file:///r/sub/.md-browser.css', 'file:///r/.md-browser.css']);
    expect(folderCssUrls('file:///r/', 'file:///r/')).toEqual(['file:///r/.md-browser.css']);
  });
});

describe('folderCssStore', () => {
  const g = globalThis as { chrome?: unknown };
  afterEach(() => {
    delete g.chrome;
    localStorage.clear();
  });

  it('defaults to off and uses the synced area', async () => {
    const data: Record<string, unknown> = {};
    const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
    const sync = {
      get: vi.fn(async (key: string) => ({ [key]: data[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(data, items)),
    };
    g.chrome = { storage: { sync, local: {}, onChanged: { addListener: (cb: (typeof listeners)[number]) => listeners.push(cb) } } };

    const store = folderCssStore();
    expect(await store.load()).toEqual({ enabled: false });
    await store.save({ enabled: true });
    expect(sync.set).toHaveBeenCalledWith({ [FOLDER_CSS_KEY]: { enabled: true } });
    expect(await store.load()).toEqual({ enabled: true });

    const seen: unknown[] = [];
    store.onChange((v) => seen.push(v));
    for (const l of listeners) l({ [FOLDER_CSS_KEY]: { newValue: { enabled: 'x' } } }, 'sync');
    for (const l of listeners) l({ [FOLDER_CSS_KEY]: { newValue: { enabled: true } } }, 'local');
    expect(seen).toEqual([{ enabled: false }]);
  });
});
