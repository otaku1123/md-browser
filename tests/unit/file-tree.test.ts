import { describe, expect, it, vi } from 'vitest';
import { createFileTree } from '../../src/file-tree';

function setup() {
  const el = document.createElement('nav');
  const onOpen = vi.fn();
  const tree = createFileTree(el, onOpen);
  tree.render(['README.md', 'docs/guide.md', 'docs/api/ref.md', 'a.md']);
  return { el, onOpen, tree };
}

describe('createFileTree', () => {
  it('renders folders first, then files, sorted by name', () => {
    const { el } = setup();
    const top = el.querySelector(':scope > ul')!;
    const labels = [...top.children].map((li) => li.querySelector('summary, button')!.textContent);
    expect(labels).toEqual(['docs', 'a.md', 'README.md']);
    const docs = top.querySelector('details')!;
    expect([...docs.querySelectorAll(':scope > ul > li > details > summary')].map((s) => s.textContent)).toEqual(['api']);
    expect(el.querySelector('button[data-path="docs/api/ref.md"]')!.textContent).toBe('ref.md');
  });

  it('calls onOpen with the full path on click', () => {
    const { el, onOpen } = setup();
    el.querySelector<HTMLButtonElement>('button[data-path="docs/guide.md"]')!.click();
    expect(onOpen).toHaveBeenCalledWith('docs/guide.md');
  });

  it('marks the active file and expands its folders', () => {
    const { el, tree } = setup();
    for (const d of el.querySelectorAll('details')) d.open = false;
    tree.setActive('docs/api/ref.md');
    const btn = el.querySelector('button[data-path="docs/api/ref.md"]')!;
    expect(btn.getAttribute('aria-current')).toBe('page');
    expect([...el.querySelectorAll('details')].every((d) => d.open)).toBe(true);
    tree.setActive('a.md');
    expect(btn.hasAttribute('aria-current')).toBe(false);
    expect(el.querySelectorAll('.active')).toHaveLength(1);
  });
});
