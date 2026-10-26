// Folders left out of the file list: built-in exclusions plus the ones the user hid from the
// sidebar. Pure, so the web scan, the file:// walk and the stores all share the same rules.

/** Dependency, build output and virtualenv folders: rarely documentation, often huge. */
export const DEFAULT_SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'venv',
  '__pycache__',
]);

/** Hidden entries (.git, .github, .venv, …) and the folders above are never read or listed. */
export function isDefaultSkippedDir(name: string): boolean {
  return name.startsWith('.') || DEFAULT_SKIP_DIRS.has(name);
}

/** Enough for any real tree; keeps a corrupted or hostile stored value small. */
export const HIDDEN_DIRS_MAX = 200;

/** One relative folder path ("a/b"), or null when it could point outside the root or is malformed. */
function normalizeDir(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim().replace(/^\/+|\/+$/g, '');
  if (!path || path.includes('\\')) return null;
  const segs = path.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return null;
  return path;
}

/** Stored value → valid, unique, sorted folder paths (anything else is dropped). */
export function normalizeHiddenDirs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    const dir = normalizeDir(item);
    if (dir) out.add(dir);
  }
  return [...out].sort().slice(0, HIDDEN_DIRS_MAX);
}

/** `relDir` ("a/b", no trailing slash) is a hidden folder or lies below one. */
export function isHiddenDir(relDir: string, hidden: readonly string[]): boolean {
  return hidden.some((h) => relDir === h || relDir.startsWith(`${h}/`));
}

/** Adds `dir`; folders below it become redundant and are dropped. */
export function addHiddenDir(hidden: readonly string[], dir: string): string[] {
  const d = normalizeDir(dir);
  if (!d || isHiddenDir(d, hidden)) return normalizeHiddenDirs(hidden);
  return normalizeHiddenDirs([...hidden.filter((h) => !isHiddenDir(h, [d])), d]);
}

export function removeHiddenDir(hidden: readonly string[], dir: string): string[] {
  const d = normalizeDir(dir);
  return normalizeHiddenDirs(hidden.filter((h) => h !== d));
}
