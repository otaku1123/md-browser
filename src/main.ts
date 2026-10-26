import './style.css';
import { applyI18n, lang, t } from './i18n';
import { mountFontSettings } from './core/font-settings';
import { renderMarkdown } from './core/render';
import { createToc } from './core/toc';
import { mountTocPanel } from './core/toc-panel';
import { mountSourceView } from './core/source-view';
import { createFileTree } from './file-tree';
import { mountFilesSidebar } from './core/files-sidebar';
import { renderDiagrams } from './core/diagrams';
import { renderMath } from './core/math';
import { onThemeChange } from './core/theme';
import { addCopyButtons } from './core/code-copy';
import { addHeadingLinks } from './core/heading-link';
import { enableImageZoom, prepareImageZoom } from './core/image-zoom';
import { applyMediaSizes, loadMediaDoc, prepareMediaSizes, showMediaSizes } from './core/media-sizes';
import { mountSkipLink } from './core/skip-link';
import { faviconError, faviconUpdated, initFavicon } from './core/favicon';
import { scanLimitStore } from './core/scan-limit';
import { addHiddenDir, removeHiddenDir } from './core/hidden-dirs';
import { loadHiddenDirs, saveHiddenDirs } from './core/hidden-dirs-store';
import { isRelativeRef, resolvePath, resolveImages } from './core/assets';
import {
  fromDirectoryHandle,
  fromFileHandle,
  fromFiles,
  isMarkdownName,
  type DocEntry,
  type Workspace,
} from './workspace';
import { clearRecent, loadRecent, removeRecent, saveRecent, skipResume, type Recent, type RecentEntry, type RecentHandle } from './recent';

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
const fileTree = createFileTree(
  filesEl,
  (path) => {
    const doc = ws?.docs.find((d) => d.path === path);
    if (doc && doc !== currentDoc) void showDoc(doc, { keepScroll: false });
  },
  { onHide: (dir) => queueSetHidden(dir, true), onUnhide: (dir) => queueSetHidden(dir, false) },
);

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
  // Before the refs are resolved: per-item sizes are keyed by the image refs as written.
  prepareMediaSizes(staging.content);
  // Folder name + path, like the hidden folders: browsers give no absolute path.
  const media = loadMediaDoc(workspace.folder !== undefined ? `${workspace.folder}/${doc.path}` : doc.path);
  const assets = workspace.assetResolver(doc);
  await resolveImages(staging.content, assets.resolve);
  await renderDiagrams(staging.content);
  await renderMath(staging.content);
  addCopyButtons(staging.content);
  prepareImageZoom(staging.content);
  addHeadingLinks(staging.content, false);
  const mediaDoc = await media;
  if (seq !== renderSeq) {
    assets.release();
    return; // a newer render started meanwhile
  }

  const scrollY = window.scrollY;
  contentEl.replaceChildren(staging.content);
  showMediaSizes(contentEl, mediaDoc);
  releaseAssets();
  releaseAssets = assets.release;
  if (currentDoc !== doc) {
    toc.reset();
    sourceView.reset();
    if (recentHandle) void saveRecent({ handle: recentHandle, docPath: doc.path });
  }
  currentDoc = doc;
  lastStamp = content.stamp;
  sourceView.setSource(content.text);
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
    (workspace.truncatedAt ? `${t('scanTruncated', { max: workspace.truncatedAt.toLocaleString() })} · ` : '') +
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
  // The history stays, but a reload must not bring back an older item over one that can't be remembered.
  if (!recentHandle) void skipResume();
  // The list lives in the welcome screen, which is gone once a document has been shown.
  const recentEl = document.getElementById('recent');
  if (recentEl) recentEl.hidden = true;
  const nameEl = $('workspace-name');
  nameEl.textContent = next.label;
  nameEl.title = next.label;
  nameEl.hidden = false;
  renderFileTree();
  await showDoc(startDoc(next, opts.docPath), { keepScroll: false });
  startPolling();
}

function startDoc(next: Workspace, docPath?: string): DocEntry {
  return (
    next.docs.find((d) => d.path === docPath) ??
    next.docs.find((d) => /^(readme|index)\.md$/i.test(d.path)) ??
    next.docs[0]
  );
}

// ---- file sidebar ----------------------------------------------------------

const filesSidebar = mountFilesSidebar(filesToggle, filesEl);

