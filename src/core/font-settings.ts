// Display settings panel (gear button): theme, text size, content width, image size, and fonts for the
// document body and code, plus the folder scan limit in the viewer. Fonts are referenced by name (installed on the user's computer); unknown names fall back
// to the default stack.
import { t } from '../i18n';
import { createSettingsStore } from './settings-store';
import { normalizeScanLimit, scanLimitStore, SCAN_LIMIT_MAX, SCAN_LIMIT_MIN } from './scan-limit';
import { applyTheme, normalizeTheme, type ThemePreference } from './theme';

// Values for the document only: the toolbar and TOC keep their size.
const SIZES = { small: '14px', normal: '16px', large: '18px', xlarge: '20px' } as const;
const WIDTHS = { normal: '980px', wide: '1280px', full: 'none' } as const;
// Longest side of document images; "normal" keeps them as wide as the text.
const IMAGES = { normal: 'none', large: '800px', medium: '480px', small: '240px' } as const;
type TextSize = keyof typeof SIZES;
type ContentWidth = keyof typeof WIDTHS;
type ImageSize = keyof typeof IMAGES;

export interface FontSettings {
  body: string;
  code: string;
  size: TextSize;
  width: ContentWidth;
  image: ImageSize;
}

const EMPTY: FontSettings = { body: '', code: '', size: 'normal', width: 'normal', image: 'normal' };
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
  return {
    body: sanitizeFontName(o.body),
    code: sanitizeFontName(o.code),
    // Saved before size / width / image existed, or unknown: use the default.
    size: typeof o.size === 'string' && o.size in SIZES ? (o.size as TextSize) : 'normal',
    width: typeof o.width === 'string' && o.width in WIDTHS ? (o.width as ContentWidth) : 'normal',
    image: typeof o.image === 'string' && o.image in IMAGES ? (o.image as ImageSize) : 'normal',
  };
}

/** Overrides the CSS variables defined in style.css; the default stack stays as the fallback. */
export function applyFonts(s: FontSettings): void {
  const root = document.documentElement.style;
  for (const [key, prop] of [['body', '--font-body'], ['code', '--font-code']] as const) {
    const name = sanitizeFontName(s[key]);
    if (name) root.setProperty(prop, `"${name}", var(${prop}-default)`);
    else root.removeProperty(prop);
  }
  const size = SIZES[s.size] ?? SIZES.normal;
  const width = WIDTHS[s.width] ?? WIDTHS.normal;
  if (size !== SIZES.normal) root.setProperty('--doc-font-size', size);
  else root.removeProperty('--doc-font-size');
  if (width !== WIDTHS.normal) root.setProperty('--doc-max-width', width);
  else root.removeProperty('--doc-max-width');
  const image = IMAGES[s.image] ?? IMAGES.normal;
  if (image !== IMAGES.normal) root.setProperty('--doc-img-max', image);
  else root.removeProperty('--doc-img-max');
}

const GEAR_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="3"/>' +
  '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
  '</svg>';

let uid = 0;

const THEME_LABELS = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' } as const;
const SIZE_LABELS = { small: 'sizeSmall', normal: 'sizeNormal', large: 'sizeLarge', xlarge: 'sizeXlarge' } as const;
const WIDTH_LABELS = { normal: 'widthNormal', wide: 'widthWide', full: 'widthFull' } as const;
const IMAGE_LABELS = { normal: 'sizeNormal', large: 'sizeLarge', medium: 'imageMedium', small: 'sizeSmall' } as const;

/** A labelled radio group; set() shows a value without firing onPick. */
function choiceRow<V extends string>(
  name: string,
  label: string,
  labels: Record<V, Parameters<typeof t>[0]>,
  onPick: (value: V) => void,
): { row: HTMLElement; set(value: V): void } {
  const row = document.createElement('div');
  row.className = 'choice-setting';
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-labelledby', `${name}-label`);
  const text = document.createElement('span');
  text.id = `${name}-label`;
  text.textContent = label;
  const options = document.createElement('div');
  options.className = 'choice-options';
  const inputs = new Map<V, HTMLInputElement>();
  for (const value of Object.keys(labels) as V[]) {
    const option = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.value = value;
    radio.addEventListener('change', () => onPick(value));
    inputs.set(value, radio);
    option.append(radio, t(labels[value]));
    options.append(option);
  }
  row.append(text, options);
  return { row, set: (value) => void (inputs.get(value)!.checked = true) };
}

