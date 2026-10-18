import { afterEach, describe, expect, it, vi } from 'vitest';
import { addCopyButtons } from '../../src/core/code-copy';
import { renderMarkdown } from '../../src/core/render';

function rendered(src: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(src).html;
  addCopyButtons(root);
  document.body.replaceChildren(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('addCopyButtons', () => {
  it('adds one button per code block, but not to diagrams or front matter', () => {
    const root = rendered('---\na: 1\n---\n\n```ts\nconst a = 1;\n```\n\n```\nplain\n```\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n`inline`\n');
    expect(root.querySelectorAll('.code-block > pre + .copy-button')).toHaveLength(2);
    expect(root.querySelector('.diagram .copy-button, .front-matter .copy-button')).toBeNull();
  });

  it('is idempotent', () => {
    const root = rendered('```\nx\n```\n');
    addCopyButtons(root);
    expect(root.querySelectorAll('.copy-button')).toHaveLength(1);
  });

  it('copies the plain code text without the trailing newline', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const root = rendered('```ts\nconst a = 1;\nconsole.log(a);\n```\n');
    const button = root.querySelector<HTMLButtonElement>('.copy-button')!;
    button.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('const a = 1;\nconsole.log(a);'));
    await vi.waitFor(() => expect(button.classList.contains('done')).toBe(true));
    vi.unstubAllGlobals();
  });

  it('falls back to execCommand and reports failure when both fail', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const exec = vi.fn().mockReturnValue(false);
    document.execCommand = exec;
    const root = rendered('```\nx\n```\n');
    const button = root.querySelector<HTMLButtonElement>('.copy-button')!;
    button.click();
    await vi.waitFor(() => expect(button.classList.contains('failed')).toBe(true));
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('restores the label after a moment', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const root = rendered('```\nx\n```\n');
    const button = root.querySelector<HTMLButtonElement>('.copy-button')!;
    const label = button.textContent;
    button.click();
    await vi.waitFor(() => expect(button.textContent).not.toBe(label));
    vi.advanceTimersByTime(2000);
    expect(button.textContent).toBe(label);
    vi.unstubAllGlobals();
  });
});
