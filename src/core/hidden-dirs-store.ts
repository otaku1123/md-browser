// Remembers the folders hidden from the sidebar for each folder opened in the viewer (web app or
// extension viewer). Browsers give no absolute path for a picked folder, so lists are keyed by the
// folder's name: two folders with the same name share one list. Local only, never synced: the
// names describe the user's files. (file:// tabs keep theirs in the background, keyed by URL.)
import { normalizeHiddenDirs } from './hidden-dirs';

export const HIDDEN_DIRS_KEY = 'md-browser:hidden-dirs';

type HiddenMap = Record<string, string[]>;

function normalizeMap(raw: unknown): HiddenMap {
  // No prototype, so folders named "__proto__" or "constructor" are plain keys.
  const out: HiddenMap = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [folder, dirs] of Object.entries(raw)) {
    const list = normalizeHiddenDirs(dirs);
    if (list.length) out[folder] = list;
  }
  return out;
}

async function readMap(): Promise<HiddenMap> {
  const local = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (local) return normalizeMap((await local.get(HIDDEN_DIRS_KEY))[HIDDEN_DIRS_KEY]);
  try {
    return normalizeMap(JSON.parse(localStorage.getItem(HIDDEN_DIRS_KEY) ?? 'null'));
  } catch {
    return normalizeMap(null);
  }
}

async function writeMap(map: HiddenMap): Promise<void> {
  const local = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (local) return local.set({ [HIDDEN_DIRS_KEY]: map });
  try {
    localStorage.setItem(HIDDEN_DIRS_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private mode etc.): the choice lasts for this page only.
  }
}

export async function loadHiddenDirs(folder: string): Promise<string[]> {
  return (await readMap().catch(() => normalizeMap(null)))[folder] ?? [];
}

export async function saveHiddenDirs(folder: string, dirs: readonly string[]): Promise<void> {
  const map = await readMap().catch(() => normalizeMap(null));
  const list = normalizeHiddenDirs(dirs);
  if (list.length) map[folder] = list;
  else delete map[folder];
  await writeMap(map);
}
