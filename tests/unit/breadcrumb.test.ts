import { describe, expect, it, vi } from 'vitest';
import { createBreadcrumb } from '../../src/core/breadcrumb';

const texts = (el: HTMLElement) => [...el.querySelectorAll('li')].map((li) => li.textContent);

describe('createBreadcrumb', () => {
  it('shows the root, the folders and the file; folders are buttons that reveal their path', () => {
    const onFolder = vi.fn();
    const { el, set } = createBreadcrumb(onFolder);
    expect(el.hidden).toBe(true);
    set('sample/', 'docs/guide/setup.md', true);
    expect(el.hidden).toBe(false);
    expect(texts(el)).toEqual(['sample', 'docs', 'guide', 'setup.md']); // the label's trailing "/" is dropped
    expect([...el.querySelectorAll('button')].map((b) => b.dataset.dir)).toEqual(['', 'docs', 'docs/guide']);
    expect(el.querySelector('[aria-current="page"]')!.textContent).toBe('setup.md');
    expect(el.title).toBe('docs/guide/setup.md');
    el.querySelectorAll('button')[2].click();
    expect(onFolder).toHaveBeenCalledWith('docs/guide');
    el.querySelector('button')!.click();
    expect(onFolder).toHaveBeenLastCalledWith('');
  });

  it('uses plain text when the sidebar cannot show folders, and no root when there is none', () => {
    const { el, set } = createBreadcrumb(() => {});
    set('sample/', 'docs/a.md', false);
    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(texts(el)).toEqual(['sample', 'docs', 'a.md']);
    set(null, 'a.md', false);
    expect(texts(el)).toEqual(['a.md']);
    set(null, null, false);
    expect(el.hidden).toBe(true);
    expect(el.children).toHaveLength(0);
  });
});
