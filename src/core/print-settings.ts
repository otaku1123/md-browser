// Print / PDF options ("Save as PDF" is the browser's print dialog, export-html.ts explains why):
// paper size, orientation and margins as an @page rule, plus the link URLs after links, a table
// of contents at the top and a page break before each h1 after the first. The rules are written
// to a <style> from the saved settings; the TOC is part of the rendered document (printToc())
// and hidden on screen, so it is there whichever way the page is printed.
import { t } from '../i18n';
import type { TocItem } from './render';
import { createSettingsStore, type SettingsStore } from './settings-store';

export const PAPERS = { a4: 'A4', letter: 'letter' } as const;
export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export const MARGINS = { narrow: '8mm', normal: '15mm', wide: '25mm' } as const;

export type Paper = keyof typeof PAPERS;
export type Orientation = (typeof ORIENTATIONS)[number];
export type Margin = keyof typeof MARGINS;

export interface PrintSettings {
  paper: Paper;
  orientation: Orientation;
  margin: Margin;
  /** Write each external link's URL after its text. */
  linkUrls: boolean;
  /** Show the table of contents at the top of the document. */
  toc: boolean;
  /** Start a new page before every h1 after the first. */
  breakBeforeH1: boolean;
}

export const PRINT_KEY = 'md-browser:print';
export const STYLE_ID = 'md-print-css';
/** Set on <html> while the TOC option is on: the print stylesheet shows .print-toc for it. */
export const TOC_ATTR = 'data-print-toc';

export const DEFAULT_PRINT: PrintSettings = { paper: 'a4', orientation: 'portrait', margin: 'normal', linkUrls: false, toc: false, breakBeforeH1: false };

export function normalizePrintSettings(raw: unknown): PrintSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PrintSettings, unknown>>;
  return {
    paper: typeof o.paper === 'string' && Object.hasOwn(PAPERS, o.paper) ? (o.paper as Paper) : 'a4',
    orientation: (ORIENTATIONS as readonly unknown[]).includes(o.orientation) ? (o.orientation as Orientation) : 'portrait',
    margin: typeof o.margin === 'string' && Object.hasOwn(MARGINS, o.margin) ? (o.margin as Margin) : 'normal',
    linkUrls: o.linkUrls === true,
    toc: o.toc === true,
    breakBeforeH1: o.breakBeforeH1 === true,
  };
}

/** The print rules for these settings (style.css holds the ones that always apply). */
export function printCss(s: PrintSettings): string {
  const rules = [`@page { size: ${PAPERS[s.paper]} ${s.orientation}; margin: ${MARGINS[s.margin]}; }`];
  if (s.linkUrls) {
    // Links around an image alone have no text to follow; in-page (#…) links are not addresses.
    rules.push(
      '@media print { .markdown-body a[href^="http"]:not(:has(> img:only-child))::after { content: " (" attr(href) ")"; font-size: 0.85em; color: #555; overflow-wrap: anywhere; } }',
    );
  }
  if (s.breakBeforeH1) rules.push('@media print { .markdown-body h1:not(:first-of-type) { break-before: page; } }');
  return rules.join('\n');
}

/** Writes the rules to the page and flags the TOC option on <html>. */
export function applyPrintSettings(s: PrintSettings, doc: Document = document): void {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.append(style);
  }
  const css = printCss(s);
  if (style.textContent !== css) style.textContent = css;
  if (s.toc) doc.documentElement.setAttribute(TOC_ATTR, '');
  else doc.documentElement.removeAttribute(TOC_ATTR);
}

/** A plain list of heading links, indented by level (style.css: .toc-list); the export uses it too. */
export function tocList(items: readonly TocItem[], doc: Document = document): HTMLOListElement {
  const list = doc.createElement('ol');
  list.className = 'toc-list';
  for (const item of items) {
    const li = doc.createElement('li');
    li.className = `toc-level-${item.level}`;
    const a = doc.createElement('a');
    a.href = `#${item.id}`;
    a.textContent = item.text;
    li.append(a);
    list.append(li);
  }
  return list;
}

/**
 * The table of contents for the top of a printed document (shown by the print stylesheet when
 * the option is on; never on screen).
 */
export function printToc(items: readonly TocItem[], doc: Document = document): HTMLElement {
  const nav = doc.createElement('nav');
  nav.className = 'print-toc';
  nav.setAttribute('aria-hidden', 'true');
  const title = doc.createElement('p');
  title.className = 'print-toc-title';
  title.textContent = t('toc');
  nav.append(title, tocList(items, doc));
  return nav;
}

export function printSettingsStore(): SettingsStore<PrintSettings> {
  return createSettingsStore(PRINT_KEY, normalizePrintSettings);
}
