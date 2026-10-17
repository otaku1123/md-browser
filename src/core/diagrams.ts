import { t } from '../i18n';

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderSeq = 0;

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// mermaid is ~1MB, so load it only when a document actually contains a diagram.
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: prefersDark() ? 'dark' : 'default',
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
      node.innerHTML = svg;
    } catch (err) {
      // mermaid leaves a stray error element in <body> on failure.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
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
