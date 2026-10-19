import { t } from '../i18n';

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderSeq = 0;
/** Theme picked when mermaid was initialized; SVGs keep its colours even if the OS theme changes later. */
let darkTheme = false;
// Per-diagram directive, so the light copy doesn't touch the global config shared by concurrent renders.
const LIGHT_DIRECTIVE = '%%{init: {"theme": "default"}}%%\n';

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// mermaid is ~1MB, so load it only when a document actually contains a diagram.
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    darkTheme = prefersDark();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: darkTheme ? 'dark' : 'default',
    });
    return mermaid;
  });
  return mermaidPromise;
}

export async function renderDiagrams(root: ParentNode): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.diagram-mermaid'));
  if (nodes.length === 0) return;

  const mermaid = await loadMermaid();
  for (const node of nodes) {
    const source = node.querySelector('.diagram-source')?.textContent ?? '';
    const id = `mermaid-${++renderSeq}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (darkTheme) {
        // Paper is white: keep a light-theme copy that only the print stylesheet shows.
        const { svg: light } = await mermaid.render(`${id}-print`, LIGHT_DIRECTIVE + source);
        node.innerHTML = `<div class="diagram-screen">${svg}</div><div class="diagram-print">${light}</div>`;
      } else {
        node.innerHTML = svg;
      }
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
