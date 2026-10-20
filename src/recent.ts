// Remembers what was opened last so a reload can bring it back. Only File System Access handles
// can be kept (IndexedDB stores them as-is); files from the <input> fallback can't be reopened.

export type RecentHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

export interface Recent {
  handle: RecentHandle;
  /** Document that was showing, relative to the workspace root. */
  docPath?: string;
}

const DB_NAME = 'md-browser';
const STORE = 'recent';
const KEY = 'last';

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

// Storage can be unavailable (private mode, blocked site data): remembering is best effort.
export async function saveRecent(recent: Recent): Promise<void> {
  await withStore('readwrite', (s) => s.put(recent, KEY)).catch(() => {});
}

export async function clearRecent(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(KEY)).catch(() => {});
}

export async function loadRecent(): Promise<Recent | null> {
  const value = await withStore<unknown>('readonly', (s) => s.get(KEY)).catch(() => null);
  const recent = value as Partial<Recent> | null;
  return recent?.handle && typeof recent.handle.queryPermission === 'function' ? (recent as Recent) : null;
}
