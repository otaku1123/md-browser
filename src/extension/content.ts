// Renders a file:// Markdown document in place. Loaded by content-loader.js.
import css from '../style.css?inline';
import { renderMarkdown } from '../core/render';
import { renderDiagrams } from '../core/diagrams';
import { onThemeChange } from '../core/theme';
import { addCopyButtons } from '../core/code-copy';
import { addHeadingLinks } from '../core/heading-link';
import { enableImageZoom } from '../core/image-zoom';
import { createToc } from '../core/toc';
import { mountTocPanel } from '../core/toc-panel';
import { mountFontSettings } from '../core/font-settings';
import { faviconError, faviconUpdated, initFavicon } from '../core/favicon';
import { lang, t } from '../i18n';
import { MSG_READ_SELF, type ReadSelfResponse } from './messages';

const POLL_MS = 1000;
/** Background tabs still poll, less often, so the tab icon can flag changes. */
const HIDDEN_POLL_EVERY = 5;
/** Consecutive failed polls before reporting: editors and sync tools briefly replace files. */
const FAIL_LIMIT = 3;

/** Chrome shows text files as <body><pre>…</pre></body>; anything else is not ours to touch. */
function readPlainTextSource(): string | null {
  if (!/^text\/(plain|markdown|x-markdown)$/.test(document.contentType)) return null;
  const pre = document.body?.querySelector(':scope > pre');
  return pre ? (pre.textContent ?? '') : null;
}

/** Reads the current file again via the service worker (the page itself is blocked by CORS). */
async function fetchSource(): Promise<string> {
  const res: ReadSelfResponse | undefined = await chrome.runtime.sendMessage({ type: MSG_READ_SELF });
  if (!res) throw new Error('no response from background');
  if (!res.ok) throw new Error(res.error);
  return res.text;
}

function fileName(): string {
  return decodeURIComponent(location.pathname.split('/').pop() ?? 'document.md');
}

function buildShell(): { content: HTMLElement; tocEl: HTMLElement; status: HTMLElement } {
  const style = document.createElement('style');
  style.textContent = css;
  const viewport = document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1.0';
  document.head.append(viewport, style);
  document.documentElement.lang = lang;

  const header = document.createElement('header');
  header.className = 'toolbar';
  const brand = document.createElement('strong');
  brand.className = 'brand';
  brand.textContent = fileName();
  const status = document.createElement('span');
  status.className = 'status';
  header.append(brand, status);
  mountFontSettings(header);

  const layout = document.createElement('div');
  layout.className = 'layout';
  const tocEl = document.createElement('nav');
  tocEl.className = 'toc';
  tocEl.setAttribute('aria-label', t('toc'));
  const content = document.createElement('main');
  content.className = 'content markdown-body';
  layout.append(tocEl, content);

  document.body.replaceChildren(header, layout);
  mountTocPanel(header, tocEl);
  document.body.removeAttribute('style');
  return { content, tocEl, status };
}

async function main(): Promise<void> {
  const initial = readPlainTextSource();
  if (initial === null) return;

  const { content, tocEl, status } = buildShell();
  initFavicon();
  const toc = createToc(tocEl);
  let current = initial;
  let seq = 0;

  async function render(src: string, keepScroll: boolean): Promise<void> {
    const mine = ++seq;
    const { html, toc: items } = renderMarkdown(src);
    // <template> content is inert: nothing loads until it is attached.
    const staging = document.createElement('template');
    staging.innerHTML = html;
    // Relative images/links resolve natively against the file:// URL.
    await renderDiagrams(staging.content);
    addCopyButtons(staging.content);
    addHeadingLinks(staging.content, true);
    if (mine !== seq) return;
    const y = window.scrollY;
    content.replaceChildren(staging.content);
    toc.render(items);
    if (keepScroll) window.scrollTo(0, y);
    else if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    toc.update();
    const h1 = items.find((i) => i.level === 1)?.text;
    // File name first: narrow tabs only show the start of the title.
    document.title = h1 ? `${fileName()} - ${h1}` : fileName();
  }

  await render(current, false);
  // Diagrams carry their theme's colours, so redraw them when the theme changes.
  onThemeChange(() => void renderDiagrams(content));
  enableImageZoom(content);

  // Probe once; if the browser refuses, show why instead of silently not reloading.
  try {
    await fetchSource();
  } catch (err) {
    status.textContent = t('autoReloadOff', { error: err instanceof Error ? err.message : String(err) });
    status.classList.add('error');
    faviconError(true);
    return;
  }
  status.textContent = t('autoReloadOn');

  let busy = false;
  let hiddenTicks = 0;
  let failures = 0;
  window.setInterval(async () => {
    if (busy) return;
    if (document.hidden && ++hiddenTicks % HIDDEN_POLL_EVERY !== 0) return;
    busy = true;
    try {
      const next = await fetchSource();
      if (next !== current) {
        current = next;
        await render(next, true);
        status.textContent = `${t('autoReloadOn')} · ${t('updatedAt', { time: new Date().toLocaleTimeString() })}`;
        status.classList.remove('error');
        faviconUpdated();
      } else if (failures >= FAIL_LIMIT) {
        status.textContent = t('autoReloadOn');
        status.classList.remove('error');
      }
      failures = 0;
      faviconError(false);
    } catch {
      if (++failures < FAIL_LIMIT) return;
      status.textContent = t('fileUnreadable');
      status.classList.add('error');
      faviconError(true);
    } finally {
      busy = false;
    }
  }, POLL_MS);
}

void main();
