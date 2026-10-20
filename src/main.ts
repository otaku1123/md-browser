import './style.css';
import { applyI18n, t } from './i18n';
import { mountFontSettings } from './core/font-settings';
import { renderMarkdown } from './core/render';
import { createToc } from './core/toc';
import { createFileTree } from './file-tree';
import { renderDiagrams } from './core/diagrams';
import { onThemeChange } from './core/theme';
import { addCopyButtons } from './core/code-copy';
import { faviconError, faviconUpdated, initFavicon } from './core/favicon';
import { isRelativeRef, resolvePath, resolveImages } from './core/assets';
import {
  fromDirectoryHandle,
  fromFileHandle,
  fromFiles,
  isMarkdownName,
  MAX_SCAN,
  type DocEntry,
  type Workspace,
} from './workspace';
import { clearRecent, loadRecent, saveRecent, type Recent, type RecentHandle } from './recent';

const POLL_MS = 1000;
/** Background tabs still poll, less often, so the tab icon can flag changes. */
const HIDDEN_POLL_EVERY = 5;
/** Consecutive failed polls before reporting: editors and sync tools briefly replace files. */
const FAIL_LIMIT = 3;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const contentEl = $<HTMLElement>('content');
const tocEl = $<HTMLElement>('toc');
const statusEl = $<HTMLElement>('status');
const filesEl = $<HTMLElement>('files');
const filesToggle = $<HTMLButtonElement>('toggle-files');
const overlay = $<HTMLElement>('drop-overlay');
const toc = createToc(tocEl);
const fileTree = createFileTree(filesEl, (path) => {
  const doc = ws?.docs.find((d) => d.path === path);
  if (doc && doc !== currentDoc) void showDoc(doc, { keepScroll: false });
});

let ws: Workspace | null = null;
let currentDoc: DocEntry | null = null;
let lastStamp = '';
let renderSeq = 0;
let releaseAssets: () => void = () => {};
let pollTimer: number | undefined;
/** Handle behind the open workspace, kept so a reload can reopen it (null: can't be kept). */
let recentHandle: RecentHandle | null = null;
let polling = false;
let hiddenTicks = 0;
let pollFailures = 0;

// ---- rendering ------------------------------------------------------------

async function showDoc(doc: DocEntry, opts: { keepScroll: boolean }): Promise<void> {
  if (!ws) return;
  const seq = ++renderSeq;
  const workspace = ws;
  let content;
  try {
    content = await workspace.read(doc);
  } catch (err) {
    setStatus(t('loadFailed', { path: doc.path, error: errMsg(err) }), 'error');
    faviconError(true);
    return;
  }

  const { html, toc: tocItems } = renderMarkdown(content.text);
  // Build off-DOM first so images and diagrams swap in without flicker.
  // <template> content is inert, so images don't start loading unresolved relative URLs.
  const staging = document.createElement('template');
  staging.innerHTML = html;
  const assets = workspace.assetResolver(doc);
  await resolveImages(staging.content, assets.resolve);
  await renderDiagrams(staging.content);
  addCopyButtons(staging.content);
  if (seq !== renderSeq) {
    assets.release();
    return; // a newer render started meanwhile
  }

  const scrollY = window.scrollY;
  contentEl.replaceChildren(staging.content);
  releaseAssets();
  releaseAssets = assets.release;
  if (currentDoc !== doc) {
    toc.reset();
    if (recentHandle) void saveRecent({ handle: recentHandle, docPath: doc.path });
  }
  currentDoc = doc;
  lastStamp = content.stamp;
  toc.render(tocItems);
  window.scrollTo(0, opts.keepScroll ? scrollY : 0);
  fileTree.setActive(doc.path);
  toc.update();
  // File name first: narrow tabs only show the start of the title.
  const slash = doc.path.lastIndexOf('/');
  const dir = slash < 0 ? '' : ` - ${doc.path.slice(0, slash)}`;
  document.title = `${doc.path.slice(slash + 1)}${dir} - MD Browser`;
  faviconError(false);
  pollFailures = 0;
  setStatus(
    // Warning first: the status line is cut off at the end when it doesn't fit.
    (workspace.truncated ? `${t('scanTruncated', { max: MAX_SCAN })} · ` : '') +
      `${doc.path} · ${t(workspace.watchable ? 'autoReloadOn' : 'autoReloadUnsupported')} · ${t('updatedAt', { time: new Date().toLocaleTimeString() })}`,
  );
}

// ---- workspace / watching -------------------------------------------------

