import { resolvePath, type AssetResolver } from './core/assets';
import { SCAN_LIMIT_DEFAULT } from './core/scan-limit';
import { isDefaultSkippedDir, isHiddenDir } from './core/hidden-dirs';

export interface DocEntry {
  /** Path relative to the workspace root, e.g. "docs/guide.md". */
  path: string;
}

export interface DocContent {
  text: string;
  /** Changes whenever the file content changes; used for polling. */
  stamp: string;
}

/**
 * Something the user opened: a single file, a folder, or plain dropped files.
 * Hides whether we have File System Access handles (watchable) or only File snapshots.
 */
export interface Workspace {
  label: string;
  docs: DocEntry[];
  watchable: boolean;
  /** Set when the folder scan stopped at this entry limit, so some (deeper) documents are missing. */
  truncatedAt?: number;
  /** Folders the user hid from the list, in the same coordinates as doc paths ("docs/old"). */
  hiddenDirs?: string[];
  /** Name the hidden-folder list is remembered under (the opened folder's name). */
  folder?: string;
  /** The same folder listed again without `hidden` (folders only: a single file has none). */
  rescan?(hidden: string[]): Promise<Workspace>;
  read(doc: DocEntry): Promise<DocContent>;
  /** Cheap change check (no content read). */
  stat(doc: DocEntry): Promise<string>;
  /** Creates a resolver for one render pass. Call the returned release() before the next pass. */
  assetResolver(doc: DocEntry): { resolve: AssetResolver | null; release: () => void };
}

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

export function isMarkdownName(name: string): boolean {
  return MD_EXT.test(name);
}

function stampOf(file: File): string {
  return `${file.lastModified}:${file.size}`;
}

function blobResolverScope(lookup: (path: string) => Promise<Blob | null>, doc: DocEntry) {
  const urls: string[] = [];
  const resolve: AssetResolver = async (ref) => {
    const path = resolvePath(doc.path, ref);
    if (path === null) return null;
    const blob = await lookup(path).catch(() => null);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  };
  return { resolve, release: () => urls.splice(0).forEach((u) => URL.revokeObjectURL(u)) };
}

// ---- single file handle -------------------------------------------------

export function fromFileHandle(handle: FileSystemFileHandle): Workspace {
  const doc = { path: handle.name };
  return {
    label: handle.name,
    docs: [doc],
    watchable: true,
    async read() {
      const file = await handle.getFile();
      return { text: await file.text(), stamp: stampOf(file) };
    },
    stat: async () => stampOf(await handle.getFile()),
    // Browsers give no access to sibling files of a single picked file.
    assetResolver: () => ({ resolve: null, release: () => {} }),
  };
}

// ---- directory handle ---------------------------------------------------

/**
 * Breadth-first, so hitting the limit only drops the deepest levels: depth-first used to spend
 * the whole budget inside the first large subfolder and silently skip every folder after it.
 */
async function scanDirectory(
  dir: FileSystemDirectoryHandle,
  limit: number,
  hidden: readonly string[] = [],
): Promise<{ docs: DocEntry[]; truncated: boolean }> {
  const found: DocEntry[] = [];
  const queue: [FileSystemDirectoryHandle, string][] = [[dir, '']];
  let visited = 0;
  let truncated = false;
  scan: for (let i = 0; i < queue.length; i++) {
    const [handle, prefix] = queue[i];
    for await (const entry of handle.values()) {
      if (++visited > limit) {
        truncated = true;
        break scan;
      }
      if (entry.kind === 'directory') {
        // Hidden folders are never entered, so they cost no reads and nothing of the limit.
        const path = `${prefix}${entry.name}`;
        if (!isDefaultSkippedDir(entry.name) && !isHiddenDir(path, hidden)) queue.push([entry as FileSystemDirectoryHandle, `${path}/`]);
      } else if (isMarkdownName(entry.name)) {
        found.push({ path: `${prefix}${entry.name}` });
      }
    }
  }
  return { docs: found.sort((a, b) => a.path.localeCompare(b.path)), truncated };
}

async function getFileByPath(root: FileSystemDirectoryHandle, path: string): Promise<File> {
  const segs = path.split('/');
  let dir = root;
  for (const seg of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
  const fh = await dir.getFileHandle(segs[segs.length - 1]);
  return fh.getFile();
}

export async function fromDirectoryHandle(
  root: FileSystemDirectoryHandle,
  limit = SCAN_LIMIT_DEFAULT,
  hidden: string[] = [],
): Promise<Workspace> {
  const { docs, truncated } = await scanDirectory(root, limit, hidden);
  return {
    label: `${root.name}/`,
    docs,
    watchable: true,
    truncatedAt: truncated ? limit : undefined,
    hiddenDirs: hidden,
    folder: root.name,
    rescan: (next) => fromDirectoryHandle(root, limit, next),
    async read(doc) {
      const file = await getFileByPath(root, doc.path);
      return { text: await file.text(), stamp: stampOf(file) };
    },
    stat: async (doc) => stampOf(await getFileByPath(root, doc.path)),
    assetResolver: (doc) => blobResolverScope((p) => getFileByPath(root, p), doc),
  };
}

// ---- plain File objects (fallback when handles are unavailable) ----------

/**
 * Applies the same directory exclusions as scanDirectory() to a webkitRelativePath.
 * The first segment is the picked folder itself, which (like the scan root) is never skipped.
 * `hidden` uses the same coordinates as the path (picked folder first), as the tree shows them.
 */
function inSkippedDir(path: string, hidden: readonly string[]): boolean {
  const dir = path.slice(0, Math.max(path.lastIndexOf('/'), 0));
  return path.split('/').slice(1, -1).some(isDefaultSkippedDir) || (dir !== '' && isHiddenDir(dir, hidden));
}

export function fromFiles(files: File[], hidden: string[] = []): Workspace {
  const byPath = new Map<string, File>();
  for (const f of files) byPath.set(f.webkitRelativePath || f.name, f);
  const docs = [...byPath.keys()]
    .filter((p) => isMarkdownName(p) && !inSkippedDir(p, hidden))
    .sort()
    .map((path) => ({ path }));
  // A picked folder: every path starts with its name. Plain dropped files can't hide anything.
  const top = new Set([...byPath.keys()].map((p) => (p.includes('/') ? p.split('/')[0] : '')));
  const folder = top.size === 1 && !top.has('') ? [...top][0] : undefined;
  return {
    label: docs.length === 1 ? docs[0].path : `${files.length} files`,
    docs,
    watchable: false,
    // Nothing to read again: the File snapshots are filtered in memory.
    ...(folder !== undefined && { hiddenDirs: hidden, folder, rescan: async (next: string[]) => fromFiles(files, next) }),
    async read(doc) {
      const file = byPath.get(doc.path)!;
      return { text: await file.text(), stamp: stampOf(file) };
    },
    stat: async (doc) => stampOf(byPath.get(doc.path)!),
    assetResolver: (doc) => blobResolverScope(async (p) => byPath.get(p) ?? null, doc),
  };
}
