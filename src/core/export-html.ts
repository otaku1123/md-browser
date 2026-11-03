// Saves the rendered document as one self-contained .html: the page's stylesheet inline, the
// current theme / size / width / font settings applied, the viewer's controls (copy, heading links,
// size and save buttons) left out, and images embedded as data: URLs when they can be fetched
// (blob: and http(s) URLs). file:// images can't be fetched from a page, so they keep their absolute
// URL and still show when the file is opened on the same computer. Diagrams are inline SVG already.
// Downloads use a blob: URL and <a download>, like diagram-export.ts: no extension permission.
import css from '../style.css?inline';
import { tocList } from './print-settings';
import type { TocItem } from './render';
import { createSettingsStore, type SettingsStore } from './settings-store';
import { currentTheme, type Theme } from './theme';
import { applyThemeImages } from './theme-images';

// Controls the viewer adds to the rendered Markdown; none of them work without the page's scripts.
const CONTROL_SELECTORS = ['.copy-button', '.heading-link', '.media-size', '.diagram-actions', '.print-toc'];
// CSS variables font-settings.ts sets on <html>: carried over so the export looks like the page.
const ROOT_VARIABLES = ['--font-body', '--font-code', '--doc-font-size', '--doc-max-width'];
const EMBED_LIMIT = 20 * 1024 * 1024; // skip embedding an image bigger than this (the URL stays)
const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/** "current": the theme the page shows; "light": the light theme whatever the page shows. */
export type ExportTheme = 'current' | 'light';

/** The export choices in the display settings, saved with the other settings. */
export interface ExportSettings {
  theme: ExportTheme;
  /** A collapsible table of contents before the text. */
  toc: boolean;
  /** Embed the KaTeX fonts the document uses (only when it has math). */
  mathFonts: boolean;
}

export const EXPORT_KEY = 'md-browser:export';
export const DEFAULT_EXPORT: ExportSettings = { theme: 'current', toc: false, mathFonts: true };

export function normalizeExportSettings(raw: unknown): ExportSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ExportSettings, unknown>>;
  return { theme: o.theme === 'light' ? 'light' : 'current', toc: o.toc === true, mathFonts: o.mathFonts !== false };
}

export function exportSettingsStore(): SettingsStore<ExportSettings> {
  return createSettingsStore(EXPORT_KEY, normalizeExportSettings);
}

export interface ExportOptions {
  title: string;
  /** Extra stylesheet text (KaTeX, custom CSS) appended after the page's. */
  extraCss?: string;
  /** Replaces fetch() in tests. */
  fetchImpl?: typeof fetch;
  theme?: ExportTheme;
  toc?: boolean;
  /** The heading of the table of contents (translated by the caller). */
  tocTitle?: string;
  /**
   * Keep the @font-face rules of extraCss whose fonts the document's math uses, with the font
   * files embedded as data: URLs. Otherwise (and for fonts that can't be fetched) the rules are
   * dropped and the math falls back to the reader's fonts.
   */
  embedFonts?: boolean;
}

export function exportFilename(docName: string): string {
  const base = docName.replace(/\.(md|markdown|mdown|mkd)$/i, '') || 'document';
  return `${base}.html`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** The stylesheet without @font-face blocks: the font files are not part of the export. */
export function stripFontFaces(text: string): string {
  return text.replace(/@font-face\s*\{[^}]*\}/g, '');
}

async function toDataUrl(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > EMBED_LIMIT || !blob.type.startsWith('image/')) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** The first URL of a srcset ("url descriptor, url descriptor"; a data: URL has commas of its own), absolute. */
function firstSrc(srcset: string | null, base: string): string | undefined {
  const raw = /^\s*(\S+?),?(\s|$)/.exec(srcset ?? '')?.[1];
  if (!raw) return undefined;
  try {
    return new URL(raw, base).href;
  } catch {
    return undefined;
  }
}

/**
 * Removes the viewer's controls and embeds the images; returns the cleaned copy of `root`.
 * `theme` picks the diagrams and theme images: the page's own, or the light ones.
 */
export async function cleanedCopy(root: HTMLElement, fetchImpl: typeof fetch = fetch, theme: Theme = currentTheme()): Promise<HTMLElement> {
  const copy = root.cloneNode(true) as HTMLElement;
  for (const el of copy.querySelectorAll(CONTROL_SELECTORS.join(','))) el.remove();
  for (const el of copy.querySelectorAll('[data-line]')) el.removeAttribute('data-line');
  for (const el of copy.querySelectorAll('[tabindex]')) el.removeAttribute('tabindex');
  copy.removeAttribute('id');
  copy.removeAttribute('tabindex');
  const asShown = theme === currentTheme();
  if (!asShown) {
    // Dark pages draw diagrams twice (diagrams.ts): keep the light copy only, in the screen's place.
    for (const print of copy.querySelectorAll('.diagram-print')) {
      print.parentElement?.querySelector(':scope > .diagram-screen')?.remove();
      print.replaceWith(...Array.from(print.childNodes));
    }
    applyThemeImages(copy, theme);
  }
  // A <picture> is flattened to the version shown (theme-images.ts picked it for the theme): its
  // <source>s point at blob: URLs or files that are not part of the export.
  const livePictures = root.querySelectorAll('picture');
  copy.querySelectorAll('picture').forEach((picture, i) => {
    const img = picture.querySelector('img');
    const shown = asShown
      ? livePictures[i]?.querySelector('img')?.currentSrc
      : firstSrc(picture.querySelector('source[media="all"]')?.getAttribute('srcset') ?? null, root.ownerDocument.baseURI);
    if (img && shown) img.setAttribute('src', shown);
    for (const source of picture.querySelectorAll('source')) source.remove();
  });
  // Sized images keep their width via --media-w (media-sizes.ts); the live scale comes along.
  await Promise.all(
    Array.from(copy.querySelectorAll<HTMLImageElement>('img[src]')).map(async (img) => {
      const url = img.src; // absolute: a relative path would point nowhere from the saved file
      if (url.startsWith('data:')) return;
      // A page can't fetch file: URLs; the absolute path still works when the file stays in place.
      const data = url.startsWith('file:') ? null : await toDataUrl(url, fetchImpl);
      img.setAttribute('src', data ?? url);
    }),
  );
  return copy;
}

