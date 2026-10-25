// Toolbar toggle (and Ctrl/⌘+Shift+M) between the rendered document and its raw Markdown,
// shared by the web viewer and file:// tabs. The mode is not saved: each opened document starts
// in the preview.
import hljs from 'highlight.js/lib/common';
import { t } from '../i18n';
import { createCopyButton } from './code-copy';

const SOURCE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/></svg>';

/** Class put on the TOC while the source is shown; it hides the panel and its toggle. */
export const TOC_SOURCE_CLASS = 'source-mode';

/**
 * Highlights Markdown and splits the result into one HTML string per line. hljs spans can cross
 * line breaks (e.g. fenced code), so they are closed at each line end and reopened on the next.
 */
export function highlightLines(text: string): string[] {
  const src = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const html = hljs.highlight(src, { language: 'markdown', ignoreIllegals: true }).value;
  const open: string[] = [];
  return html.split('\n').map((part) => {
    const head = open.join('');
    // hljs output holds only escaped text and <span class="…"> / </span>.
    for (const [tag] of part.matchAll(/<span[^>]*>|<\/span>/g)) {
      if (tag === '</span>') open.pop();
      else open.push(tag);
    }
    return head + part + '</span>'.repeat(open.length);
  });
}

export interface SourceView {
  /** The text the preview was rendered from. Offers the toggle, and refreshes the source if shown. */
  setSource(text: string): void;
  /** Back to the preview, leaving the scroll position to the caller (another document was opened). */
  reset(): void;
}

/**
 * Adds the toggle to the toolbar (before the TOC toggle) and the source pane after `content`.
 * `onToggle` runs after switching, e.g. to refresh the TOC highlight.
 */
export function mountSourceView(
  toolbar: HTMLElement,
  content: HTMLElement,
  tocEl: HTMLElement,
  onToggle: () => void = () => {},
): SourceView {
  let source = '';
  let shown = '';
  let active = false;
  let previewY = 0;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button source-toggle';
  button.innerHTML = SOURCE_ICON;
  button.title = `${t('sourceView')} (${/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘⇧M' : 'Ctrl+Shift+M'})`;
  button.setAttribute('aria-label', t('sourceView'));
  button.setAttribute('aria-pressed', 'false');
  button.hidden = true;
  const anchor = toolbar.querySelector('.toc-toggle, .font-settings');
  if (anchor) anchor.before(button);
  else toolbar.append(button);

  const pane = document.createElement('section');
  pane.className = 'content source-view';
  pane.setAttribute('aria-label', t('sourceView'));
  pane.setAttribute('role', 'main'); // stands in for the hidden <main> while shown
  pane.hidden = true;
  const code = document.createElement('code');
  code.className = 'hljs language-markdown';
  const pre = document.createElement('pre');
  pre.className = 'source-code';
  pre.append(code);
  const block = document.createElement('div');
  block.className = 'source-block';
  block.append(pre, createCopyButton(() => source));
  pane.append(block);
  content.after(pane);

  /** Fills the pane; only while shown, so hidden updates cost nothing. */
  function paint(): void {
    if (shown === source) return;
    shown = source;
    const lines = highlightLines(source);
    // Each line ends with its newline so a copied selection keeps line breaks; the numbers come from CSS.
    code.innerHTML = lines.map((l, i) => `<span class="source-line">${l}${i < lines.length - 1 ? '\n' : ''}</span>`).join('');
    pre.style.setProperty('--source-digits', String(String(lines.length).length));
  }

  function show(next: boolean): void {
    active = next;
    button.setAttribute('aria-pressed', String(active));
    if (active) paint();
    content.hidden = active;
    pane.hidden = !active;
    tocEl.classList.toggle(TOC_SOURCE_CLASS, active);
  }

  function toggle(): void {
    if (button.hidden) return;
    if (!active) previewY = window.scrollY;
    show(!active);
    window.scrollTo(0, active ? 0 : previewY);
    onToggle();
  }

  button.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'm') return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select') || target?.isContentEditable) return;
    e.preventDefault();
    toggle();
  });

  return {
    setSource(text) {
      source = text;
      button.hidden = false;
      if (active) paint();
    },
    reset() {
      if (active) show(false);
    },
  };
}
