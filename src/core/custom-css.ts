// Custom CSS: a stylesheet the user writes in the display settings to change how the document
// looks. It is wrapped in @scope (.content) so it can only reach the rendered Markdown, never the
// toolbar or the settings panel: whatever it does, the panel stays usable to undo it. Saved on
// this computer only (chrome.storage.local / localStorage: sync allows 8 KB per item, and a
// stylesheet is personal to a screen anyway).
import { createSettingsStore, type SettingsStore } from './settings-store';

export interface CustomCss {
  css: string;
  /** Off keeps the text but stops applying it. */
  enabled: boolean;
  /** Include it in the standalone HTML export (export-html.ts). */
  exported: boolean;
}

export const CUSTOM_CSS_KEY = 'md-browser:custom-css';
/** Plenty for a hand-written stylesheet; bounds a corrupted or hostile stored value. */
export const CUSTOM_CSS_MAX = 100_000;
export const STYLE_ID = 'mdb-custom-css';
/** The rendered Markdown's root in every page (content.ts, index.html, export-html.ts). */
const SCOPE = '.content';

export const EMPTY_CUSTOM_CSS: CustomCss = { css: '', enabled: true, exported: true };

export function normalizeCustomCss(raw: unknown): CustomCss {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof CustomCss, unknown>>;
  return {
    // Control characters other than tab / newline carry nothing a stylesheet needs.
    css: typeof o.css === 'string' ? o.css.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, CUSTOM_CSS_MAX) : '',
    enabled: o.enabled !== false,
    exported: o.exported !== false,
  };
}

/**
 * A stylesheet limited to the document, for this file and folder-css.ts. The text goes through the
 * browser's CSS parser first and only the rules it accepted are put back, so a stray "}" in it
 * cannot close the @scope block and reach the toolbar or the settings panel. Empty when nothing is
 * left. "</" is escaped so the text can also sit inside a <style> element in HTML (the export):
 * CSS reads "<\/" as "</", HTML does not.
 */
export function scopeToContent(css: string): string {
  if (!css.trim() || typeof CSSStyleSheet !== 'function') return '';
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const rules = Array.from(sheet.cssRules, (r) => r.cssText).join('\n');
  if (!rules) return '';
  return `@scope (${SCOPE}) {\n${rules.replace(/<\//g, '<\\/')}\n}`;
}

/** The stylesheet as applied (see scopeToContent). Empty when there is nothing to apply. */
export function scopedCustomCss(s: CustomCss): string {
  return s.enabled ? scopeToContent(s.css) : '';
}

/** Puts the stylesheet in the page (at the end of <head>, after the app's own styles). */
export function applyCustomCss(s: CustomCss, doc: Document = document): void {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.append(style);
  }
  const text = scopedCustomCss(s);
  if (style.textContent !== text) style.textContent = text;
}

export function customCssStore(): SettingsStore<CustomCss> {
  return createSettingsStore(CUSTOM_CSS_KEY, normalizeCustomCss, 'local');
}
