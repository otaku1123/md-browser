// Display settings panel (gear button): theme, text size, content width, image size, and fonts for the
// document body and code, the quick switcher's shortcut, plus the folder scan limit in the viewer. Fonts are referenced by name (installed on the user's computer); unknown names fall back
// to the default stack.
import { t } from '../i18n';
import { createSettingsStore } from './settings-store';
import { normalizeScanLimit, scanLimitStore, SCAN_LIMIT_MAX, SCAN_LIMIT_MIN } from './scan-limit';
import { applyTheme, normalizeTheme, type ThemePreference } from './theme';
import { setGlobalMediaScale } from './media-sizes';
import { feedbackLinks } from './feedback';
import { QUICK_OPEN_KEYS, quickOpenKeyLabel, quickOpenKeyStore, type QuickOpenKey } from './quick-open-key';
import { CUSTOM_EXAMPLE, EDITOR_DEFAULT, editorStore, isValidTemplate, normalizeEditorSettings, type Editor, type EditorSettings } from './editor-link';
import {
  buildStandaloneHtml,
  DEFAULT_EXPORT,
  downloadHtml,
  exportFilename,
  type ExportSettings,
  type ExportTheme,
  exportSettingsStore,
  type LocalReader,
  mathCss,
  normalizeExportSettings,
} from './export-html';
import { applyCustomCss, CUSTOM_CSS_MAX, customCssStore, type CustomCss, EMPTY_CUSTOM_CSS, normalizeCustomCss, scopedCustomCss } from './custom-css';
import { applyPrintSettings, DEFAULT_PRINT, type Margin, normalizePrintSettings, type Orientation, type Paper, type PrintSettings, printSettingsStore } from './print-settings';
import { normalizePlantUmlSettings, type PlantUmlSettings, plantUmlSettingsStore, setPlantUmlSettings } from './plantuml';
import { normalizeStdlibUrl, OFFICIAL_STDLIB_URL } from './plantuml-stdlib';

// Values for the document only: the toolbar and TOC keep their size.
const SIZES = { small: '14px', normal: '16px', large: '18px', xlarge: '20px' } as const;
const WIDTHS = { normal: '980px', wide: '1280px', full: 'none' } as const;
// Images and diagrams, in percent of their natural width (never wider than the text: media-sizes.ts).
const IMAGE_SCALES = [50, 75, 100, 150, 200] as const;
// Saved before the setting became a scale: it only capped the size, so "large" (800px) was barely smaller.
const OLD_IMAGE_SIZES: Record<string, ImageScale> = { normal: 100, large: 100, medium: 75, small: 50 };
type TextSize = keyof typeof SIZES;
type ContentWidth = keyof typeof WIDTHS;
type ImageScale = (typeof IMAGE_SCALES)[number];

export interface FontSettings {
  body: string;
  code: string;
  size: TextSize;
  width: ContentWidth;
  image: ImageScale;
}

const EMPTY: FontSettings = { body: '', code: '', size: 'normal', width: 'normal', image: 100 };
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

export function normalizeFontSettings(v: unknown): FontSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof FontSettings, unknown>>;
  return {
    body: sanitizeFontName(o.body),
    code: sanitizeFontName(o.code),
    // Saved before size / width / image existed, or unknown: use the default.
    size: typeof o.size === 'string' && o.size in SIZES ? (o.size as TextSize) : 'normal',
    width: typeof o.width === 'string' && o.width in WIDTHS ? (o.width as ContentWidth) : 'normal',
    image: (IMAGE_SCALES as readonly unknown[]).includes(o.image)
      ? (o.image as ImageScale)
      : typeof o.image === 'string' && Object.hasOwn(OLD_IMAGE_SIZES, o.image)
        ? OLD_IMAGE_SIZES[o.image]
        : 100,
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
  setGlobalMediaScale((IMAGE_SCALES as readonly number[]).includes(s.image) ? s.image : 100);
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
const IMAGE_LABELS = Object.fromEntries(IMAGE_SCALES.map((n) => [n, `${n}%`])) as Record<`${ImageScale}`, string>;

/** Translated labels for choiceRow. */
function texts<V extends string>(keys: Record<V, Parameters<typeof t>[0]>): Record<V, string> {
  return Object.fromEntries(Object.entries(keys).map(([v, key]) => [v, t(key as Parameters<typeof t>[0])])) as Record<V, string>;
}

/** A labelled radio group; set() shows a value without firing onPick. */
function choiceRow<V extends string>(
  name: string,
  label: string,
  labels: Record<V, string>,
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
    option.append(radio, labels[value]);
    options.append(option);
  }
  row.append(text, options);
  return { row, set: (value) => void (inputs.get(value)!.checked = true) };
}

