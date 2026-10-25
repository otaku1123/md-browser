// PlantUML diagrams, drawn in the browser by the official TeaVM build (@plantuml/core) with its
// built-in Smetana layout. Graphviz (viz-global.js) is not bundled: it is WebAssembly, which the
// web viewer's CSP blocks, and Smetana lays out the same diagrams without it.
// Nothing is fetched: the engine loads themes, icons, emoji and the standard library through a
// hook we replace, so only the files bundled here can load; everything else fails with a message.
import DOMPurify from 'dompurify';
import { t } from '../i18n';

type Engine = typeof import('@plantuml/core');
type Loader = (name: string, ok: () => void, fail: (message: string) => void) => boolean;

const BUNDLED: Record<string, () => Promise<unknown>> = {
  'themes.js': () => import('@plantuml/core/themes.js'),
  'openiconic.js': () => import('@plantuml/core/openiconic.js'),
};

let enginePromise: Promise<Engine> | null = null;

// The engine is ~3MB, so load it only when a document actually contains a PlantUML diagram.
function loadEngine(): Promise<Engine> {
  enginePromise ??= (() => {
    const loader: Loader = (name, ok, fail) => {
      const load = BUNDLED[name];
      if (load) load().then(ok, (err: unknown) => fail(String(err)));
      else fail(t('plantumlNotBundled', { name }));
      return true;
    };
    (globalThis as { PLANTUML_STDLIB_LOADER?: Loader }).PLANTUML_STDLIB_LOADER = loader;
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

/** Renders to sanitized SVG markup. Syntax errors come back as PlantUML's own error image. */
export async function renderPlantUml(source: string, dark: boolean): Promise<string> {
  const { renderToString } = await loadEngine();
  const svg = await new Promise<string>((resolve, reject) => {
    // Errors arrive as Java exception text ("java.lang.RuntimeException: …"); keep the message.
    const fail = (message: string) => reject(new Error(message.replace(/^(?:[\w$]+\.)+[\w$]*(?:Exception|Error): /, '')));
    renderToString(plantUmlLines(source), resolve, fail, { dark });
  });
  // The text in the diagram is the document's; links ([[url]]) and styles must not escape as script.
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}