function renderFileTree(): void {
  // null: this workspace can't hide folders (single file, plain dropped files), so no hide buttons.
  fileTree.render(ws?.docs.map((d) => d.path) ?? [], ws?.rescan ? (ws.hiddenDirs ?? []) : null);
  updateSidebar();
}

/** The sidebar is offered when there is more than one document, or hidden folders to show again. */
function updateSidebar(): void {
  filesSidebar.setAvailable((ws?.docs.length ?? 0) > 1 || (ws?.hiddenDirs?.length ?? 0) > 0);
}

let hiddenQueue = Promise.resolve();

/** One change at a time, so quick clicks each build on the previous list. */
function queueSetHidden(dir: string, hide: boolean): void {
  hiddenQueue = hiddenQueue.then(() => setHidden(dir, hide));
}

/** Hides (or shows again) a folder: lists the workspace again without it and remembers the choice. */
async function setHidden(dir: string, hide: boolean): Promise<void> {
  const current = ws;
  if (!current?.rescan || current.folder === undefined) return;
  const old = current.hiddenDirs ?? [];
  const hidden = hide ? addHiddenDir(old, dir) : removeHiddenDir(old, dir);
  setStatus(t('scanning', { name: current.folder }));
  try {
    const next = await current.rescan(hidden);
    if (ws !== current) return; // another folder was opened meanwhile
    if (next.docs.length === 0) {
      setStatus(t('hideLeavesNothing', { name: dir }), 'error');
      return;
    }
    await saveHiddenDirs(current.folder, hidden);
    ws = next;
    renderFileTree();
    // Stay on the open document (same scroll, source view, recent entry) while it is still listed.
    const same = currentDoc && next.docs.find((d) => d.path === currentDoc!.path);
    if (same) currentDoc = same;
    await showDoc(same || startDoc(next), { keepScroll: !!same });
  } catch (err) {
    setStatus(errMsg(err), 'error');
  }
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

/** Scans a folder with the limit from the settings panel, leaving out the folders hidden in it. */
async function scanFolder(dir: FileSystemDirectoryHandle): Promise<Workspace> {
  const [limit, hidden] = await Promise.all([scanLimitStore().load(), loadHiddenDirs(dir.name)]);
  return fromDirectoryHandle(dir, limit, hidden);
}

/** fromFiles(), with the folders hidden in a picked folder left out. */
async function filesWorkspace(files: File[]): Promise<Workspace> {
  const all = fromFiles(files);
  const hidden = all.folder !== undefined ? await loadHiddenDirs(all.folder) : [];
  return hidden.length && all.rescan ? all.rescan(hidden) : all;
}

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
  if (files.length) await openWorkspace(await filesWorkspace(files));
}

async function pickDirectory(): Promise<void> {
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' });
      setStatus(t('scanning', { name: dir.name }));
      await openWorkspace(await scanFolder(dir), { handle: dir });
    } catch (err) {
      if (!isAbort(err)) setStatus(errMsg(err), 'error');
    }
    return;
  }
  const files = await pickWithInput(true);
  if (files.length) await openWorkspace(await filesWorkspace(files));
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
    await openWorkspace(await scanFolder(dir), { handle: dir });
    return;
  }
  const mdHandle = handles.find(
    (h): h is FileSystemFileHandle => h.kind === 'file' && isMarkdownName(h.name),
  );
  if (mdHandle) {
    await openWorkspace(fromFileHandle(mdHandle), { handle: mdHandle });
    return;
  }
  if (files.length) await openWorkspace(await filesWorkspace(files));
}

/** Scans the open folder again (after the scan limit changed), staying on the current document. */
async function rescanFolder(): Promise<void> {
  if (recentHandle?.kind !== 'directory') return; // a single file or dropped files: nothing to scan
  const dir = recentHandle;
  setStatus(t('scanning', { name: dir.name }));
  try {
    await openWorkspace(await scanFolder(dir), { handle: dir, docPath: currentDoc?.path });
  } catch (err) {
    setStatus(errMsg(err), 'error');
  }
}

// ---- reopening after a reload ------------------------------------------------

function recentName(handle: { kind: string; name: string }): string {
  return handle.kind === 'directory' ? `${handle.name}/` : handle.name;
}

