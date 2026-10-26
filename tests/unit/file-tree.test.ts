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

  it('offers no hide buttons without onHide, or when render() gets null', () => {
    const { el } = setup();
    expect(el.querySelector('.file-tree-hide')).toBeNull();
    const other = document.createElement('nav');
    const tree = createFileTree(other, vi.fn(), { onHide: vi.fn(), onUnhide: vi.fn() });
    tree.render(['docs/a.md', 'b.md'], null);
    expect(other.querySelector('.file-tree-hide')).toBeNull();
    expect(other.querySelector('.files-hidden')).toBeNull();
  });

  it('puts a hide button beside each folder (outside <summary>) and reports its path', () => {
    const el = document.createElement('nav');
    const onOpen = vi.fn();
    const onHide = vi.fn();
    const tree = createFileTree(el, onOpen, { onHide, onUnhide: vi.fn() });
    tree.render(['README.md', 'docs/guide.md', 'docs/api/ref.md']);
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.file-tree-hide')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Hide "docs" from the list', 'Hide "docs/api" from the list']);
    expect(el.querySelector('summary .file-tree-hide, summary button')).toBeNull();
    expect(buttons[0].parentElement!.querySelector(':scope > details > summary')!.textContent).toBe('docs');
    buttons[1].click();
    expect(onHide).toHaveBeenCalledWith('docs/api');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('lists hidden folders with a button that shows them again', () => {
    const el = document.createElement('nav');
    const onUnhide = vi.fn();
    const tree = createFileTree(el, vi.fn(), { onHide: vi.fn(), onUnhide });
    tree.render(['README.md', 'b.md'], ['docs', 'src/gen']);
    const section = el.querySelector('details.files-hidden')!;
    expect(section.querySelector('summary')!.textContent).toBe('Hidden folders (2)');
    expect([...section.querySelectorAll('.files-hidden-name')].map((n) => n.textContent)).toEqual(['docs', 'src/gen']);
    section.querySelector<HTMLButtonElement>('button[aria-label=\'Show "src/gen" in the list\']')!.click();
    expect(onUnhide).toHaveBeenCalledWith('src/gen');
    tree.render(['README.md', 'b.md'], []);
    expect(el.querySelector('.files-hidden')).toBeNull();
  });

  it('keeps the active document marked across a re-render, and the resize handle', () => {
    const el = document.createElement('nav');
    const handle = document.createElement('div');
    handle.className = 'panel-resizer';
    el.append(handle);
    const tree = createFileTree(el, vi.fn(), { onHide: vi.fn(), onUnhide: vi.fn() });
    tree.render(['a.md', 'docs/b.md', 'src/c.md']);
    tree.setActive('a.md');
    tree.render(['a.md', 'docs/b.md'], ['src']);
    expect(el.querySelector('[aria-current="page"]')!.getAttribute('data-path')).toBe('a.md');
    expect(el.lastElementChild).toBe(handle);
  });
});
