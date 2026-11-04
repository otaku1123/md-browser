// Persists a small settings object. Extension pages and content scripts share chrome.storage
// (so every tab and the viewer see the change); the web app uses localStorage. Settings go to
// the "sync" area unless they are too big for its 8 KB per-item quota or should stay on this
// computer ("local").

export interface SettingsStore<T> {
  load(): Promise<T>;
  save(value: T): Promise<void>;
  /** Called when another tab (or the viewer) saved a new value. */
  onChange(cb: (value: T) => void): void;
}

export type StorageArea = 'sync' | 'local';

export function createSettingsStore<T>(key: string, normalize: (raw: unknown) => T, area: StorageArea = 'sync'): SettingsStore<T> {
  const storage = typeof chrome !== 'undefined' ? chrome.storage?.[area] : undefined;
  if (storage) {
    return {
      load: async () => normalize((await storage.get(key))[key]),
      save: (value) => storage.set({ [key]: value }),
      onChange: (cb) =>
        chrome.storage.onChanged.addListener((changes, changedArea) => {
          if (changedArea === area && key in changes) cb(normalize(changes[key].newValue));
        }),
    };
  }
  const read = (): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
      return normalize(JSON.parse(raw ?? 'null'));
    } catch {
      // Not JSON: a value saved as a bare string before this store existed (e.g. the files sidebar).
      return normalize(raw);
    }
  };
  return {
    load: async () => read(),
    save: async (value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage unavailable (private mode etc.): the choice lasts for this page only.
      }
    },
    onChange: (cb) =>
      window.addEventListener('storage', (e) => {
        if (e.key === key) cb(read());
      }),
  };
}
