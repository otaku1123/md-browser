// Lists the Markdown files below a file:// folder from Chrome's directory listing pages.
// Pure apart from the injected fetch, so the walk can be unit-tested.
import { isDefaultSkippedDir, isHiddenDir } from '../core/hidden-dirs';

export interface ListingRow {
  name: string;
  /** Percent-encoded, relative to the listed folder (as Chrome writes it). */
  url: string;
  isDir: boolean;
}

export interface WalkLimits {
  /** Folder levels below the root that are still read. */
  maxDepth: number;
  maxFiles: number;
  /** Directory listings fetched, the root included. */
  maxDirs: number;
}

export const WALK_LIMITS: WalkLimits = { maxDepth: 4, maxFiles: 500, maxDirs: 200 };

export interface WalkResult {
  /** Root-relative, '/'-separated, decoded. */
  paths: string[];
  /** Some files or folders were left out because a limit was hit. */
  truncated: boolean;
}

const STR = String.raw`"(?:[^"\\]|\\.)*"`;
// Only calls with string literals match, not the `function addRow(name, url, isdir, ...)` definition.
const ADD_ROW = new RegExp(String.raw`addRow\(\s*(${STR})\s*,\s*(${STR})\s*,\s*([01])\b`, 'g');

/** Extracts the entries of a Chrome directory listing page (`addRow("name","url",isdir,...)`). */
export function parseListing(html: string): ListingRow[] {
  const rows: ListingRow[] = [];
  for (const m of html.matchAll(ADD_ROW)) {
    try {
      const name: unknown = JSON.parse(m[1]);
      const url: unknown = JSON.parse(m[2]);
      if (typeof name !== 'string' || typeof url !== 'string' || !name || name === '..') continue;
      rows.push({ name, url, isDir: m[3] === '1' });
    } catch {
      // not a plain string literal: skip the row
    }
  }
  return rows;
}

const MD_NAME = /\.(md|markdown|mdown|mkd)$/i;

export const isMarkdownFile = (name: string) => MD_NAME.test(name);

/** Hidden entries (.git, .github, …) and dependency / build folders (the viewer's scan rules)
 *  are never read or listed; neither are names containing '/', which no real entry has. */
export const isSkipped = (name: string) => isDefaultSkippedDir(name) || name.includes('/');

/** The folder holding a file:// document, with a trailing slash. */
export function folderOf(fileUrl: string): string {
  const url = fileUrl.split(/[?#]/)[0];
  return url.slice(0, url.lastIndexOf('/') + 1);
}

/**
 * The sidebar's root for a tab: the folder it was first listed for, while the tab stays in that
 * folder or below it; otherwise this file's own folder. Both end in '/', so "/a/b/" never matches "/a/bc/".
 */
export function chooseRoot(stored: string | undefined, folder: string): string {
  return stored?.endsWith('/') && folder.startsWith(stored) ? stored : folder;
}

/** `fileUrl`'s path below `rootUrl`, decoded and '/'-separated (e.g. "sub dir/a.md"). */
export function relativePath(rootUrl: string, fileUrl: string): string {
  return fileUrl.split(/[?#]/)[0].slice(rootUrl.length).split('/').map(decodeURIComponent).join('/');
}

/**
 * A root-relative document path a page may ask to read: '/'-separated segments as the listing
 * gives them, none empty, "." or ".." (so it stays below the root) and none with a backslash
 * (a separator to Windows), naming a Markdown file.
 */
export function isDocPath(path: string): boolean {
  const segs = path.split('/');
  return segs.every((s) => s !== '' && s !== '.' && s !== '..' && !s.includes('\\')) && isMarkdownFile(segs[segs.length - 1]);
}

/** The file:// URL of a root-relative path, each segment percent-encoded (as the sidebar links). */
export function fileUrlBelow(rootUrl: string, path: string): string {
  return rootUrl + path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Breadth-first walk from `rootUrl` (a folder URL ending in '/'), never above it.
 * A failing root listing rejects; failing subfolders are skipped.
 */
export async function listMarkdownTree(
  rootUrl: string,
  fetchText: (url: string) => Promise<string>,
  limits: WalkLimits = WALK_LIMITS,
  /** Root-relative folders the user hid ("docs/old"): never fetched. */
  hidden: readonly string[] = [],
): Promise<WalkResult> {
  const paths: string[] = [];
  let truncated = false;
  let fetched = 0;
  const queue: { url: string; prefix: string; depth: number }[] = [{ url: rootUrl, prefix: '', depth: 0 }];

  while (queue.length) {
    if (fetched >= limits.maxDirs) {
      truncated = true;
      break;
    }
    const dir = queue.shift()!;
    fetched++;
    let rows: ListingRow[];
    try {
      rows = parseListing(await fetchText(dir.url));
    } catch (err) {
      if (dir.depth === 0) throw err;
      continue;
    }
    for (const row of rows) {
      if (isSkipped(row.name)) continue;
      if (row.isDir) {
        if (isHiddenDir(dir.prefix + row.name, hidden)) continue;
        if (dir.depth >= limits.maxDepth) truncated = true;
        // Built from the name, not Chrome's url, so the child is always directly below this folder.
        else queue.push({ url: `${dir.url}${encodeURIComponent(row.name)}/`, prefix: `${dir.prefix}${row.name}/`, depth: dir.depth + 1 });
      } else if (isMarkdownFile(row.name)) {
        if (paths.length >= limits.maxFiles) return { paths, truncated: true };
        paths.push(dir.prefix + row.name);
      }
    }
  }
  return { paths, truncated };
}
