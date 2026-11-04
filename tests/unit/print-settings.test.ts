import { afterEach, describe, expect, it } from 'vitest';
import { applyPrintSettings, DEFAULT_PRINT, normalizePrintSettings, printCss, printToc, STYLE_ID, TOC_ATTR } from '../../src/core/print-settings';

describe('normalizePrintSettings', () => {
  it('defaults to A4 portrait with normal margins and no extras', () => {
    for (const raw of [undefined, null, 'x', [], {}]) expect(normalizePrintSettings(raw)).toEqual(DEFAULT_PRINT);
  });

  it('keeps known values and drops the rest', () => {
    expect(normalizePrintSettings({ paper: 'letter', orientation: 'landscape', margin: 'wide', linkUrls: true, toc: true, breakBeforeH1: true })).toEqual({
      paper: 'letter',
      orientation: 'landscape',
      margin: 'wide',
      linkUrls: true,
      toc: true,
      breakBeforeH1: true,
    });
    expect(normalizePrintSettings({ paper: 'b5', orientation: 'up', margin: '__proto__', linkUrls: 'yes', toc: 1 })).toEqual(DEFAULT_PRINT);
  });
});

describe('printCss', () => {
  it('writes the page size and margins', () => {
    expect(printCss(DEFAULT_PRINT)).toBe('@page { size: A4 portrait; margin: 15mm; }');
    expect(printCss({ ...DEFAULT_PRINT, paper: 'letter', orientation: 'landscape', margin: 'narrow' })).toBe('@page { size: letter landscape; margin: 8mm; }');
  });

  it('adds the link URLs and the page breaks only when asked', () => {
    const all = printCss({ ...DEFAULT_PRINT, linkUrls: true, breakBeforeH1: true });
    expect(all).toContain('a[href^="http"]');
    expect(all).toContain('attr(href)');
    expect(all).toContain('h1:not(:first-of-type) { break-before: page; }');
    expect(printCss({ ...DEFAULT_PRINT, toc: true })).not.toContain('@media print');
  });
});

describe('applyPrintSettings', () => {
  afterEach(() => {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.removeAttribute(TOC_ATTR);
  });

  it('keeps one <style> up to date and flags the TOC option on <html>', () => {
    applyPrintSettings({ ...DEFAULT_PRINT, toc: true });
    applyPrintSettings({ ...DEFAULT_PRINT, toc: true, margin: 'wide' });
    const styles = document.querySelectorAll(`#${STYLE_ID}`);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('margin: 25mm');
    expect(document.documentElement.hasAttribute(TOC_ATTR)).toBe(true);
    applyPrintSettings(DEFAULT_PRINT);
    expect(document.documentElement.hasAttribute(TOC_ATTR)).toBe(false);
  });
});

describe('printToc', () => {
  it('lists the headings as links, indented by level, hidden from assistive technology', () => {
    const nav = printToc([
      { level: 1, text: 'Title', id: 'title' },
      { level: 2, text: '日本語', id: '%E6%97%A5%E6%9C%AC%E8%AA%9E' },
    ]);
    expect(nav.className).toBe('print-toc');
    expect(nav.getAttribute('aria-hidden')).toBe('true');
    expect([...nav.querySelectorAll('li')].map((li) => [li.className, li.querySelector('a')?.getAttribute('href'), li.textContent])).toEqual([
      ['toc-level-1', '#title', 'Title'],
      ['toc-level-2', '#%E6%97%A5%E6%9C%AC%E8%AA%9E', '日本語'],
    ]);
  });
});
