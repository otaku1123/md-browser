// Renders a file:// Markdown document in place. Loaded by content-loader.js.
import css from '../style.css?inline';
import { renderMarkdown } from '../core/render';
import { renderDiagrams } from '../core/diagrams';
import { renderMath } from '../core/math';
import { onThemeChange } from '../core/theme';
import { addCopyButtons } from '../core/code-copy';
import { addHeadingLinks } from '../core/heading-link';
import { enableImageZoom, prepareImageZoom } from '../core/image-zoom';
import { applyMediaSizes, loadMediaDoc, prepareMediaSizes, showMediaSizes } from '../core/media-sizes';
import { mountSkipLink } from '../core/skip-link';
import { onReturn } from '../core/on-return';
import { createToc } from '../core/toc';
import { mountTocPanel } from '../core/toc-panel';
import { mountSourceView } from '../core/source-view';
import { mountFontSettings } from '../core/font-settings';
import { createFilesToggle, mountFilesSidebar } from '../core/files-sidebar';
import { createFileTree } from '../file-tree';
import { faviconError, faviconUpdated, initFavicon } from '../core/favicon';
import { lang, t } from '../i18n';
import { sha256Hex } from './read-self';
import {
  MSG_LIST_SIBLINGS,
  MSG_READ_SELF,
  MSG_SET_HIDDEN_DIR,
  type ListSiblingsResponse,
  type ReadSelfMessage,
  type ReadSelfResponse,
  type SetHiddenDirMessage,
  type SetHiddenDirResponse,
} from './messages';

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
async function fetchSource(known?: string): Promise<{ text: string; hash: string } | 'unchanged'> {
  const msg: ReadSelfMessage = { type: MSG_READ_SELF, known };
  const res: ReadSelfResponse | undefined = await chrome.runtime.sendMessage(msg);
  if (!res) throw new Error('no response from background');
  if (!res.ok) throw new Error(res.error);
  return res.unchanged ? 'unchanged' : { text: res.text, hash: res.hash };
}

function fileName(): string {
  return decodeURIComponent(location.pathname.split('/').pop() ?? 'document.md');
}

async function listSiblings(): Promise<ListSiblingsResponse | undefined> {
  try {
    return await chrome.runtime.sendMessage({ type: MSG_LIST_SIBLINGS });
  } catch {
    return undefined; // no listing (e.g. file access off): the page works without the sidebar
  }
}

/**
 * Lists the Markdown files in this file's folder and below, then offers them in the sidebar.
 * Lists again when the user comes back to the tab, so added or removed files show up (#109).
 */
async function showSiblings(filesEl: HTMLElement, filesToggle: HTMLButtonElement): Promise<void> {
  const res = await listSiblings();
  if (!res?.ok) return;
  // The root may be a parent of this file's folder (opened from the sidebar): one "../" per level.
  const rootUrl = new URL('../'.repeat(res.current.split('/').length - 1) || './', location.href);

  let busy = Promise.resolve();
  /** The background saves the change for the tab's root, then the folder is listed again. */
  const setHidden = (path: string, hidden: boolean) => {
    busy = busy.then(async () => {
      const msg: SetHiddenDirMessage = { type: MSG_SET_HIDDEN_DIR, path, hidden };
      const done: SetHiddenDirResponse | undefined = await chrome.runtime.sendMessage(msg).catch(() => undefined);
      if (!done?.ok) return;
      const next = await listSiblings();
      if (next?.ok) show(next);
    });
  };

  const tree = createFileTree(
    filesEl,
    (path) => {
      // Paths are relative to the root; encode each segment so names like "a#b.md" survive.
      location.href = new URL(path.split('/').map(encodeURIComponent).join('/'), rootUrl).href;
    },
    { onHide: (dir) => setHidden(dir, true), onUnhide: (dir) => setHidden(dir, false) },
  );
  const sidebar = mountFilesSidebar(filesToggle, filesEl);

  type Listing = Extract<ListSiblingsResponse, { ok: true }>;
  const key = (list: Listing) => JSON.stringify([list.paths, list.hidden, list.truncated]);
  let shown = '';

  function show(list: Listing): void {
    shown = key(list);
    tree.render(list.paths, list.hidden);
    if (list.truncated) {
      const note = document.createElement('p');
      note.className = 'files-note';
      note.textContent = t('filesTruncated');
      filesEl.append(note);
    }
    tree.setActive(list.current); // not listed (e.g. below the depth limit or hidden): nothing is marked
    // Hidden folders keep the sidebar, so they can always be shown again.
    sidebar.setAvailable(list.paths.length >= 2 || list.hidden.length > 0);
  }

  show(res);
  onReturn(() => {
    busy = busy.then(async () => {
      const next = await listSiblings();
      if (next?.ok && key(next) !== shown) show(next);
    });
  });
}

