// The shortcut that opens the quick file switcher, chosen in the display settings. ⌘/Ctrl+P is
// also the browser's print shortcut, so there are alternatives and a way to turn it off.
import { createSettingsStore, type SettingsStore } from './settings-store';

export const QUICK_OPEN_KEYS = ['mod+p', 'mod+k', 'mod+shift+p', 'off'] as const;
export type QuickOpenKey = (typeof QUICK_OPEN_KEYS)[number];
export const QUICK_OPEN_KEY_DEFAULT: QuickOpenKey = 'mod+p';

export function normalizeQuickOpenKey(raw: unknown): QuickOpenKey {
  return (QUICK_OPEN_KEYS as readonly unknown[]).includes(raw) ? (raw as QuickOpenKey) : QUICK_OPEN_KEY_DEFAULT;
}

const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "⌘P" / "Ctrl+P" etc. for this platform; '' when off. */
export function quickOpenKeyLabel(key: QuickOpenKey): string {
  if (key === 'off') return '';
  const shift = key.includes('shift');
  const letter = key.slice(-1).toUpperCase();
  return isMac() ? `⌘${shift ? '⇧' : ''}${letter}` : `Ctrl+${shift ? 'Shift+' : ''}${letter}`;
}

/** Ctrl or ⌘ (like the source view's shortcut), exactly the chosen Shift, no Alt. */
export function matchesQuickOpenKey(e: KeyboardEvent, key: QuickOpenKey): boolean {
  if (key === 'off' || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
  return e.shiftKey === key.includes('shift') && e.key.toLowerCase() === key.slice(-1);
}

let store: SettingsStore<QuickOpenKey> | undefined;

/**
 * Shared by the settings panel and the switcher. A save is also announced on this page: the web
 * app's localStorage only tells other tabs (chrome.storage tells this one too; a repeat is harmless).
 */
export function quickOpenKeyStore(): SettingsStore<QuickOpenKey> {
  if (store) return store;
  const base = createSettingsStore('md-browser:quick-open-key', normalizeQuickOpenKey);
  const listeners: ((key: QuickOpenKey) => void)[] = [];
  base.onChange((key) => listeners.forEach((cb) => cb(key)));
  return (store = {
    load: base.load,
    save: async (key) => {
      await base.save(key);
      listeners.forEach((cb) => cb(key));
    },
    onChange: (cb) => void listeners.push(cb),
  });
}
