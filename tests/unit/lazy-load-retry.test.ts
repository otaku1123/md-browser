// A lazy chunk that failed to load (a network blip, a tab left open across a redeploy) must not be
// kept: the next document that needs it tries again (#211).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ katex: false, mermaid: false, plantuml: false }));

vi.mock('katex', () => {
  if (fail.katex) throw new Error('katex chunk failed');
  return { default: { render: (src: string, node: HTMLElement) => (node.textContent = `typeset:${src}`) } };
});
vi.mock('katex/dist/katex.min.css', () => ({}));
vi.mock('mermaid', () => {
  if (fail.mermaid) throw new Error('mermaid chunk failed');
  return { default: { initialize: () => {}, render: async (id: string) => ({ svg: `<svg id="${id}"></svg>` }) } };
});
vi.mock('@plantuml/core', () => {
  if (fail.plantuml) throw new Error('plantuml chunk failed');
  return { renderToString: (_lines: string[], ok: (svg: string) => void) => ok('<svg><text>ok</text></svg>') };
});

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {} }));
  Object.assign(fail, { katex: false, mermaid: false, plantuml: false });
});

afterEach(() => vi.unstubAllGlobals());

/** Fails the first import of the mocked module, then lets it load. */
async function failOnce(name: keyof typeof fail, run: () => Promise<void>): Promise<void> {
  fail[name] = true;
  await run();
  fail[name] = false;
  // The mock registry would otherwise keep the failed factory's result.
  vi.resetModules();
}

describe('lazy loaders try again after a failed load', () => {
  it('KaTeX', async () => {
    const { renderMath } = await import('../../src/core/math');
    const root = () => {
      const el = document.createElement('div');
      el.innerHTML = '<span class="math math-inline">x</span>';
      return el;
    };
    await failOnce('katex', () => expect(renderMath(root())).rejects.toThrow());
    const el = root();
    await renderMath(el);
    expect(el.textContent).toBe('typeset:x');
  });

  it('Mermaid', async () => {
    const { renderDiagrams } = await import('../../src/core/diagrams');
    const root = () => {
      const el = document.createElement('div');
      el.innerHTML = '<div class="diagram diagram-mermaid"><pre class="diagram-source">graph TD; A--&gt;B</pre></div>';
      return el;
    };
    const first = root();
    await failOnce('mermaid', () => renderDiagrams(first));
    expect(first.querySelector('.diagram')!.classList.contains('diagram-error')).toBe(true);
    const next = root();
    await renderDiagrams(next);
    expect(next.querySelector('.diagram svg')).not.toBeNull();
  });

  it('PlantUML', async () => {
    const { renderPlantUml } = await import('../../src/core/plantuml');
    await failOnce('plantuml', () => expect(renderPlantUml('A -> B', false)).rejects.toThrow());
    expect(await renderPlantUml('A -> B', false)).toContain('<svg');
  });
});
