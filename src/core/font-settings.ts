// User-selectable fonts for the document body and code. Fonts are referenced by name
// (installed on the user's computer); unknown names fall back to the default stack.
import { t } from '../i18n';

export interface FontSettings {
  body: string;
  code: string;
}

const EMPTY: FontSettings = { body: '', code: '' };
const STORAGE_KEY = 'md-browser:fonts';
const SAVE_DELAY_MS = 400; // chrome.storage.sync allows ~120 writes per minute

const BODY_PRESETS = [
  'Hiragino Sans', 'Hiragino Mincho ProN', 'Yu Gothic', 'Yu Mincho', 'Meiryo', 'BIZ UDPGothic',
  'Noto Sans JP', 'Noto Serif JP', 'Segoe UI', 'Helvetica Neue', 'Arial', 'Georgia', 'Times New Roman',
];
const CODE_PRESETS = [
  'Menlo', 'SF Mono', 'Monaco', 'Consolas', 'Cascadia Code', 'Courier New',
  'Source Code Pro', 'JetBrains Mono', 'Fira Code', 'BIZ UDGothic', 'Osaka-Mono',
];

interface Store {
  load(): Promise<FontSettings>;
  save(s: FontSettings): Promise<void>;
  onChange(cb: (s: FontSettings) => void): void;
}

/** Keeps only characters that are safe inside a quoted CSS font-family name. */
export function sanitizeFontName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.replace(/["'\\;{}<>\u0000-\u001f]/g, '').trim().slice(0, 100);
}

function normalize(v: unknown): FontSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof FontSettings, unknown>>;
  return { body: sanitizeFontName(o.body), code: sanitizeFontName(o.code) };
}

// Extension pages and content scripts share chrome.storage.sync; the web app uses localStorage.
function createStore(): Store {
  const sync = typeof chrome !== 'undefined' ? chrome.storage?.sync : undefined;
  if (sync) {
    return {
      load: async () => normalize((await sync.get(STORAGE_KEY))[STORAGE_KEY]),
      save: (s) => sync.set({ [STORAGE_KEY]: s }),
      onChange: (cb) =>
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync' && STORAGE_KEY in changes) cb(normalize(changes[STORAGE_KEY].newValue));
        }),
    };
  }
  const read = (): FontSettings => {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
    } catch {
      return { ...EMPTY };
    }
  };
  return {
    load: async () => read(),
    save: async (s) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      } catch {
        // Storage unavailable (private mode etc.): the choice lasts for this page only.
      }
    },
    onChange: (cb) =>
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) cb(read());
      }),
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
}

let uid = 0;

/** Adds the "Aa" button and its panel to the end of the toolbar. */
export function mountFontSettings(toolbar: HTMLElement): void {
  const store = createStore();
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

  panel.append(heading);
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
    if (open) bodyInput.focus();
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
