import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCustomCss, CUSTOM_CSS_KEY, CUSTOM_CSS_MAX, customCssStore, normalizeCustomCss, scopedCustomCss, STYLE_ID } from '../../src/core/custom-css';
import { createSettingsStore } from '../../src/core/settings-store';

describe('normalizeCustomCss', () => {
  it('defaults to an empty, applied, exported stylesheet', () => {
    for (const raw of [undefined, null, 'h1 {}', [], {}]) expect(normalizeCustomCss(raw)).toEqual({ css: '', enabled: true, exported: true });
  });

  it('keeps the text with tabs and newlines, drops other control characters, and limits the length', () => {
    expect(normalizeCustomCss({ css: 'h1 {\n\tcolor: red;\u0000\u0007\n}', enabled: false, exported: false })).toEqual({
      css: 'h1 {\n\tcolor: red;\n}',
      enabled: false,
      exported: false,
    });
    expect(normalizeCustomCss({ css: 'x'.repeat(CUSTOM_CSS_MAX + 10) }).css).toHaveLength(CUSTOM_CSS_MAX);
    expect(normalizeCustomCss({ css: 42, enabled: 'no', exported: 0 })).toEqual({ css: '', enabled: true, exported: true });
  });
});

describe('scopedCustomCss', () => {
  it('limits the stylesheet to the document root', () => {
    expect(scopedCustomCss({ css: 'h1 { color: red; }', enabled: true, exported: true })).toBe('@scope (.content) {\nh1 { color: red; }\n}');
  });

  it('is empty when switched off or blank', () => {
    expect(scopedCustomCss({ css: 'h1 { color: red; }', enabled: false, exported: true })).toBe('');
    expect(scopedCustomCss({ css: ' \n ', enabled: true, exported: true })).toBe('');
  });

  it('cannot close a <style> element it is written into', () => {
    const out = scopedCustomCss({ css: 'p::after { content: "</style><script>1</script>"; }', enabled: true, exported: true });
    expect(out).not.toContain('</');
    expect(out).toContain('<\\/style><script>1<\\/script>');
  });
});

describe('applyCustomCss', () => {
  afterEach(() => document.getElementById(STYLE_ID)?.remove());

  it('keeps one <style> at the end of <head> and updates it', () => {
    const own = document.createElement('style');
    document.head.append(own);
    applyCustomCss({ css: 'h1 { color: red; }', enabled: true, exported: true });
    applyCustomCss({ css: 'h1 { color: blue; }', enabled: true, exported: true });
    const styles = document.querySelectorAll(`#${STYLE_ID}`);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('color: blue');
    expect(own.nextElementSibling).toBe(styles[0]);
    applyCustomCss({ css: 'h1 { color: blue; }', enabled: false, exported: true });
    expect(styles[0].textContent).toBe('');
    own.remove();
  });
});

describe('customCssStore', () => {
  const g = globalThis as { chrome?: unknown };
  afterEach(() => {
    delete g.chrome;
    localStorage.clear();
  });

  it('uses localStorage without chrome.storage', async () => {
    const store = customCssStore();
    await store.save({ css: 'h1 {}', enabled: true, exported: false });
    expect(JSON.parse(localStorage.getItem(CUSTOM_CSS_KEY)!)).toEqual({ css: 'h1 {}', enabled: true, exported: false });
    expect(await store.load()).toEqual({ css: 'h1 {}', enabled: true, exported: false });
  });

  it('uses chrome.storage.local, not sync, and hears only changes of that area', async () => {
    const data: Record<string, Record<string, unknown>> = { local: {}, sync: {} };
    const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
    const area = (name: 'local' | 'sync') => ({
      get: vi.fn(async (key: string) => ({ [key]: data[name][key] })),
      set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(data[name], items)),
    });
    const chrome = { storage: { local: area('local'), sync: area('sync'), onChanged: { addListener: (cb: (typeof listeners)[number]) => listeners.push(cb) } } };
    g.chrome = chrome;

    const store = customCssStore();
    await store.save({ css: 'p {}', enabled: true, exported: true });
    expect(chrome.storage.local.set).toHaveBeenCalledOnce();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(await store.load()).toEqual({ css: 'p {}', enabled: true, exported: true });

    const seen: unknown[] = [];
    store.onChange((v) => seen.push(v));
    for (const l of listeners) l({ [CUSTOM_CSS_KEY]: { newValue: { css: 'a {}' } } }, 'sync');
    for (const l of listeners) l({ [CUSTOM_CSS_KEY]: { newValue: { css: 'b {}' } } }, 'local');
    expect(seen).toEqual([{ css: 'b {}', enabled: true, exported: true }]);

    // The default area is still sync.
    const other = createSettingsStore('k', (v) => v);
    await other.save(1);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ k: 1 });
  });
});