/** The quick file switcher's shortcut (quick-switcher.ts); saved at once, shared by every tab. */
function quickOpenKeyRow(id: string): HTMLElement {
  const keys = quickOpenKeyStore();
  const labels = Object.fromEntries(QUICK_OPEN_KEYS.map((k) => [k, k === 'off' ? t('quickOpenOff') : quickOpenKeyLabel(k)])) as Record<
    QuickOpenKey,
    string
  >;
  const choice = choiceRow<QuickOpenKey>(`${id}-quick-open`, t('quickOpenKey'), labels, (k) => void keys.save(k));
  const section = document.createElement('div');
  section.className = 'quick-open-setting';
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('quickOpenHint');
  section.append(choice.row, hint);
  void keys.load().then(choice.set);
  keys.onChange(choice.set);
  return section;
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
/** The shown document, for the export buttons: its rendered root, file name and page title. */
export interface ExportTarget {
  root: HTMLElement;
  name: string;
  title: string;
  /** How the page reads its file:// images, when it has a way to (the extension's content script). */
  readLocal?: LocalReader;
}

/**
 * "Custom CSS" section (custom-css.ts): a stylesheet for the document, applied as it is typed
 * and saved shortly after; the checkboxes switch it off without losing it and keep it out of
 * the HTML export. exportCss() is what the export should include right now.
 */
function customCssRow(id: string): { section: HTMLElement; exportCss(): string } {
  const store = customCssStore();
  let current: CustomCss = { ...EMPTY_CUSTOM_CSS };
  let saved = true;
  const section = document.createElement('div');
  section.className = 'custom-css-setting';
  const title = document.createElement('p');
  title.className = 'font-settings-title';
  title.textContent = t('customCssTitle');
  const textarea = document.createElement('textarea');
  textarea.id = `${id}-custom-css`;
  textarea.rows = 6;
  textarea.spellcheck = false;
  textarea.autocomplete = 'off';
  textarea.maxLength = CUSTOM_CSS_MAX;
  textarea.placeholder = t('customCssPlaceholder');
  textarea.setAttribute('aria-label', t('customCssLabel'));
  textarea.addEventListener('input', () => update({ ...current, css: textarea.value }));
  const options = document.createElement('div');
  options.className = 'custom-css-options';
  const checkbox = (label: string, onChange: (checked: boolean) => void) => {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => onChange(input.checked));
    wrap.append(input, label);
    options.append(wrap);
    return input;
  };
  const enabled = checkbox(t('customCssEnabled'), (v) => update({ ...current, enabled: v }));
  const exported = checkbox(t('customCssExport'), (v) => update({ ...current, exported: v }));
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = t('customCssClear');
  clear.addEventListener('click', () => {
    textarea.value = '';
    update({ ...current, css: '' });
  });
  options.append(clear);
  const status = document.createElement('p');
  status.className = 'custom-css-status';
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('customCssHint');
  section.append(title, textarea, options, status, hint);

  const showStatus = () => {
    const count = t('customCssStatus', { count: current.css.length.toLocaleString(), max: CUSTOM_CSS_MAX.toLocaleString() });
    status.textContent = `${count} · ${t(saved ? 'customCssSaved' : 'customCssUnsaved')}`;
  };
  const show = (s: CustomCss) => {
    current = s;
    applyCustomCss(current);
    if (document.activeElement !== textarea) textarea.value = s.css;
    enabled.checked = s.enabled;
    exported.checked = s.exported;
    showStatus();
  };
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const update = (next: CustomCss) => {
    saved = false;
    show(normalizeCustomCss(next));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void store.save(current).then(() => {
        if (saveTimer !== undefined) return; // edited again meanwhile
        saved = true;
        showStatus();
      });
    }, SAVE_DELAY_MS);
  };
  void store.load().then(show);
  store.onChange((s) => {
    if (saveTimer !== undefined) return; // a newer local edit is about to be saved
    saved = true;
    show(s);
  });
  return { section, exportCss: () => (current.exported ? scopedCustomCss(current) : '') };
}

