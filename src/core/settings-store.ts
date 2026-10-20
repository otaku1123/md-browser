// Persists a small settings object. Extension pages and content scripts share chrome.storage.sync
// (so every tab and the viewer see the change); the web app uses localStorage.

export interface SettingsStore<T> {
  load(): Promise<T>;
  save(value: T): Promise<void>;
  /** Called when another tab (or the viewer) saved a new value. */
  onChange(cb: (value: T) => void): void;
}

export function createSettingsStore<T>(key: string, normalize: (raw: unknown) => T): SettingsStore<T> {
  const sync = typeof chrome !== 'undefined' ? chrome.storage?.sync : undefined;
  if (sync) {
    return {
      load: async () => normalize((await sync.get(key))[key]),
      save: (value) => sync.set({ [key]: value }),
      onChange: (cb) =>
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync' && key in changes) cb(normalize(changes[key].newValue));
        }),
    };
  }
  const read = (): T => {
    try {
      return normalize(JSON.parse(localStorage.getItem(key) ?? 'null'));
    } catch {
      return normalize(null);
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