async function openWorkspace(next: Workspace, opts: { handle?: RecentHandle; docPath?: string } = {}): Promise<void> {
  if (next.docs.length === 0) {
    setStatus(t('noMarkdown', { label: next.label }), 'error');
    return;
  }
  ws = next;
  recentHandle = opts.handle ?? null;
  // A newer open replaces the remembered one, even when it can't be remembered itself.
  if (!recentHandle) void clearRecent();
  // The button lives in the welcome screen, which is gone once a document has been shown.
  const reopenButton = document.getElementById('reopen');
  if (reopenButton) reopenButton.hidden = true;
  const nameEl = $('workspace-name');
  nameEl.textContent = next.label;
  nameEl.title = next.label;
  nameEl.hidden = false;
  fileTree.render(next.docs.map((d) => d.path));
  updateSidebar();
  const initial =
    next.docs.find((d) => d.path === opts.docPath) ??
    next.docs.find((d) => /^(readme|index)\.md$/i.test(d.path)) ??
    next.docs[0];
  await showDoc(initial, { keepScroll: false });
  startPolling();
}

// ---- file sidebar ----------------------------------------------------------

const SIDEBAR_KEY = 'md-browser:files-sidebar';

function loadSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
  } catch {
    return true;
  }
}

let sidebarOpen = loadSidebarOpen();

/** The sidebar is only offered when the workspace has more than one document. */
function updateSidebar(): void {
  const available = (ws?.docs.length ?? 0) > 1;
  filesToggle.hidden = !available;
  filesToggle.setAttribute('aria-expanded', String(sidebarOpen));
  filesEl.hidden = !(available && sidebarOpen);
}

function toggleSidebar(): void {
  sidebarOpen = !sidebarOpen;
  try {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed');
  } catch {
    // storage unavailable (e.g. blocked site data): keep the state for this session only
  }
  updateSidebar();
}

function startPolling(): void {
  window.clearInterval(pollTimer);
  if (!ws?.watchable) return;
  pollTimer = window.setInterval(poll, POLL_MS);
}

async function poll(): Promise<void> {
  if (polling || !ws || !currentDoc) return;
  if (document.hidden && ++hiddenTicks % HIDDEN_POLL_EVERY !== 0) return;
  polling = true;
  try {
    const stamp = await ws.stat(currentDoc);
    if (stamp !== lastStamp) {
      await showDoc(currentDoc, { keepScroll: true });
      faviconUpdated();
    } else if (pollFailures >= FAIL_LIMIT) {
      // Back unchanged after a reported error: re-render to restore the normal status.
      await showDoc(currentDoc, { keepScroll: true });
    }
    pollFailures = 0;
  } catch (err) {
    if (++pollFailures < FAIL_LIMIT) return;
    setStatus(t('fileGone', { path: currentDoc.path, error: errMsg(err) }), 'error');
    faviconError(true);
  } finally {
    polling = false;
  }
}

// ---- opening files --------------------------------------------------------

const MD_ACCEPT = { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'] };

async function pickFile(): Promise<void> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: MD_ACCEPT }],
      });
      await openWorkspace(fromFileHandle(handle), { handle });
    } catch (err) {
      if (!isAbort(err)) setStatus(errMsg(err), 'error');
    }
    return;
  }
  const files = await pickWithInput(false);
  if (files.length) await openWorkspace(fromFiles(files));
}

async function pickDirectory(): Promise<void> {
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' });
      setStatus(t('scanning', { name: dir.name }));
      await openWorkspace(await fromDirectoryHandle(dir), { handle: dir });
    } catch (err) {
      if (!isAbort(err)) setStatus(errMsg(err), 'error');
    }
    return;
  }
  const files = await pickWithInput(true);
  if (files.length) await openWorkspace(fromFiles(files));
}

