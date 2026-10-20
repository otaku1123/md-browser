// Display settings panel ("Aa"): theme, and fonts for the document body and code. Fonts are
// referenced by name (installed on the user's computer); unknown names fall back to the default stack.
import { t } from '../i18n';
import { createSettingsStore } from './settings-store';
import { THEME_PREFERENCES, applyTheme, normalizeTheme, type ThemePreference } from './theme';

export interface FontSettings {
  body: string;
  code: string;
}

const EMPTY: FontSettings = { body: '', code: '' };
const STORAGE_KEY = 'md-browser:fonts';
const THEME_KEY = 'md-browser:theme';
const SAVE_DELAY_MS = 400; // chrome.storage.sync allows ~120 writes per minute

const BODY_PRESETS = [
  'Hiragino Sans', 'Hiragino Mincho ProN', 'Yu Gothic', 'Yu Mincho', 'Meiryo', 'BIZ UDPGothic',
  'Noto Sans JP', 'Noto Serif JP', 'Segoe UI', 'Helvetica Neue', 'Arial', 'Georgia', 'Times New Roman',
];
const CODE_PRESETS = [
  'Menlo', 'SF Mono', 'Monaco', 'Consolas', 'Cascadia Code', 'Courier New',
  'Source Code Pro', 'JetBrains Mono', 'Fira Code', 'BIZ UDGothic', 'Osaka-Mono',
];

/** Keeps only characters that are safe inside a quoted CSS font-family name. */
export function sanitizeFontName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.replace(/["'\\;{}<>\u0000-\u001f]/g, '').trim().slice(0, 100);
}

function normalize(v: unknown): FontSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof FontSettings, unknown>>;
  return { body: sanitizeFontName(o.body), code: sanitizeFontName(o.code) };
}

/** Overrides the CSS variables defined in style.css; the default stack stays as the fallback. */
export function applyFonts(s: FontSettings): void {
  const root = document.documentElement.style;
  for (const [key, prop] of [['body', '--font-body'], ['code', '--font-code']] as const) {
    const name = sanitizeFontName(s[key]);
    if (name) root.setProperty(prop, `"${name}", var(${prop}-default)`);
    else root.removeProperty(prop);
  }
}

let uid = 0;

const THEME_LABELS = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' } as const;

/** Adds the "Aa" button and its panel to the end of the toolbar. */
export function mountFontSettings(toolbar: HTMLElement): void {
  const store = createSettingsStore(STORAGE_KEY, normalize);
  const themeStore = createSettingsStore(THEME_KEY, normalizeTheme);
  let current: FontSettings = { ...EMPTY };
  const id = `md-font-${++uid}`;

  const wrap = document.createElement('div');
  wrap.className = 'font-settings';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'font-settings-toggle';
  toggle.textContent = 'Aa';
  toggle.title = t('fontSettings');
  toggle.setAttribute('aria-label', t('fontSettings'));
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${id}-panel`);

  const panel = document.createElement('div');
  panel.className = 'font-settings-panel';
  panel.id = `${id}-panel`;
  panel.hidden = true;
  const heading = document.createElement('p');
  heading.className = 'font-settings-title';
  heading.textContent = t('fontSettings');

  function field(key: keyof FontSettings, label: string, presets: string[]): HTMLInputElement {
    const row = document.createElement('label');
    row.className = 'font-settings-row';
    const text = document.createElement('span');
    text.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('fontDefault');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('list', `${id}-${key}`);
    const list = document.createElement('datalist');
    list.id = `${id}-${key}`;
    for (const name of presets) {
      const opt = document.createElement('option');
      opt.value = name;
      list.append(opt);
    }
    input.addEventListener('input', () => update({ ...current, [key]: input.value }));
    row.append(text, input, list);
    panel.append(row);
    return input;
  }

  // Theme: one radio group, applied and saved at once (a single write, no debounce needed).
  const themeRow = document.createElement('div');
  themeRow.className = 'theme-setting';
  themeRow.setAttribute('role', 'radiogroup');
  themeRow.setAttribute('aria-labelledby', `${id}-theme`);
  const themeLabel = document.createElement('span');
  themeLabel.id = `${id}-theme`;
  themeLabel.textContent = t('theme');
  const themeOptions = document.createElement('div');
  themeOptions.className = 'theme-options';
  const themeInputs = new Map<ThemePreference, HTMLInputElement>();
  for (const pref of THEME_PREFERENCES) {
    const option = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `${id}-theme`;
    radio.value = pref;
    radio.addEventListener('change', () => {
      applyTheme(pref);
      void themeStore.save(pref);
    });
    themeInputs.set(pref, radio);
    option.append(radio, t(THEME_LABELS[pref]));
    themeOptions.append(option);
  }
  themeRow.append(themeLabel, themeOptions);
  function showTheme(pref: ThemePreference): void {
    applyTheme(pref);
    themeInputs.get(pref)!.checked = true;
  }
  showTheme('auto');

  panel.append(heading, themeRow);
  const bodyInput = field('body', t('fontBody'), BODY_PRESETS);
  const codeInput = field('code', t('fontCode'), CODE_PRESETS);
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('fontHint');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = t('fontReset');
  reset.addEventListener('click', () => {
    update({ ...EMPTY });
    syncInputs(true);
  });
  panel.append(hint, reset);
  wrap.append(toggle, panel);
  toolbar.append(wrap);

  // Don't overwrite a field the user is typing in when the stored value echoes back.
  function syncInputs(force = false): void {
    if (force || document.activeElement !== bodyInput) bodyInput.value = current.body;
    if (force || document.activeElement !== codeInput) codeInput.value = current.code;
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function update(next: FontSettings): void {
    current = normalize(next);
    applyFonts(current);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void store.save(current);
    }, SAVE_DELAY_MS);
  }

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector<HTMLInputElement>('input:checked')?.focus();
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden !== false));
  document.addEventListener('mousedown', (e) => {
    if (!panel.hidden && !wrap.contains(e.target as Node)) setOpen(false);
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      toggle.focus();
    }
  });

  void themeStore.load().then(showTheme);
  themeStore.onChange(showTheme);

  void store.load().then((s) => {
    current = s;
    applyFonts(current);
    syncInputs();
  });
  // Another tab (or the viewer) changed the setting.
  store.onChange((s) => {
    if (saveTimer !== undefined) return; // a newer local edit is about to be saved
    current = s;
    applyFonts(current);
    syncInputs();
  });
}
