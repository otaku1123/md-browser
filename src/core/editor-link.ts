// Opens the shown file in a local editor through its URL scheme ("Open in editor" toolbar button).
// Only file:// pages know the absolute path, so the web app and the viewer don't offer it. Off by
// default: it launches another application (the browser asks once before doing so).
import { LINE_ATTR } from './render';
import { createSettingsStore, type SettingsStore } from './settings-store';
import { t } from '../i18n';

export const EDITORS = ['off', 'vscode', 'cursor', 'custom'] as const;
export type Editor = (typeof EDITORS)[number];

export interface EditorSettings {
  editor: Editor;
  /** The "custom" URL template; {path} is the decoded absolute path, {line} the 1-based line. */
  custom: string;
}

export const EDITOR_DEFAULT: EditorSettings = { editor: 'off', custom: '' };
export const CUSTOM_EXAMPLE = 'idea://open?file={path}&line={line}';
const STORAGE_KEY = 'md-browser:editor';
const CUSTOM_MAX = 500;

export function normalizeEditorSettings(raw: unknown): EditorSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    editor: (EDITORS as readonly unknown[]).includes(o.editor) ? (o.editor as Editor) : EDITOR_DEFAULT.editor,
    custom: typeof o.custom === 'string' ? o.custom.trim().slice(0, CUSTOM_MAX) : '',
  };
}

/** A template must name a scheme, and not one that would run inside this page or the browser. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const FORBIDDEN = /^(javascript|data|vbscript|blob|about|file|chrome|chrome-extension|edge):/i;

export function isValidTemplate(template: string): boolean {
  return SCHEME.test(template) && !FORBIDDEN.test(template);
}

/**
 * The URL that opens the file at `pathname` (a file:// URL's path, still percent-encoded) at
 * `line`; null when the editor is off or the custom template is unusable. VS Code and Cursor take
 * `<scheme>://file/<path>:<line>`, which is also what a Windows path (`/C:/...`) needs.
 */
export function editorUrl(settings: EditorSettings, pathname: string, line: number): string | null {
  switch (settings.editor) {
    case 'vscode':
      return `vscode://file${pathname}:${line}`;
    case 'cursor':
      return `cursor://file${pathname}:${line}`;
    case 'custom':
      if (!isValidTemplate(settings.custom)) return null;
      return settings.custom.replaceAll('{path}', decodeURIComponent(pathname)).replaceAll('{line}', String(line));
    default:
      return null;
  }
}

/**
 * The source line of the first block that starts below `top` (the toolbar's bottom), i.e. the one
 * the reader is at; when every block starts above it (the end of a long one), the last of those.
 */
export function visibleLine(root: ParentNode, top: number): number {
  let before: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>(`[${LINE_ATTR}]`)) {
    if (el.getBoundingClientRect().top >= top) return Number(el.getAttribute(LINE_ATTR));
    before = el;
  }
  return before ? Number(before.getAttribute(LINE_ATTR)) : 1;
}

let store: SettingsStore<EditorSettings> | undefined;

/** Shared by the settings panel and the toolbar link (chrome.storage.sync on extension pages). */
export function editorStore(): SettingsStore<EditorSettings> {
  return (store ??= createSettingsStore(STORAGE_KEY, normalizeEditorSettings));
}

const EDITOR_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>';

/**
 * Adds the "Open in editor" link to the toolbar (before the TOC toggle and the gear). Hidden until
 * an editor is chosen. The href is renewed just before it can be followed or copied, so it carries
 * the line at the top of the view at that moment.
 */
export function mountEditorLink(toolbar: HTMLElement, root: ParentNode): void {
  const link = document.createElement('a');
  link.className = 'icon-button editor-link';
  link.innerHTML = EDITOR_ICON;
  link.title = t('openInEditor');
  link.setAttribute('aria-label', t('openInEditor'));
  link.hidden = true;
  const anchor = toolbar.querySelector('.toc-toggle, .font-settings');
  if (anchor) anchor.before(link);
  else toolbar.append(link);

  let settings = EDITOR_DEFAULT;
  const refresh = () => {
    const url = editorUrl(settings, location.pathname, visibleLine(root, toolbar.getBoundingClientRect().bottom));
    if (url) link.href = url;
    else link.removeAttribute('href');
    link.hidden = url === null;
  };
  for (const type of ['mouseenter', 'focus', 'pointerdown', 'contextmenu', 'click'] as const) link.addEventListener(type, refresh);
  const show = (s: EditorSettings) => {
    settings = s;
    refresh();
  };
  void editorStore().load().then(show);
  editorStore().onChange(show);
}