/** "PlantUML" section (plantuml.ts): the host of the standard library bundles; saved when committed (blur / Enter). */
function plantUmlRow(id: string): HTMLElement {
  const store = plantUmlSettingsStore();
  let current: PlantUmlSettings = { stdlibUrl: '' };
  const section = document.createElement('div');
  section.className = 'plantuml-setting';
  const title = document.createElement('p');
  title.className = 'font-settings-title';
  title.textContent = t('plantumlTitle');
  const row = document.createElement('label');
  row.className = 'font-settings-row';
  const text = document.createElement('span');
  text.textContent = t('plantumlStdlibUrl');
  const input = document.createElement('input');
  input.type = 'url';
  input.id = `${id}-plantuml-stdlib`;
  input.placeholder = OFFICIAL_STDLIB_URL;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('change', () => save(input.value));
  row.append(text, input);
  const official = document.createElement('button');
  official.type = 'button';
  official.textContent = t('plantumlStdlibOfficial');
  official.addEventListener('click', () => {
    input.value = OFFICIAL_STDLIB_URL;
    save(OFFICIAL_STDLIB_URL);
  });
  const status = document.createElement('p');
  status.className = 'editor-status';
  status.setAttribute('role', 'alert');
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('plantumlStdlibHint');
  section.append(title, row, official, status, hint);

  const show = (s: PlantUmlSettings) => {
    current = s;
    setPlantUmlSettings(s);
    if (document.activeElement !== input) input.value = s.stdlibUrl;
    status.textContent = '';
  };
  const save = (raw: string) => {
    const next = normalizePlantUmlSettings({ stdlibUrl: raw });
    show(next);
    if (raw.trim() && !normalizeStdlibUrl(raw)) {
      // What was typed stays in the field, with the reason it is not used.
      input.value = raw;
      status.textContent = t('plantumlStdlibInvalid');
    } else {
      input.value = next.stdlibUrl; // as normalized (trailing slash), even while the field has focus
    }
    void store.save(current);
  };
  void store.load().then(show);
  store.onChange(show);
  return section;
}