/** Fallback for browsers without the File System Access API (no auto-reload). */
function pickWithInput(directory: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (directory) input.webkitdirectory = true;
    else input.accept = '.md,.markdown,.mdown,.mkd,text/markdown';
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

async function handleDrop(e: DragEvent): Promise<void> {
  const items = Array.from(e.dataTransfer?.items ?? []).filter((i) => i.kind === 'file');
  const files = Array.from(e.dataTransfer?.files ?? []);
  // getAsFileSystemHandle must be called synchronously inside the drop event.
  const handlePromises =
    'getAsFileSystemHandle' in DataTransferItem.prototype
      ? items.map((i) => (i as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle())
      : [];

  const settled: (FileSystemHandle | null | undefined)[] = await Promise.all(handlePromises).catch(() => []);
  const handles = settled.filter((h): h is FileSystemHandle => h != null);
  const dir = handles.find((h): h is FileSystemDirectoryHandle => h.kind === 'directory');
  if (dir) {
    setStatus(t('scanning', { name: dir.name }));
    await openWorkspace(await fromDirectoryHandle(dir), { handle: dir });
    return;
  }
  const mdHandle = handles.find(
    (h): h is FileSystemFileHandle => h.kind === 'file' && isMarkdownName(h.name),
  );
  if (mdHandle) {
    await openWorkspace(fromFileHandle(mdHandle), { handle: mdHandle });
    return;
  }
  if (files.length) await openWorkspace(fromFiles(files));
}

// ---- reopening after a reload ------------------------------------------------

function recentName(handle: RecentHandle): string {
  return handle.kind === 'directory' ? `${handle.name}/` : handle.name;
}

async function reopen({ handle, docPath }: Recent): Promise<void> {
  if (ws) return; // the user opened something else meanwhile
  try {
    if (handle.kind === 'directory') {
      setStatus(t('scanning', { name: handle.name }));
      await openWorkspace(await fromDirectoryHandle(handle), { handle, docPath });
    } else {
      await openWorkspace(fromFileHandle(handle), { handle, docPath });
    }
  } catch (err) {
    setStatus(t('reopenFailed', { name: recentName(handle), error: errMsg(err) }), 'error');
    void clearRecent();
  }
}

/**
 * Reopens the last file / folder. Chrome often keeps the read permission across a reload;
 * otherwise asking again needs a click, so offer a button instead.
 */
async function restoreRecent(): Promise<void> {
  const recent = await loadRecent();
  if (!recent || ws) return;
  const state = await recent.handle.queryPermission({ mode: 'read' }).catch(() => 'denied' as const);
  if (state === 'granted') return reopen(recent);
  if (state !== 'prompt') return;
  const button = $<HTMLButtonElement>('reopen');
  button.textContent = t('reopen', { name: recentName(recent.handle) });
  button.hidden = false;
  button.onclick = async () => {
    const answer = await recent.handle.requestPermission({ mode: 'read' }).catch(() => 'denied' as const);
    if (answer === 'granted') await reopen(recent);
  };
}

// ---- helpers ---------------------------------------------------------------

function setStatus(text: string, kind: 'info' | 'error' = 'info'): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', kind === 'error');
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// ---- event wiring ------------------------------------------------------------

applyI18n();
initFavicon();
// The develop branch is deployed to /dev/; mark it so it isn't mistaken for production.
if (import.meta.env.VITE_DEPLOY_ENV === 'dev') {
  document.title = `${document.title} (dev)`;
  // Set by the Pages workflow for the dev build only; absent locally.
  const sha: string = import.meta.env.VITE_COMMIT_SHA ?? '';
  const repo: string = import.meta.env.VITE_REPO_URL ?? '';
  const hasSha = /^[0-9a-f]{40}$/.test(sha);
  const badge = document.createElement(hasSha && repo ? 'a' : 'span');
  badge.className = 'env-badge';
  badge.textContent = hasSha ? `DEV · ${sha.slice(0, 7)}` : 'DEV';
  if (badge instanceof HTMLAnchorElement) {
    badge.href = `${repo}/commit/${sha}`;
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';
    badge.title = sha;
  }
  document.querySelector('.brand')?.after(badge);
}
mountFontSettings(document.querySelector<HTMLElement>('.toolbar')!);
// Diagrams carry their theme's colours, so redraw them when the theme changes.
onThemeChange(() => void renderDiagrams(contentEl));
if (location.protocol === 'chrome-extension:') {
  void import('./extension/setup-banner').then((m) => m.mountSetupBanner($('setup-banner-slot')));
}

$('open-file').addEventListener('click', pickFile);
$('open-dir').addEventListener('click', pickDirectory);

filesToggle.addEventListener('click', toggleSidebar);
void restoreRecent();

contentEl.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (!a) return;
  const href = a.getAttribute('href')!;
  if (href.startsWith('#')) return; // in-page anchor: default behaviour
  if (!isRelativeRef(href)) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return;
  }
  // Relative link to another Markdown file inside the opened folder.
  e.preventDefault();
  if (!ws || !currentDoc) return;
  const path = resolvePath(currentDoc.path, href);
  const doc = path ? ws.docs.find((d) => d.path === path) : undefined;
  if (doc) {
    void showDoc(doc, { keepScroll: false });
  } else {
    setStatus(t('linkNotFound', { href }), 'error');
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void poll();
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    overlay.hidden = true;
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  void handleDrop(e);
});
