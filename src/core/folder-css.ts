// Folder CSS: a stylesheet named .md-browser.css that the author of a folder puts next to the
// documents, applied to them on the extension's file:// pages (content.ts looks in the document's
// folder, then at the root of the file list). Off by default and switched on in the display
// settings: the file is written by whoever made the folder, not by the reader, and a
// url(https://…) in it makes the browser fetch that address. Wrapped in @scope (.content) like the
// reader's own custom CSS (custom-css.ts) and placed before it, so the reader's stylesheet wins
// where the two clash. The choice is synced like the other display settings.
import { STYLE_ID as CUSTOM_CSS_STYLE_ID } from './custom-css';
import { createSettingsStore, type SettingsStore } from './settings-store';

export interface FolderCssSettings {
  enabled: boolean;
}

export const FOLDER_CSS_KEY = 'md-browser:folder-css';
export const FOLDER_CSS_FILE = '.md-browser.css';
export const STYLE_ID = 'md-folder-css';
/** The rendered Markdown's root (the same scope as the custom CSS). */
const SCOPE = '.content';

export const DEFAULT_FOLDER_CSS: FolderCssSettings = { enabled: false };

/** Off unless explicitly switched on: a missing or damaged value never applies a folder's CSS. */
export function normalizeFolderCssSettings(raw: unknown): FolderCssSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof FolderCssSettings, unknown>>;
  return { enabled: o.enabled === true };
}

/** The stylesheet as applied: limited to the document ("</" escaped as in custom-css.ts). Empty when blank. */
export function scopedFolderCss(css: string): string {
  if (!css.trim()) return '';
  return `@scope (${SCOPE}) {\n${css.replace(/<\//g, '<\\/')}\n}`;
}

/**
 * Puts the folder's stylesheet in the page, before the reader's custom CSS when that is there
 * already (otherwise at the end of <head>, where applyCustomCss appends after it). null or a blank
 * stylesheet removes it.
 */
export function applyFolderCss(css: string | null, doc: Document = document): void {
  const text = css === null ? '' : scopedFolderCss(css);
  let style = doc.getElementById(STYLE_ID);
  if (!text) {
    style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.insertBefore(style, doc.getElementById(CUSTOM_CSS_STYLE_ID));
  }
  if (style.textContent !== text) style.textContent = text;
}

/** Where a document's folder CSS may be, nearest first: its own folder, then the root (once, when they differ). */
export function folderCssUrls(docFolder: string, rootHref: string): string[] {
  const urls = [docFolder + FOLDER_CSS_FILE];
  if (rootHref !== docFolder) urls.push(rootHref + FOLDER_CSS_FILE);
  return urls;
}

export function folderCssStore(): SettingsStore<FolderCssSettings> {
  return createSettingsStore(FOLDER_CSS_KEY, normalizeFolderCssSettings, 'sync');
}