/** The headings of a rendered document that have an id, as TOC entries. */
function headingItems(root: ParentNode): TocItem[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HEADINGS))
    .filter((h) => h.id)
    .map((h) => ({ level: Number(h.tagName[1]), text: h.textContent?.trim() ?? '', id: h.id }));
}

/** A collapsible table of contents for the top of the export (no script: a <details>). */
export function exportToc(root: ParentNode, title: string): HTMLElement | null {
  const items = headingItems(root);
  if (!items.length) return null;
  const doc = root.ownerDocument ?? document;
  const details = doc.createElement('details');
  details.className = 'export-toc';
  details.open = true;
  const summary = doc.createElement('summary');
  summary.textContent = title;
  details.append(summary, tocList(items, doc));
  return details;
}

/**
 * The font faces (family|weight|style) the document's math uses, read from the live elements'
 * computed styles, so only the fonts a document needs are embedded.
 */
export function usedFontFaces(root: ParentNode): Set<string> {
  const used = new Set<string>();
  const view = root.ownerDocument?.defaultView ?? window;
  for (const el of root.querySelectorAll<HTMLElement>('.katex, .katex *')) {
    const cs = view.getComputedStyle(el);
    const family = cs.fontFamily.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
    if (!family?.startsWith('KaTeX_')) continue;
    const weight = cs.fontWeight === 'bold' || Number(cs.fontWeight) >= 600 ? '700' : '400';
    used.add(`${family}|${weight}|${cs.fontStyle === 'italic' ? 'italic' : 'normal'}`);
  }
  return used;
}

const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
const FONT_LIMIT = 2 * 1024 * 1024;

async function fontDataUrl(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > FONT_LIMIT) return null;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:font/woff2;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/**
 * Keeps the @font-face rules of `text` for the faces in `used`, with their first font file
 * embedded as a data: URL (the others are dropped, as are faces that cannot be fetched).
 */
export async function embedFontFaces(text: string, used: ReadonlySet<string>, fetchImpl: typeof fetch = fetch): Promise<string> {
  const blocks = text.match(FONT_FACE) ?? [];
  const replacements = await Promise.all(
    blocks.map(async (block) => {
      const family = /font-family:\s*["']?([^;"'}]+)/.exec(block)?.[1]?.trim();
      const weight = /font-weight:\s*(\w+)/.exec(block)?.[1] ?? '400';
      const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? 'normal';
      const url = /url\(\s*["']?([^)"']+)/.exec(block)?.[1];
      if (!family || !url || !used.has(`${family}|${weight === 'bold' ? '700' : weight}|${style}`)) return '';
      const data = await fontDataUrl(url, fetchImpl);
      return data ? block.replace(/src:[^;}]*/, `src: url(${data}) format("woff2")`) : '';
    }),
  );
  let i = 0;
  return text.replace(FONT_FACE, () => replacements[i++]);
}

/** The complete .html text for `root` (the rendered Markdown), as the page currently shows it. */
export async function buildStandaloneHtml(root: HTMLElement, opts: ExportOptions): Promise<string> {
  const theme: Theme = opts.theme === 'light' ? 'light' : currentTheme();
  const body = await cleanedCopy(root, opts.fetchImpl, theme);
  if (opts.toc) {
    const toc = exportToc(body, opts.tocTitle ?? 'Table of contents');
    if (toc) body.prepend(toc);
  }
  const rootStyle = document.documentElement.style;
  const vars = ROOT_VARIABLES.map((name) => {
    const value = rootStyle.getPropertyValue(name).trim();
    return value ? `${name}: ${value};` : '';
  })
    .filter(Boolean)
    .join(' ');
  const extra = !opts.extraCss ? '' : opts.embedFonts ? await embedFontFaces(opts.extraCss, usedFontFaces(root), opts.fetchImpl) : stripFontFaces(opts.extraCss);
  const styles = [stripFontFaces(css), extra].filter(Boolean).join('\n');
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(document.documentElement.lang || 'en')}" data-theme="${theme}">`,
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${escapeHtml(opts.title)}</title>`,
    `<style>${styles}</style>`,
    vars ? `<style>:root { ${vars} }</style>` : '',
    '</head>',
    '<body>',
    `<main class="content markdown-body">${body.innerHTML}</main>`,
    '</body>',
    '</html>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function downloadHtml(html: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** KaTeX's stylesheet, only when the document has math (it is a lazy chunk, like KaTeX itself). */
export async function mathCss(root: ParentNode): Promise<string | undefined> {
  if (!root.querySelector('.katex')) return undefined;
  return (await import('katex/dist/katex.min.css?inline')).default;
}
