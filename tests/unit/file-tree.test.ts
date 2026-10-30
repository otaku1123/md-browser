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

describe('keyboard navigation', () => {
  function mount() {
    const el = document.createElement('nav');
    document.body.append(el);
    const onOpen = vi.fn();
    // Rows in order: docs, api, ref.md, guide.md, a.md, README.md.
    const tree = createFileTree(el, onOpen, { onHide: vi.fn(), onUnhide: vi.fn() });
    tree.render(['README.md', 'docs/guide.md', 'docs/api/ref.md', 'a.md']);
    const folder = (name: string) => [...el.querySelectorAll<HTMLDetailsElement>('details')].find((d) => d.querySelector('summary')!.textContent === name)!;
    const file = (path: string) => el.querySelector<HTMLElement>(`button[data-path="${path}"]`)!;
    const press = (target: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
      target.focus();
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(e);
      return e;
    };
    return { el, onOpen, folder, file, press, focused: () => document.activeElement };
  }

  it('moves between the visible rows with the arrow keys, Home and End', () => {
    const { el, folder, file, press, focused } = mount();
    const docs = folder('docs').querySelector('summary')!;
    const api = folder('api').querySelector('summary')!;
    expect(press(docs, 'ArrowDown').defaultPrevented).toBe(true);
    expect(focused()).toBe(api);
    press(api, 'ArrowDown');
    expect(focused()).toBe(file('docs/api/ref.md'));
    press(file('docs/api/ref.md'), 'ArrowUp');
    expect(focused()).toBe(api);
    press(api, 'End');
    expect(focused()).toBe(file('README.md'));
    press(file('README.md'), 'ArrowDown'); // the last row stays
    expect(focused()).toBe(file('README.md'));
    press(file('README.md'), 'Home');
    expect(focused()).toBe(docs);
    // A closed folder's rows are skipped.
    folder('docs').open = false;
    press(docs, 'ArrowDown');
    expect(focused()).toBe(file('a.md'));
    el.remove();
  });

  it('expands a folder with Right and enters it, collapses with Left and goes to the parent', () => {
    const { el, folder, file, press, focused } = mount();
    for (const d of el.querySelectorAll('details')) d.open = false;
    const docs = folder('docs').querySelector('summary')!;
    const api = folder('api').querySelector('summary')!;
    press(docs, 'ArrowRight');
    expect(folder('docs').open).toBe(true);
    expect(focused()).toBe(docs);
    press(docs, 'ArrowRight');
    expect(focused()).toBe(api);
    press(api, 'ArrowRight');
    press(api, 'ArrowRight');
    expect(folder('api').open).toBe(true);
    expect(focused()).toBe(file('docs/api/ref.md'));
    press(file('docs/api/ref.md'), 'ArrowLeft'); // a file: up to its folder
    expect(focused()).toBe(api);
    press(api, 'ArrowLeft');
    expect(folder('api').open).toBe(false);
    expect(focused()).toBe(api);
    press(api, 'ArrowLeft');
    expect(focused()).toBe(docs);
    press(docs, 'ArrowLeft');
    expect(folder('docs').open).toBe(false);
    expect(press(docs, 'ArrowLeft').defaultPrevented).toBe(true); // top level: nowhere to go, still no scroll
    expect(focused()).toBe(docs);
    el.remove();
  });

  it('leaves other keys, modified keys, files on Right and the hide buttons alone', () => {
    const { el, folder, file, press, onOpen } = mount();
    const docs = folder('docs').querySelector('summary')!;
    expect(press(docs, 'Enter').defaultPrevented).toBe(false);
    expect(press(docs, 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(docs, 'ArrowDown', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(press(file('a.md'), 'ArrowRight').defaultPrevented).toBe(false);
    expect(press(el.querySelector<HTMLElement>('.file-tree-hide')!, 'ArrowDown').defaultPrevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
    el.remove();
  });
});