/** "Print / PDF" section (print-settings.ts): paper, orientation, margins and the extras; saved at once. */
function printRow(id: string): HTMLElement {
  const store = printSettingsStore();
  let current: PrintSettings = { ...DEFAULT_PRINT };
  const section = document.createElement('div');
  section.className = 'print-setting';
  const title = document.createElement('p');
  title.className = 'font-settings-title';
  title.textContent = t('printTitle');
  const paper = choiceRow<Paper>(`${id}-paper`, t('printPaper'), texts({ a4: 'printA4', letter: 'printLetter' }), (v) => save({ ...current, paper: v }));
  const orientation = choiceRow<Orientation>(`${id}-orientation`, t('printOrientation'), texts({ portrait: 'printPortrait', landscape: 'printLandscape' }), (v) =>
    save({ ...current, orientation: v }),
  );
  const margin = choiceRow<Margin>(`${id}-margin`, t('printMargin'), texts({ narrow: 'printNarrow', normal: 'printNormal', wide: 'printWide' }), (v) =>
    save({ ...current, margin: v }),
  );
  const options = document.createElement('div');
  options.className = 'print-options';
  const checkbox = (label: string, key: 'linkUrls' | 'toc' | 'breakBeforeH1') => {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => save({ ...current, [key]: input.checked }));
    wrap.append(input, label);
    options.append(wrap);
    return input;
  };
  const linkUrls = checkbox(t('printLinkUrls'), 'linkUrls');
  const toc = checkbox(t('printToc'), 'toc');
  const breakBeforeH1 = checkbox(t('printBreakH1'), 'breakBeforeH1');
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('printHint');
  section.append(title, paper.row, orientation.row, margin.row, options, hint);

  const show = (s: PrintSettings) => {
    current = s;
    applyPrintSettings(current);
    paper.set(s.paper);
    orientation.set(s.orientation);
    margin.set(s.margin);
    linkUrls.checked = s.linkUrls;
    toc.checked = s.toc;
    breakBeforeH1.checked = s.breakBeforeH1;
  };
  const save = (next: PrintSettings) => {
    show(normalizePrintSettings(next));
    void store.save(current);
  };
  void store.load().then(show);
  store.onChange(show);
  return section;
}

/** "Export" section: the document as a standalone .html file (with its choices, saved at once), or the print dialog for a PDF. */
function exportRow(id: string, target: () => ExportTarget | null, customCss: () => string): HTMLElement {
  const store = exportSettingsStore();
  let current: ExportSettings = { ...DEFAULT_EXPORT };
  const section = document.createElement('div');
  section.className = 'export-setting';
  const title = document.createElement('p');
  title.className = 'font-settings-title';
  title.textContent = t('exportTitle');
  const theme = choiceRow<ExportTheme>(`${id}-export-theme`, t('exportTheme'), texts({ current: 'exportThemeCurrent', light: 'exportThemeLight' }), (v) =>
    save({ ...current, theme: v }),
  );
  const options = document.createElement('div');
  options.className = 'export-options';
  const checkbox = (label: string, key: 'toc' | 'mathFonts') => {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => save({ ...current, [key]: input.checked }));
    wrap.append(input, label);
    options.append(wrap);
    return input;
  };
  const toc = checkbox(t('exportToc'), 'toc');
  const mathFonts = checkbox(t('exportMathFonts'), 'mathFonts');
  const show = (s: ExportSettings) => {
    current = s;
    theme.set(s.theme);
    toc.checked = s.toc;
    mathFonts.checked = s.mathFonts;
  };
  const save = (next: ExportSettings) => {
    show(normalizeExportSettings(next));
    void store.save(current);
  };
  void store.load().then(show);
  store.onChange(show);
  const buttons = document.createElement('div');
  buttons.className = 'export-buttons';
  const status = document.createElement('p');
  status.className = 'export-status';
  status.setAttribute('role', 'alert');
  const button = (label: string, run: () => void | Promise<void>) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', async () => {
      status.textContent = '';
      b.disabled = true;
      try {
        await run();
      } catch (err) {
        status.textContent = t('exportFailed', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        b.disabled = false;
      }
    });
    return b;
  };
  const html = button(t('exportHtml'), async () => {
    const doc = target();
    if (!doc) return;
    const extraCss = [await mathCss(doc.root), customCss()].filter(Boolean).join('\n');
    const text = await buildStandaloneHtml(doc.root, {
      title: doc.title,
      extraCss: extraCss || undefined,
      readLocal: doc.readLocal,
      theme: current.theme,
      toc: current.toc,
      tocTitle: t('toc'),
      embedFonts: current.mathFonts,
    });
    downloadHtml(text, exportFilename(doc.name));
  });
  const pdf = button(t('exportPdf'), () => window.print());
  buttons.append(html, pdf);
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('exportHint');
  section.append(title, theme.row, options, buttons, status, hint);
  return section;
}

