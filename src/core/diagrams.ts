import { t } from '../i18n';
import { renderPlantUml } from './plantuml';
import { currentTheme, type Theme } from './theme';

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderSeq = 0;
// Per-diagram directives, so a theme change doesn't touch the global config shared by concurrent renders.
const THEME_DIRECTIVE: Record<Theme, string> = {
  light: '%%{init: {"theme": "default"}}%%\n',
  dark: '%%{init: {"theme": "dark"}}%%\n',
};
// HTML labels (<foreignObject>) taint a canvas, so PNG export draws a copy with SVG text labels.
const NO_HTML_LABELS = '%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n';
const FRONT_MATTER = /^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Adds the theme directive; Mermaid wants front matter (`---` … `---`) first, so it goes after that. */
export function withTheme(source: string, theme: Theme, extra = ''): string {
  const fm = FRONT_MATTER.exec(source)?.[0] ?? '';
  return fm + THEME_DIRECTIVE[theme] + extra + source.slice(fm.length);
}

/** Source and theme of every diagram drawn so far, so a theme change can redraw it. */
const drawn = new WeakMap<HTMLElement, { source: string; theme: Theme }>();

// mermaid is ~1MB, so load it only when a document actually contains a diagram.
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    return mermaid;
  });
  return mermaidPromise;
}

const isPlantUml = (node: HTMLElement) => node.classList.contains('diagram-plantuml');

/** SVG markup for one diagram in the given theme. */
async function draw(node: HTMLElement, source: string, theme: Theme, id: string): Promise<string> {
  if (isPlantUml(node)) return renderPlantUml(source, theme === 'dark');
  const mermaid = await loadMermaid();
  return (await mermaid.render(id, withTheme(source, theme))).svg;
}

/**
 * Draws the Mermaid and PlantUML diagrams in root in the theme shown now. Diagrams already drawn
 * in that theme are skipped, so calling it again after a theme change redraws only what changed.
 */
export async function renderDiagrams(root: ParentNode): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.diagram-mermaid, .diagram-plantuml')).filter(
    (node) => drawn.get(node)?.theme !== currentTheme(),
  );
  for (const node of nodes) {
    const source = drawn.get(node)?.source ?? node.querySelector('.diagram-source')?.textContent ?? '';
    const theme = currentTheme();
    drawn.set(node, { source, theme });
    const id = `mermaid-${++renderSeq}`;
    try {
      const svg = await draw(node, source, theme, id);
      if (theme === 'dark') {
        // Paper is white: keep a light-theme copy that only the print stylesheet shows.
        const light = await draw(node, source, 'light', `${id}-print`);
        node.innerHTML = `<div class="diagram-screen">${svg}</div><div class="diagram-print">${light}</div>`;
      } else {
        node.innerHTML = svg;
      }
      node.classList.remove('diagram-error');
      // Click or Enter opens it large (image-zoom.ts).
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', t('diagramZoom'));
    } catch (err) {
      // mermaid leaves a stray error element in <body> on failure.
      for (const stray of [id, `${id}-print`]) {
        document.getElementById(stray)?.remove();
        document.getElementById(`d${stray}`)?.remove();
      }
      node.classList.add('diagram-error');
      for (const attr of ['tabindex', 'role', 'aria-label']) node.removeAttribute(attr);
      const msg = document.createElement('div');
      msg.className = 'diagram-error-message';
      const error = err instanceof Error ? err.message : String(err);
      msg.textContent = t(isPlantUml(node) ? 'plantumlFailed' : 'mermaidFailed', { error });
      const pre = document.createElement('pre');
      pre.textContent = source;
      node.replaceChildren(msg, pre);
    }
  }
}

/**
 * Re-renders a drawn diagram in the current theme without HTML labels, for rasterizing to PNG.
 * The on-screen copy keeps its HTML labels. Throws if a <foreignObject> is left anyway.
 */
export async function renderForExport(node: HTMLElement): Promise<SVGSVGElement> {
  const source = drawn.get(node)?.source;
  if (source === undefined) throw new Error('diagram not rendered');
  // PlantUML draws plain SVG text, so the on-screen copy rasterizes as it is.
  if (isPlantUml(node)) {
    const svg = node.querySelector<SVGSVGElement>('.diagram-screen svg, :scope > svg');
    if (!svg) throw new Error('diagram not rendered');
    return svg;
  }
  const mermaid = await loadMermaid();
  const id = `mermaid-export-${++renderSeq}`;
  try {
    const { svg } = await mermaid.render(id, withTheme(source, currentTheme(), NO_HTML_LABELS));
    const out = new DOMParser().parseFromString(svg, 'text/html').querySelector('svg');
    if (!out) throw new Error('no svg');
    if (out.querySelector('foreignObject')) throw new Error('this diagram type uses HTML labels');
    return out;
  } finally {
    for (const stray of [id, `d${id}`]) document.getElementById(stray)?.remove();
  }
}
