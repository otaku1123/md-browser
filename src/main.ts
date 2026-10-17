import './style.css';
import { renderMarkdown } from './core/render';
import { createToc } from './core/toc';
import { renderDiagrams } from './core/diagrams';
import { isRelativeRef, resolvePath, resolveImages } from './core/assets';
import {
  fromDirectoryHandle,
  fromFileHandle,
  fromFiles,
  isMarkdownName,
  type DocEntry,
  type Workspace,
} from './workspace';

const POLL_MS = 1000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const contentEl = $<HTMLElement>('content');
const tocEl = $<HTMLElement>('toc');
const statusEl = $<HTMLElement>('status');
const fileSelect = $<HTMLSelectElement>('file-select');
const overlay = $<HTMLElement>('drop-overlay');
const toc = createToc(tocEl);

let ws: Workspace | null = null;
let currentDoc: DocEntry | null = null;
let lastStamp = '';
let renderSeq = 0;
let releaseAssets: () => void = () => {};
let pollTimer: number | undefined;
let polling = false;

// ---- rendering ------------------------------------------------------------

async function showDoc(doc: DocEntry, opts: { keepScroll: boolean }): Promise<void> {
  if (!ws) return;
  const seq = ++renderSeq;
  const workspace = ws;
  let content;
  try {
    content = await workspace.read(doc);
  } catch (err) {
    setStatus(`読み込みに失敗しました: ${doc.path} (${errMsg(err)})`, 'error');
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
  if (seq !== renderSeq) {
    assets.release();
    return; // a newer render started meanwhile
  }

  const scrollY = window.scrollY;
  contentEl.replaceChildren(staging.content);
  releaseAssets();
  releaseAssets = assets.release;
  if (currentDoc !== doc) toc.reset();
  currentDoc = doc;
  lastStamp = content.stamp;
  toc.render(tocItems);
  window.scrollTo(0, opts.keepScroll ? scrollY : 0);
  toc.update();
  document.title = `${doc.path} - MD Browser`;
  setStatus(
    `${doc.path} · ${workspace.watchable ? '自動更新 ON' : '自動更新 非対応（ドロップしたファイル）'} · ${new Date().toLocaleTimeString()} 更新`,
  );
}

// ---- workspace / watching -------------------------------------------------

async function openWorkspace(next: Workspace): Promise<void> {
  if (next.docs.length === 0) {
    setStatus(`Markdown ファイルが見つかりません: ${next.label}`, 'error');
    return;
  }
  ws = next;
  fileSelect.replaceChildren(
    ...next.docs.map((d) => new Option(d.path, d.path)),
  );
  fileSelect.hidden = next.docs.length <= 1;
  const initial =
    next.docs.find((d) => /^(readme|index)\.md$/i.test(d.path)) ?? next.docs[0];
  fileSelect.value = initial.path;
  await showDoc(initial, { keepScroll: false });
  startPolling();
}

function startPolling(): void {
  window.clearInterval(pollTimer);
  if (!ws?.watchable) return;
  pollTimer = window.setInterval(poll, POLL_MS);
}

async function poll(): Promise<void> {
  if (polling || document.hidden || !ws || !currentDoc) return;
  polling = true;
  try {
    const stamp = await ws.stat(currentDoc);
    if (stamp !== lastStamp) await showDoc(currentDoc, { keepScroll: true });
  } catch (err) {
    setStatus(`ファイルにアクセスできません（削除・移動された可能性）: ${currentDoc.path} (${errMsg(err)})`, 'error');
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
      await openWorkspace(fromFileHandle(handle));
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
      setStatus(`${dir.name}/ をスキャン中…`);
      await openWorkspace(await fromDirectoryHandle(dir));
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
    setStatus(`${dir.name}/ をスキャン中…`);
    await openWorkspace(await fromDirectoryHandle(dir));
    return;
  }
  const mdHandle = handles.find(
    (h): h is FileSystemFileHandle => h.kind === 'file' && isMarkdownName(h.name),
  );
  if (mdHandle) {
    await openWorkspace(fromFileHandle(mdHandle));
    return;
  }
  if (files.length) await openWorkspace(fromFiles(files));
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

$('open-file').addEventListener('click', pickFile);
$('open-dir').addEventListener('click', pickDirectory);

fileSelect.addEventListener('change', () => {
  const doc = ws?.docs.find((d) => d.path === fileSelect.value);
  if (doc) void showDoc(doc, { keepScroll: false });
});

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
    fileSelect.value = doc.path;
    void showDoc(doc, { keepScroll: false });
  } else {
    setStatus(`リンク先を開けません: ${href}`, 'error');
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
