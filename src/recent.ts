// Remembers recently opened files / folders so a reload (or a later visit) can bring them back.
// Only File System Access handles can be kept (IndexedDB stores them as-is); files from the
// <input> fallback can't be reopened.

export type RecentHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

export interface Recent {
  handle: RecentHandle;
  /** Document that was showing, relative to the workspace root. */
  docPath?: string;
}

export interface RecentEntry extends Recent {
  kind: 'file' | 'directory';
  name: string;
  /** Epoch ms of the last time it was opened or switched to another document. */
  openedAt: number;
}

export const MAX_RECENT = 10;

export type IsSame = (a: RecentHandle, b: RecentHandle) => Promise<boolean>;

// ---- list logic (pure, unit-tested) ------------------------------------------

const isSameHandle: IsSame = (a, b) => a.isSameEntry(b).catch(() => false);

export function makeEntry(recent: Recent, now = Date.now()): RecentEntry {
  return { ...recent, kind: recent.handle.kind, name: recent.handle.name, openedAt: now };
}

/** Puts the entry first; an older entry for the same file / folder is dropped. */
export async function upsertEntry(
  list: RecentEntry[],
  entry: RecentEntry,
  isSame: IsSame = isSameHandle,
  max = MAX_RECENT,
): Promise<RecentEntry[]> {
  const same = await Promise.all(list.map((e) => isSame(e.handle, entry.handle)));
  return [entry, ...list.filter((_, i) => !same[i])].slice(0, max);
}

export async function removeEntry(list: RecentEntry[], handle: RecentHandle, isSame: IsSame = isSameHandle): Promise<RecentEntry[]> {
  const same = await Promise.all(list.map((e) => isSame(e.handle, handle)));
  return list.filter((_, i) => !same[i]);
}

function isHandle(value: unknown): value is RecentHandle {
  return !!value && typeof (value as RecentHandle).queryPermission === 'function';
}

/** Reads what IndexedDB returned, dropping anything malformed. `legacy` is the old single 'last' record. */
export function normalizeEntries(list: unknown, legacy?: unknown): RecentEntry[] {
  const source = Array.isArray(list) ? list : legacy ? [legacy] : []; // old data: one entry, no kind / name / date
  const entries: RecentEntry[] = [];
  for (const item of source as Partial<RecentEntry>[]) {
    if (!item || !isHandle(item.handle)) continue;
    entries.push({
      handle: item.handle,
      kind: item.handle.kind,
      name: item.handle.name,
      docPath: typeof item.docPath === 'string' ? item.docPath : undefined,
      openedAt: typeof item.openedAt === 'number' ? item.openedAt : 0,
    });
  }
  return entries.slice(0, MAX_RECENT);
}

// ---- IndexedDB (thin) --------------------------------------------------------

const DB_NAME = 'md-browser';
const STORE = 'recent';
const LIST_KEY = 'list';
const LEGACY_KEY = 'last'; // v1.5 and earlier: a single {handle, docPath}
const RESUME_KEY = 'resume'; // false: the last thing opened couldn't be remembered, so don't auto-reopen an older one

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const read = (key: string) => withStore<unknown>('readonly', (s) => s.get(key));
const write = (key: string, value: unknown) => withStore('readwrite', (s) => s.put(value, key));

// Read-modify-write cycles must not interleave (a document switch can race another save).
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

async function loadList(): Promise<RecentEntry[]> {
  const list = await read(LIST_KEY);
  return normalizeEntries(list, Array.isArray(list) ? undefined : await read(LEGACY_KEY));
}

async function storeList(list: RecentEntry[]): Promise<void> {
  await write(LIST_KEY, list);
  await withStore('readwrite', (s) => s.delete(LEGACY_KEY)); // migrated
}

// Storage can be unavailable (private mode, blocked site data): remembering is best effort.
export function saveRecent(recent: Recent): Promise<void> {
  return serial(async () => {
    await storeList(await upsertEntry(await loadList(), makeEntry(recent)));
    await write(RESUME_KEY, true);
  }).catch(() => {});
}

/** Something that can't be remembered was opened: keep the history, but a reload must not bring back an older item. */
export function skipResume(): Promise<void> {
  return serial(() => write(RESUME_KEY, false)).then(
    () => {},
    () => {},
  );
}

export function removeRecent(handle: RecentHandle): Promise<void> {
  return serial(async () => storeList(await removeEntry(await loadList(), handle))).catch(() => {});
}

export function clearRecent(): Promise<void> {
  return serial(async () => {
    await write(LIST_KEY, []);
    await withStore('readwrite', (s) => s.delete(LEGACY_KEY));
  }).catch(() => {});
}

export async function loadRecent(): Promise<{ entries: RecentEntry[]; resume: boolean }> {
  return serial(async () => ({ entries: await loadList(), resume: (await read(RESUME_KEY)) !== false })).catch(() => ({
    entries: [],
    resume: false,
  }));
}