function buildShell(): {
  content: HTMLElement;
  tocEl: HTMLElement;
  filesEl: HTMLElement;
  filesToggle: HTMLButtonElement;
  status: HTMLElement;
} {
  const style = document.createElement('style');
  style.textContent = css;
  const viewport = document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1.0';
  document.head.append(viewport, style);
  document.documentElement.lang = lang;

  const header = document.createElement('header');
  header.className = 'toolbar';
  // Same structure as index.html, so the viewer's sidebar styles apply; hidden until files are listed.
  const filesEl = document.createElement('nav');
  filesEl.className = 'files';
  filesEl.id = 'md-files';
  filesEl.setAttribute('aria-label', t('files'));
  filesEl.hidden = true;
  const filesToggle = createFilesToggle(filesEl);
  const brand = document.createElement('strong');
  brand.className = 'brand';
  brand.textContent = fileName();
  const status = document.createElement('span');
  status.className = 'status';
  status.setAttribute('role', 'status');
  header.append(filesToggle, brand, status);
  mountFontSettings(header);

  const layout = document.createElement('div');
  layout.className = 'layout';
  const tocEl = document.createElement('nav');
  tocEl.className = 'toc';
  tocEl.setAttribute('aria-label', t('toc'));
  const content = document.createElement('main');
  content.className = 'content markdown-body';
  layout.append(filesEl, tocEl, content);

  document.body.replaceChildren(header, layout);
  mountTocPanel(header, tocEl);
  mountSkipLink(header);
  document.body.removeAttribute('style');
  return { content, tocEl, filesEl, filesToggle, status };
}

async function main(): Promise<void> {
  const initial = readPlainTextSource();
  if (initial === null) return;

  const { content, tocEl, filesEl, filesToggle, status } = buildShell();
  initFavicon();
  const toc = createToc(tocEl);
  const sourceView = mountSourceView(document.querySelector<HTMLElement>('.toolbar')!, content, tocEl, () => toc.update());
  let current = initial;
  let seq = 0;

  async function render(src: string, keepScroll: boolean): Promise<void> {
    const mine = ++seq;
    const { html, toc: items } = renderMarkdown(src);
    // <template> content is inert: nothing loads until it is attached.
    const staging = document.createElement('template');
    staging.innerHTML = html;
    prepareMediaSizes(staging.content);
    // Per-item sizes are remembered by the file's URL (without the heading in the hash).
    const media = loadMediaDoc(location.href.split('#')[0]);
    // Relative images/links resolve natively against the file:// URL.
    await renderDiagrams(staging.content);
    await renderMath(staging.content);
    addCopyButtons(staging.content);
    prepareImageZoom(staging.content);
    addHeadingLinks(staging.content, true);
    const mediaDoc = await media;
    if (mine !== seq) return;
    const y = window.scrollY;
    content.replaceChildren(staging.content);
    showMediaSizes(content, mediaDoc);
    sourceView.setSource(src);
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
  onThemeChange(() => void renderDiagrams(content).then(() => applyMediaSizes(content)));
  enableImageZoom(content);
  void showSiblings(filesEl, filesToggle);

  // Probe once; if the browser refuses, show why instead of silently not reloading.
  // Its hash is what the polls compare against (kept here, as the service worker keeps no state).
  // Sending the hash of the text shown now lets an unchanged file skip the transfer even then, which
  // matters above Chrome's 64MiB message limit (it matches when the file is UTF-8 without a BOM).
  let hash: string;
  try {
    const shown = await sha256Hex(new TextEncoder().encode(current)).catch(() => undefined);
    const probe = await fetchSource(shown);
    if (probe === 'unchanged') hash = shown!;
    else {
      hash = probe.hash;
      if (probe.text !== current) {
        current = probe.text;
        await render(current, true);
      }
    }
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
      const next = await fetchSource(hash);
      if (next !== 'unchanged') {
        current = next.text;
        hash = next.hash;
        await render(next.text, true);
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
