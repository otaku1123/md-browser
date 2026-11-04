// PlantUML diagrams, drawn in the browser by the official TeaVM build (@plantuml/core) with its
// built-in Smetana layout. Graphviz (viz-global.js) is not bundled: it is WebAssembly, which the
// web viewer's CSP blocks, and Smetana lays out the same diagrams without it.
// The engine loads themes, icons, emoji and the standard library through a hook we replace: the
// files bundled here load from the package; a standard library bundle ("<lib>.min.js") is
// fetched from the host the user named in the settings, as data (plantuml-stdlib.ts), and only
// then; everything else fails with a message. A local "!include file.puml" goes through a second
// hook, served by the file reader the host set (the extension's content script reads below the
// tab's root through its service worker); without one it fails as the engine has no file system.
// The diagram source never leaves the page.
import DOMPurify from 'dompurify';
import { t } from '../i18n';
import { installStdlibBundle, normalizeStdlibUrl, parseStdlibBundle } from './plantuml-stdlib';
import { createSettingsStore, type SettingsStore } from './settings-store';

type Engine = typeof import('@plantuml/core');
type Loader = (name: string, ok: () => void, fail: (message: string) => void) => boolean;
/**
 * The engine's hook for local includes: `path` as written (after variables), `from` the id given
 * to the file holding the include (null in the diagram itself); `ok(id, text)` delivers the whole
 * file, `err` fails the include; returning false (strictly) declines the file.
 */
type FileLoader = (path: string, from: string | null, ok: (id: string, text: string) => void, err: (message: string) => void) => boolean;

/** Reads the file at a URL for an include; rejects with the reason when it can't (shown in the diagram). */
export type PlantUmlFileReader = (url: string) => Promise<string>;

let fileReader: PlantUmlFileReader | null = null;

/** The host sets this when it has a way to read local files (the extension's file:// pages). */
export function setPlantUmlFileReader(read: PlantUmlFileReader | null): void {
  fileReader = read;
}

/** The URL of an included file: relative to the file holding the include, or to the document. */
export function includeUrl(path: string, from: string | null, base: string): string | null {
  try {
    return new URL(path, from ?? base).href;
  } catch {
    return null;
  }
}

/** The engine's file hook: resolves the path and asks the reader; the file's id is its URL. */
export const plantUmlFileLoader: FileLoader = (path, from, ok, err) => {
  if (!fileReader) return false;
  const fail = (error: unknown) => err(t('plantumlIncludeFailed', { path, error: error instanceof Error ? error.message : String(error) }));
  const url = includeUrl(path, from, document.baseURI);
  if (!url) fail(t('localReadKind'));
  else fileReader(url).then((text) => ok(url, text), fail);
  return true;
};

const BUNDLED: Record<string, () => Promise<unknown>> = {
  'themes.js': () => import('@plantuml/core/themes.js'),
  'openiconic.js': () => import('@plantuml/core/openiconic.js'),
};

export interface PlantUmlSettings {
  /** Where "<lib>.min.js" bundles are fetched from; empty: the standard library is unavailable. */
  stdlibUrl: string;
}

export const PLANTUML_KEY = 'md-browser:plantuml';

export function normalizePlantUmlSettings(raw: unknown): PlantUmlSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PlantUmlSettings, unknown>>;
  return { stdlibUrl: normalizeStdlibUrl(o.stdlibUrl) };
}

export function plantUmlSettingsStore(): SettingsStore<PlantUmlSettings> {
  return createSettingsStore(PLANTUML_KEY, normalizePlantUmlSettings);
}

let stdlibUrl = '';
const settingsListeners = new Set<() => void>();

/**
 * The settings panel keeps this current (loaded once, then on every change). A changed host
 * tells the listeners (the pages redraw their diagrams: the ones that failed for want of a
 * library are drawn again, the others come back from the cache).
 */