/** A number field for the folder scan limit; saved when committed (blur / Enter), clamped to range. */
function scanLimitRow(id: string, onChange: (limit: number) => void): HTMLElement {
  const limits = scanLimitStore();
  const section = document.createElement('div');
  section.className = 'scan-limit-setting';
  const row = document.createElement('label');
  row.className = 'font-settings-row';
  const text = document.createElement('span');
  text.textContent = t('scanLimit');
  const input = document.createElement('input');
  input.type = 'number';
  input.id = `${id}-scan-limit`;
  input.min = String(SCAN_LIMIT_MIN);
  input.max = String(SCAN_LIMIT_MAX);
  input.step = '100';
  input.inputMode = 'numeric';
  input.addEventListener('change', () => {
    const value = normalizeScanLimit(input.value);
    input.value = String(value);
    void limits.save(value).then(() => onChange(value));
  });
  row.append(text, input);
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('scanLimitHint', { min: SCAN_LIMIT_MIN.toLocaleString(), max: SCAN_LIMIT_MAX.toLocaleString() });
  section.append(row, hint);

  const show = (value: number) => {
    if (document.activeElement !== input) input.value = String(value);
  };
  void limits.load().then(show);
  limits.onChange(show);
  return section;
}

/** Adds the settings (gear) button and its panel to the end of the toolbar. */
export function mountFontSettings(
  toolbar: HTMLElement,
  opts: { onScanLimitChange?: (limit: number) => void } = {},
): void {
  const store = createSettingsStore(STORAGE_KEY, normalize);
  const themeStore = createSettingsStore(THEME_KEY, normalizeTheme);
  let current: FontSettings = { ...EMPTY };
  const id = `md-font-${++uid}`;

  const wrap = document.createElement('div');
  wrap.className = 'font-settings';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'font-settings-toggle';
  // Gear icon (inline SVG so it follows the theme colour like the other toolbar buttons).
  toggle.innerHTML = GEAR_ICON;
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

  // Theme is stored on its own and saved at once (a single write, no debounce needed).
  const theme = choiceRow<ThemePreference>(`${id}-theme`, t('theme'), THEME_LABELS, (pref) => {
    applyTheme(pref);
    void themeStore.save(pref);
  });
  function showTheme(pref: ThemePreference): void {
    applyTheme(pref);
    theme.set(pref);
  }
  showTheme('auto');
  const size = choiceRow<TextSize>(`${id}-size`, t('textSize'), SIZE_LABELS, (v) => update({ ...current, size: v }));
  const width = choiceRow<ContentWidth>(`${id}-width`, t('contentWidth'), WIDTH_LABELS, (v) =>
    update({ ...current, width: v }),
  );

  const image = choiceRow<ImageSize>(`${id}-image`, t('imageSize'), IMAGE_LABELS, (v) =>
    update({ ...current, image: v }),
  );

  panel.append(heading, theme.row, size.row, width.row, image.row);
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
  // Only the viewer opens folders; the file:// page shows a single document.
  if (opts.onScanLimitChange) panel.append(scanLimitRow(id, opts.onScanLimitChange));
  wrap.append(toggle, panel);
  toolbar.append(wrap);

  // Don't overwrite a field the user is typing in when the stored value echoes back.
  function syncInputs(force = false): void {
    if (force || document.activeElement !== bodyInput) bodyInput.value = current.body;
    if (force || document.activeElement !== codeInput) codeInput.value = current.code;
    size.set(current.size);
    width.set(current.width);
    image.set(current.image);
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