/** "Editor" section (editor-link.ts): which editor the toolbar link opens, and its URL when custom. */
function editorRow(id: string): HTMLElement {
  const store = editorStore();
  let current = EDITOR_DEFAULT;
  const section = document.createElement('div');
  section.className = 'editor-setting';
  const labels: Record<Editor, string> = { off: t('editorOff'), vscode: 'VS Code', cursor: 'Cursor', custom: t('editorCustom') };
  const choice = choiceRow<Editor>(`${id}-editor`, t('editor'), labels, (editor) => save({ ...current, editor }));
  const row = document.createElement('label');
  row.className = 'font-settings-row';
  const text = document.createElement('span');
  text.textContent = t('editorCustomUrl');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = CUSTOM_EXAMPLE;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('change', () => save({ ...current, custom: input.value }));
  row.append(text, input);
  const status = document.createElement('p');
  status.className = 'editor-status';
  status.setAttribute('role', 'alert');
  const hint = document.createElement('p');
  hint.className = 'font-settings-hint';
  hint.textContent = t('editorHint', { example: CUSTOM_EXAMPLE });
  section.append(choice.row, row, status, hint);

  const show = (s: EditorSettings) => {
    current = s;
    choice.set(s.editor);
    row.hidden = s.editor !== 'custom';
    if (document.activeElement !== input) input.value = s.custom;
    status.textContent = s.editor === 'custom' && s.custom && !isValidTemplate(s.custom) ? t('editorInvalid') : '';
  };
  const save = (next: EditorSettings) => {
    show(normalizeEditorSettings(next));
    void store.save(current);
  };
  void store.load().then(show);
  store.onChange(show);
  return section;
}

export function mountFontSettings(
  toolbar: HTMLElement,
  opts: { onScanLimitChange?: (limit: number) => void; exportTarget?: () => ExportTarget | null; editor?: boolean } = {},
): void {
  const store = createSettingsStore(STORAGE_KEY, normalizeFontSettings);
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
  const theme = choiceRow<ThemePreference>(`${id}-theme`, t('theme'), texts(THEME_LABELS), (pref) => {
    applyTheme(pref);
    void themeStore.save(pref);
  });
  function showTheme(pref: ThemePreference): void {
    applyTheme(pref);
    theme.set(pref);
  }
  showTheme('auto');
  const size = choiceRow<TextSize>(`${id}-size`, t('textSize'), texts(SIZE_LABELS), (v) => update({ ...current, size: v }));
  const width = choiceRow<ContentWidth>(`${id}-width`, t('contentWidth'), texts(WIDTH_LABELS), (v) =>
    update({ ...current, width: v }),
  );

  const image = choiceRow<`${ImageScale}`>(`${id}-image`, t('imageSize'), IMAGE_LABELS, (v) =>
    update({ ...current, image: Number(v) as ImageScale }),
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
  panel.append(hint, reset, quickOpenKeyRow(id));
  // Only the viewer opens folders; the file:// page shows a single document.
  if (opts.onScanLimitChange) panel.append(scanLimitRow(id, opts.onScanLimitChange));
  const customCss = customCssRow(id);
  panel.append(customCss.section, plantUmlRow(id), printRow(id));
  if (opts.exportTarget) panel.append(exportRow(id, opts.exportTarget, customCss.exportCss));
  // Only file:// pages know the file's absolute path (editor-link.ts).
  if (opts.editor) panel.append(editorRow(id));
  panel.append(feedbackLinks());
  wrap.append(toggle, panel);
  toolbar.append(wrap);

  // Don't overwrite a field the user is typing in when the stored value echoes back.
  function syncInputs(force = false): void {
    if (force || document.activeElement !== bodyInput) bodyInput.value = current.body;
    if (force || document.activeElement !== codeInput) codeInput.value = current.code;
    size.set(current.size);
    width.set(current.width);
    image.set(`${current.image}`);
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function update(next: FontSettings): void {
    current = normalizeFontSettings(next);
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