export function setPlantUmlSettings(s: PlantUmlSettings): void {
  if (s.stdlibUrl === stdlibUrl) return;
  stdlibUrl = s.stdlibUrl;
  for (const cb of settingsListeners) cb();
}

/** Called after the settings changed in a way that can change how a diagram draws. */
export function onPlantUmlSettingsChange(cb: () => void): void {
  settingsListeners.add(cb);
}

/** Fetches and installs one standard library bundle; the message of the error says what failed. */
async function fetchStdlib(name: string, base: string): Promise<void> {
  const url = base + name;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  installStdlibBundle(parseStdlibBundle(await res.text()));
}

let enginePromise: Promise<Engine> | null = null;

// The engine is ~3MB, so load it only when a document actually contains a PlantUML diagram.
function loadEngine(): Promise<Engine> {
  enginePromise ??= (() => {
    const loader: Loader = (name, ok, fail) => {
      const load = BUNDLED[name];
      if (load) load().then(ok, (err: unknown) => fail(String(err)));
      else if (name.endsWith('.min.js') && stdlibUrl) fetchStdlib(name, stdlibUrl).then(ok, (err: unknown) => fail(t('plantumlStdlibFailed', { name, error: err instanceof Error ? err.message : String(err) })));
      else fail(t(name.endsWith('.min.js') ? 'plantumlStdlibOff' : 'plantumlNotBundled', { name }));
      return true;
    };
    const g = globalThis as { PLANTUML_STDLIB_LOADER?: Loader; PLANTUML_FILE_LOADER?: FileLoader };
    g.PLANTUML_STDLIB_LOADER = loader;
    g.PLANTUML_FILE_LOADER = plantUmlFileLoader;
    return import('@plantuml/core');
  })();
  return enginePromise;
}

/** Splits the source into lines, adding @startuml / @enduml when the block leaves them out. */
export function plantUmlLines(source: string): string[] {
  const text = source.replace(/\r\n?/g, '\n').trim();
  const lines = text.split('\n');
  return /^@start\w+/.test(text) ? lines : ['@startuml', ...lines, '@enduml'];
}

/**
 * Reads PlantUML's error image (syntax errors, failed !include) back into a message, or returns
 * null for a real diagram. The image names the line as "[From textarea (line N) ]", counted in
 * plantUmlLines(source); it is mapped back to the line in the code block.
 */
export function plantUmlError(svg: string, source: string): string | null {
  const texts = Array.from(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('text'));
  const from = texts.map((el) => /^\[From .*\(line (\d+)\)\s*\]$/.exec(el.textContent?.trim() ?? '')).find(Boolean);
  if (!from) return null;
  const message =
    texts
      .filter((el) => el.getAttribute('fill')?.toUpperCase() === '#FF0000')
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .join('\n') || 'Syntax Error?';
  const text = source.replace(/\r\n?/g, '\n');
  // plantUmlLines trims leading blank lines and may add @startuml.
  const trimmed = (/^\s*/.exec(text)?.[0] ?? '').split('\n').length - 1;
  const added = /^@start\w+/.test(text.trim()) ? 0 : 1;
  return t('plantumlLine', { line: String(Number(from[1]) - added + trimmed), error: message });
}

/** Renders to sanitized SVG markup. Syntax errors throw with the message and line in the code block. */
export async function renderPlantUml(source: string, dark: boolean): Promise<string> {
  const { renderToString } = await loadEngine();
  const svg = await new Promise<string>((resolve, reject) => {
    // Errors arrive as Java exception text ("java.lang.RuntimeException: …"); keep the message.
    const fail = (message: string) => reject(new Error(message.replace(/^(?:[\w$]+\.)+[\w$]*(?:Exception|Error): /, '')));
    renderToString(plantUmlLines(source), resolve, fail, { dark });
  });
  // Syntax errors still "succeed" with an image of the error; show them like Mermaid's instead.
  const error = plantUmlError(svg, source);
  if (error) throw new Error(error);
  // The text in the diagram is the document's; links ([[url]]) and styles must not escape as script.
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}
