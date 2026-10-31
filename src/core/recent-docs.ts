// Documents opened in this tab, newest first, per folder: the quick switcher offers them first.
// sessionStorage, because a file:// tab loads a new page for every document: the list survives
// those loads and goes away with the tab. Never synced or kept after the tab closes.

const KEY = 'md-browser:recent-docs';
const MAX_DOCS = 20;
const MAX_ROOTS = 20;

type RecentMap = Record<string, string[]>;

function read(): RecentMap {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    // No prototype, so a folder named "__proto__" is a plain key.
    const map: RecentMap = Object.create(null);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.assign(map, raw) : map;
  } catch {
    return Object.create(null);
  }
}

/** Paths opened under `root`, newest first. */
export function recentDocs(root: string): string[] {
  const list = read()[root];
  return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : [];
}

/** Puts `path` first in `root`'s list. The most recently used folders are kept. */
export function noteRecentDoc(root: string, path: string): void {
  const map = read();
  const list = [path, ...recentDocs(root).filter((p) => p !== path)].slice(0, MAX_DOCS);
  // Re-inserted last, so object order is oldest first.
  delete map[root];
  map[root] = list;
  const roots = Object.keys(map);
  for (const old of roots.slice(0, Math.max(0, roots.length - MAX_ROOTS))) delete map[old];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable: the switcher just lists files by name.
  }
}
