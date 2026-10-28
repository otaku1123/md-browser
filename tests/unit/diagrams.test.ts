import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mermaidRender, plantUmlRender } = vi.hoisted(() => ({
  mermaidRender: vi.fn(async (id: string, src: string) => {
    if (src.includes('BROKEN')) throw new Error('parse error');
    const theme = src.includes('"theme": "dark"') ? 'dark' : 'light';
    return { svg: `<svg id="${id}" data-theme="${theme}"><style>#${id} .a{}</style></svg>` };
  }),
  plantUmlRender: vi.fn(async (_src: string, dark: boolean) => `<svg data-dark="${dark}"></svg>`),
}));

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: mermaidRender } }));
vi.mock('../../src/core/plantuml', () => ({ renderPlantUml: plantUmlRender }));

// A fresh module per test, so the markup cache starts empty.
async function load() {
  return (await import('../../src/core/diagrams')).renderDiagrams;
}

/** A fresh DOM like render.ts makes, as on every file save. */
function doc(...diagrams: [kind: 'mermaid' | 'plantuml', source: string][]): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = diagrams
    .map(([kind, src]) => `<div class="diagram diagram-${kind}"><pre class="diagram-source">${src}</pre></div>`)
    .join('');
  return root;
}

const nodes = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.diagram'));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {} }));
  vi.resetModules();
  mermaidRender.mockClear();
  plantUmlRender.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('renderDiagrams markup cache', () => {
  it('reuses the markup for a fresh copy of the same document', async () => {
    const renderDiagrams = await load();
    const first = doc(['mermaid', 'graph LR\n  A --> B'], ['plantuml', '@startuml\nA -> B\n@enduml']);
    await renderDiagrams(first);
    expect(mermaidRender).toHaveBeenCalledTimes(1);
    expect(plantUmlRender).toHaveBeenCalledTimes(1);

    const second = doc(['mermaid', 'graph LR\n  A --> B'], ['plantuml', '@startuml\nA -> B\n@enduml']);
    await renderDiagrams(second);
    expect(mermaidRender).toHaveBeenCalledTimes(1);
    expect(plantUmlRender).toHaveBeenCalledTimes(1);
    expect(second.innerHTML).toBe(first.innerHTML);
    for (const node of nodes(second)) {
      expect(node.tabIndex).toBe(0);
      expect(node.getAttribute('role')).toBe('button');
      expect(node.getAttribute('aria-label')).toBeTruthy();
      expect(node.classList.contains('diagram-error')).toBe(false);
    }
  });

  it('redraws only the diagram whose source changed', async () => {
    const renderDiagrams = await load();
    await renderDiagrams(doc(['mermaid', 'graph LR\n  A --> B'], ['mermaid', 'graph LR\n  C --> D']));
    expect(mermaidRender).toHaveBeenCalledTimes(2);

    mermaidRender.mockClear();
    await renderDiagrams(doc(['mermaid', 'graph LR\n  A --> B'], ['mermaid', 'graph LR\n  C --> E']));
    expect(mermaidRender).toHaveBeenCalledTimes(1);
    expect(mermaidRender.mock.calls[0][1]).toContain('C --> E');
  });

  it('never gives two identical diagrams in one document the same svg id', async () => {
    const renderDiagrams = await load();
    const src = 'graph LR\n  A --> B';
    const first = doc(['mermaid', src], ['mermaid', src]);
    await renderDiagrams(first);
    expect(mermaidRender).toHaveBeenCalledTimes(2);

    // Again: the first copy comes from the cache, the second is drawn fresh.
    const second = doc(['mermaid', src], ['mermaid', src]);
    await renderDiagrams(second);
    expect(mermaidRender).toHaveBeenCalledTimes(3);
    for (const root of [first, second]) {
      const ids = Array.from(root.querySelectorAll('svg'), (svg) => svg.id);
      expect(new Set(ids).size).toBe(2);
    }
  });

  it('keys by theme: dark draws screen + print copies, switching back hits the cache', async () => {
    const renderDiagrams = await load();
    const src = 'graph LR\n  A --> B';
    await renderDiagrams(doc(['mermaid', src]));
    expect(mermaidRender).toHaveBeenCalledTimes(1);

    document.documentElement.dataset.theme = 'dark';
    const dark = doc(['mermaid', src]);
    await renderDiagrams(dark);
    expect(mermaidRender).toHaveBeenCalledTimes(3); // dark screen + light print copy
    expect(dark.querySelector('.diagram-screen svg')!.getAttribute('data-theme')).toBe('dark');
    expect(dark.querySelector('.diagram-print svg')!.getAttribute('data-theme')).toBe('light');

    // Theme change on the live DOM redraws it, from the cache.
    document.documentElement.dataset.theme = 'light';
    await renderDiagrams(dark);
    expect(mermaidRender).toHaveBeenCalledTimes(3);
    expect(dark.querySelector('.diagram-screen')).toBeNull();
    expect(dark.querySelector('svg')!.getAttribute('data-theme')).toBe('light');

    document.documentElement.dataset.theme = 'dark';
    await renderDiagrams(doc(['mermaid', src]));
    expect(mermaidRender).toHaveBeenCalledTimes(3);
  });

  it('does not cache failures', async () => {
    const renderDiagrams = await load();
    const first = doc(['mermaid', 'BROKEN']);
    await renderDiagrams(first);
    const second = doc(['mermaid', 'BROKEN']);
    await renderDiagrams(second);
    expect(mermaidRender).toHaveBeenCalledTimes(2);
    for (const root of [first, second]) {
      const node = nodes(root)[0];
      expect(node.classList.contains('diagram-error')).toBe(true);
      expect(node.querySelector('.diagram-error-message')!.textContent).toContain('parse error');
      expect(node.hasAttribute('role')).toBe(false);
    }
  });
});
