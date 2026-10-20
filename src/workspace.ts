import { resolvePath, type AssetResolver } from './core/assets';

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
  /** The folder scan hit MAX_SCAN, so some (deeper) documents are missing. */
  truncated?: boolean;
  read(doc: DocEntry): Promise<DocContent>;
  /** Cheap change check (no content read). */
  stat(doc: DocEntry): Promise<string>;
  /** Creates a resolver for one render pass. Call the returned release() before the next pass. */
  assetResolver(doc: DocEntry): { resolve: AssetResolver | null; release: () => void };
}

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build']);
export const MAX_SCAN = 5000;

export function isMarkdownName(name: string): boolean {
  return MD_EXT.test(name);
}

function isSkippedDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name);
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
 * Breadth-first, so hitting MAX_SCAN only drops the deepest levels: depth-first used to spend
 * the whole budget inside the first large subfolder and silently skip every folder after it.
 */
async function scanDirectory(dir: FileSystemDirectoryHandle): Promise<{ docs: DocEntry[]; truncated: boolean }> {
  const found: DocEntry[] = [];
  const queue: [FileSystemDirectoryHandle, string][] = [[dir, '']];
  let visited = 0;
  let truncated = false;
  scan: for (let i = 0; i < queue.length; i++) {
    const [handle, prefix] = queue[i];
    for await (const entry of handle.values()) {
      if (++visited > MAX_SCAN) {
        truncated = true;
        break scan;
      }
      if (entry.kind === 'directory') {
        if (!isSkippedDir(entry.name)) queue.push([entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`]);
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

export async function fromDirectoryHandle(root: FileSystemDirectoryHandle): Promise<Workspace> {
  const { docs, truncated } = await scanDirectory(root);
  return {
    label: `${root.name}/`,
    docs,
    watchable: true,
    truncated,
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
 */
function inSkippedDir(path: string): boolean {
  return path.split('/').slice(1, -1).some(isSkippedDir);
}

export function fromFiles(files: File[]): Workspace {
  const byPath = new Map<string, File>();
  for (const f of files) byPath.set(f.webkitRelativePath || f.name, f);
  const docs = [...byPath.keys()]
    .filter((p) => isMarkdownName(p) && !inSkippedDir(p))
    .sort()
    .map((path) => ({ path }));
  return {
    label: docs.length === 1 ? docs[0].path : `${files.length} files`,
    docs,
    watchable: false,
    async read(doc) {
      const file = byPath.get(doc.path)!;
      return { text: await file.text(), stamp: stampOf(file) };
    },
    stat: async (doc) => stampOf(byPath.get(doc.path)!),
    assetResolver: (doc) => blobResolverScope(async (p) => byPath.get(p) ?? null, doc),
  };
}
