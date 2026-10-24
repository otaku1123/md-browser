// Lists the Markdown files below a file:// folder from Chrome's directory listing pages.
// Pure apart from the injected fetch, so the walk can be unit-tested.

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

/** Hidden entries (.git, .github, …) and node_modules are never read or listed. */
export const isSkipped = (name: string) => name.startsWith('.') || name === 'node_modules' || name.includes('/');

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
 * Breadth-first walk from `rootUrl` (a folder URL ending in '/'), never above it.
 * A failing root listing rejects; failing subfolders are skipped.
 */
export async function listMarkdownTree(
  rootUrl: string,
  fetchText: (url: string) => Promise<string>,
  limits: WalkLimits = WALK_LIMITS,
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
