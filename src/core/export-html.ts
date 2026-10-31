// Saves the rendered document as one self-contained .html: the page's stylesheet inline, the
// current theme / size / width / font settings applied, the viewer's controls (copy, heading links,
// size and save buttons) left out, and images embedded as data: URLs when they can be fetched
// (blob: and http(s) URLs). file:// images can't be fetched from a page, so they keep their absolute
// URL and still show when the file is opened on the same computer. Diagrams are inline SVG already.
// Downloads use a blob: URL and <a download>, like diagram-export.ts: no extension permission.
import css from '../style.css?inline';
import { currentTheme } from './theme';

// Controls the viewer adds to the rendered Markdown; none of them work without the page's scripts.
const CONTROL_SELECTORS = ['.copy-button', '.heading-link', '.media-size', '.diagram-actions'];
// CSS variables font-settings.ts sets on <html>: carried over so the export looks like the page.
const ROOT_VARIABLES = ['--font-body', '--font-code', '--doc-font-size', '--doc-max-width'];
const EMBED_LIMIT = 20 * 1024 * 1024; // skip embedding an image bigger than this (the URL stays)

export interface ExportOptions {
  title: string;
  /** Extra stylesheet text (KaTeX) appended after the page's; @font-face rules are dropped. */
  extraCss?: string;
  /** Replaces fetch() in tests. */
  fetchImpl?: typeof fetch;
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

/** Removes the viewer's controls and embeds the images; returns the cleaned copy of `root`. */
export async function cleanedCopy(root: HTMLElement, fetchImpl: typeof fetch = fetch): Promise<HTMLElement> {
  const copy = root.cloneNode(true) as HTMLElement;
  for (const el of copy.querySelectorAll(CONTROL_SELECTORS.join(','))) el.remove();
  for (const el of copy.querySelectorAll('[data-line]')) el.removeAttribute('data-line');
  for (const el of copy.querySelectorAll('[tabindex]')) el.removeAttribute('tabindex');
  copy.removeAttribute('id');
  copy.removeAttribute('tabindex');
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

/** The complete .html text for `root` (the rendered Markdown), as the page currently shows it. */
export async function buildStandaloneHtml(root: HTMLElement, opts: ExportOptions): Promise<string> {
  const body = await cleanedCopy(root, opts.fetchImpl);
  const rootStyle = document.documentElement.style;
  const vars = ROOT_VARIABLES.map((name) => {
    const value = rootStyle.getPropertyValue(name).trim();
    return value ? `${name}: ${value};` : '';
  })
    .filter(Boolean)
    .join(' ');
  const styles = [stripFontFaces(css), opts.extraCss ? stripFontFaces(opts.extraCss) : '']
    .filter(Boolean)
    .join('\n');
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(document.documentElement.lang || 'en')}" data-theme="${currentTheme()}">`,
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