async function reopen({ handle, docPath }: Recent): Promise<void> {
  if (ws) return; // the user opened something else meanwhile
  try {
    if (handle.kind === 'directory') {
      setStatus(t('scanning', { name: handle.name }));
      await openWorkspace(await scanFolder(handle), { handle, docPath });
    } else {
      await openWorkspace(fromFileHandle(handle), { handle, docPath });
    }
  } catch (err) {
    setStatus(t('reopenFailed', { name: recentName(handle), error: errMsg(err) }), 'error');
    await removeRecent(handle);
  }
}

/**
 * Reopens the most recent file / folder when the last open could be remembered. Chrome often keeps
 * the read permission across a reload; otherwise asking again needs a click, so the list is offered.
 */
async function restoreRecent(): Promise<void> {
  const { entries, resume } = await loadRecent();
  if (!entries.length || ws) return;
  if (resume) {
    const state = await entries[0].handle.queryPermission({ mode: 'read' }).catch(() => 'denied' as const);
    if (state === 'granted') return reopen(entries[0]);
  }
  renderRecent(entries);
}

async function refreshRecent(): Promise<void> {
  renderRecent((await loadRecent()).entries);
}

function formatWhen(time: number): string {
  if (!time) return '';
  const minutes = Math.round((Date.now() - time) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (minutes < 60) return rtf.format(-Math.max(minutes, 0), 'minute');
  if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), 'hour');
  if (minutes < 60 * 24 * 7) return rtf.format(-Math.round(minutes / (60 * 24)), 'day');
  return new Date(time).toLocaleDateString(lang);
}

/**
 * Clicking is a user gesture, so the read permission can be asked for here. A refused or dismissed
 * prompt keeps the entry (the user may try again); only a failed open (e.g. file gone) removes it.
 */
async function openRecent(entry: RecentEntry): Promise<void> {
  const answer = await entry.handle.requestPermission({ mode: 'read' }).catch(() => 'denied' as const);
  if (answer === 'granted') await reopen(entry);
  else setStatus(t('recentDenied', { name: recentName(entry) }), 'error');
  if (!ws) await refreshRecent();
}

function renderRecent(entries: RecentEntry[]): void {
  const el = $<HTMLElement>('recent');
  if (ws || entries.length === 0) {
    el.hidden = true;
    return;
  }
  const head = document.createElement('div');
  head.className = 'recent-head';
  const title = document.createElement('h2');
  title.textContent = t('recent');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'recent-clear';
  clear.textContent = t('recentClear');
  clear.onclick = async () => {
    await clearRecent();
    await refreshRecent();
  };
  head.append(title, clear);

  const list = document.createElement('ul');
  for (const entry of entries) {
    const item = document.createElement('li');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'recent-open';
    const parts: [string, string][] = [
      ['recent-icon', entry.kind === 'directory' ? '📁' : '📄'],
      ['recent-name', recentName(entry)],
      ['recent-doc', entry.docPath ?? ''],
      ['recent-when', formatWhen(entry.openedAt)],
    ];
    for (const [cls, text] of parts) {
      if (!text) continue;
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      if (cls === 'recent-icon') span.setAttribute('aria-hidden', 'true');
      open.append(span);
    }
    open.onclick = () => void openRecent(entry);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'recent-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', t('recentRemove', { name: recentName(entry) }));
    remove.title = remove.getAttribute('aria-label') ?? '';
    remove.onclick = async () => {
      await removeRecent(entry.handle);
      await refreshRecent();
    };
    item.append(open, remove);
    list.append(item);
  }
  el.replaceChildren(head, list);
  el.hidden = false;
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
mountFontSettings(document.querySelector<HTMLElement>('.toolbar')!, { onScanLimitChange: () => void rescanFolder() });
mountTocPanel(document.querySelector<HTMLElement>('.toolbar')!, tocEl);
mountSkipLink(document.querySelector<HTMLElement>('.toolbar')!);
const sourceView = mountSourceView(document.querySelector<HTMLElement>('.toolbar')!, contentEl, tocEl, () => toc.update());
// Diagrams carry their theme's colours, so redraw them when the theme changes.
onThemeChange(() => void renderDiagrams(contentEl).then(() => applyMediaSizes(contentEl)));
enableImageZoom(contentEl);
if (location.protocol === 'chrome-extension:') {
  void import('./extension/setup-banner').then((m) => m.mountSetupBanner($('setup-banner-slot')));
}

$('open-file').addEventListener('click', pickFile);
$('open-dir').addEventListener('click', pickDirectory);

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
