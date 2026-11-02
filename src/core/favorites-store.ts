// Documents the user starred in the file sidebar, per opened folder: listed first in the sidebar
// and in the quick switcher. Keyed like the hidden folders (hidden-dirs-store.ts): on file://
// pages by the tab root's URL, in the web app and the viewer by the opened folder's name. Local
// only, never synced: the paths describe the user's files.

export const FAVORITES_KEY = 'md-browser:favorites';
/** Enough for a hand-picked list; keeps a corrupted or hostile stored value small. */
export const FAVORITES_MAX = 100;

type FavoritesMap = Record<string, string[]>;

/** One root-relative file path ("docs/a.md"), or null when malformed or pointing outside the root. */
function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim().replace(/^\/+|\/+$/g, '');
  if (!path || path.includes('\\')) return null;
  const segs = path.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return null;
  return path;
}

/** Stored value → valid, unique paths in the order they were starred (anything else is dropped). */
export function normalizeFavorites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    const path = normalizePath(item);
    if (path) out.add(path);
  }
  return [...out].slice(0, FAVORITES_MAX);
}

/** Adds `path` at the end, or removes it when it is already there. */
export function toggleFavorite(favorites: readonly string[], path: string): string[] {
  const p = normalizePath(path);
  if (!p) return normalizeFavorites(favorites);
  return favorites.includes(p) ? normalizeFavorites(favorites.filter((f) => f !== p)) : normalizeFavorites([...favorites, p]);
}

function normalizeMap(raw: unknown): FavoritesMap {
  // No prototype, so folders named "__proto__" or "constructor" are plain keys.
  const out: FavoritesMap = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [folder, paths] of Object.entries(raw)) {
    const list = normalizeFavorites(paths);
    if (list.length) out[folder] = list;
  }
  return out;
}

async function readMap(): Promise<FavoritesMap> {
  const local = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (local) return normalizeMap((await local.get(FAVORITES_KEY))[FAVORITES_KEY]);
  try {
    return normalizeMap(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? 'null'));
  } catch {
    return normalizeMap(null);
  }
}

async function writeMap(map: FavoritesMap): Promise<void> {
  const local = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (local) return local.set({ [FAVORITES_KEY]: map });
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private mode etc.): the stars last for this page only.
  }
}

export async function loadFavorites(folder: string): Promise<string[]> {
  return (await readMap().catch(() => normalizeMap(null)))[folder] ?? [];
}

export async function saveFavorites(folder: string, paths: readonly string[]): Promise<void> {
  const map = await readMap().catch(() => normalizeMap(null));
  const list = normalizeFavorites(paths);
  if (list.length) map[folder] = list;
  else delete map[folder];
  await writeMap(map);
}
