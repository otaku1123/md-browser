// Light / dark theme. "auto" follows the OS (prefers-color-scheme); "light" / "dark" pin it
// by setting data-theme on <html>, which style.css checks next to the media query.

export type ThemePreference = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['auto', 'light', 'dark'];

export function normalizeTheme(v: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(v as ThemePreference) ? (v as ThemePreference) : 'auto';
}

const osDark = () => window.matchMedia('(prefers-color-scheme: dark)');

/** The theme the screen is showing now. */
export function currentTheme(): Theme {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === 'light' || pinned === 'dark') return pinned;
  return osDark().matches ? 'dark' : 'light';
}

const listeners = new Set<(theme: Theme) => void>();
let shown: Theme | null = null;
let watching = false;

function notifyIfChanged(): void {
  const next = currentTheme();
  if (next === shown) return;
  shown = next;
  for (const cb of listeners) cb(next);
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = pref;
  notifyIfChanged();
}

/** Calls cb whenever the shown theme changes, by the setting or by the OS. */
export function onThemeChange(cb: (theme: Theme) => void): void {
  shown ??= currentTheme();
  listeners.add(cb);
  if (!watching) {
    watching = true;
    osDark().addEventListener('change', notifyIfChanged);
  }
}
