import { t } from '../i18n';
import { currentTheme, type Theme } from './theme';

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderSeq = 0;
// Per-diagram directives, so a theme change doesn't touch the global config shared by concurrent renders.
const THEME_DIRECTIVE: Record<Theme, string> = {
  light: '%%{init: {"theme": "default"}}%%\n',
  dark: '%%{init: {"theme": "dark"}}%%\n',
};
const FRONT_MATTER = /^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Adds the theme directive; Mermaid wants front matter (`---` … `---`) first, so it goes after that. */
export function withTheme(source: string, theme: Theme): string {
  const fm = FRONT_MATTER.exec(source)?.[0] ?? '';
  return fm + THEME_DIRECTIVE[theme] + source.slice(fm.length);
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

/**
 * Draws the Mermaid diagrams in root in the theme shown now. Diagrams already drawn in that
 * theme are skipped, so calling it again after a theme change redraws only what changed.
 */
export async function renderDiagrams(root: ParentNode): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.diagram-mermaid')).filter(
    (node) => drawn.get(node)?.theme !== currentTheme(),
  );
  if (nodes.length === 0) return;

  const mermaid = await loadMermaid();
  for (const node of nodes) {
    const source = drawn.get(node)?.source ?? node.querySelector('.diagram-source')?.textContent ?? '';
    const theme = currentTheme();
    drawn.set(node, { source, theme });
    const id = `mermaid-${++renderSeq}`;
    try {
      const { svg } = await mermaid.render(id, withTheme(source, theme));
      if (theme === 'dark') {
        // Paper is white: keep a light-theme copy that only the print stylesheet shows.
        const { svg: light } = await mermaid.render(`${id}-print`, withTheme(source, 'light'));
        node.innerHTML = `<div class="diagram-screen">${svg}</div><div class="diagram-print">${light}</div>`;
      } else {
        node.innerHTML = svg;
      }
      node.classList.remove('diagram-error');
    } catch (err) {
      // mermaid leaves a stray error element in <body> on failure.
      for (const stray of [id, `${id}-print`]) {
        document.getElementById(stray)?.remove();
        document.getElementById(`d${stray}`)?.remove();
      }
      node.classList.add('diagram-error');
      const msg = document.createElement('div');
      msg.className = 'diagram-error-message';
      msg.textContent = t('mermaidFailed', { error: err instanceof Error ? err.message : String(err) });
      const pre = document.createElement('pre');
      pre.textContent = source;
      node.replaceChildren(msg, pre);
    }
  }
}
