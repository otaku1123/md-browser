import { afterEach, describe, expect, it, vi } from 'vitest';
import { highlightLines, mountSourceView, TOC_SOURCE_CLASS } from '../../src/core/source-view';

function setup() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); // not implemented in jsdom
  document.body.innerHTML =
    '<header class="toolbar"><button class="icon-button toc-toggle"></button></header>' +
    '<div class="layout"><nav class="toc"></nav><main class="content"><h1>Preview</h1></main></div>';
  const toolbar = document.querySelector<HTMLElement>('.toolbar')!;
  const content = document.querySelector<HTMLElement>('.content')!;
  const tocEl = document.querySelector<HTMLElement>('.toc')!;
  const onToggle = vi.fn();
  const view = mountSourceView(toolbar, content, tocEl, onToggle);
  const button = toolbar.querySelector<HTMLButtonElement>('.source-toggle')!;
  const pane = document.querySelector<HTMLElement>('.source-view')!;
  return { view, button, pane, content, tocEl, onToggle };
}

const lineTexts = (pane: HTMLElement) => Array.from(pane.querySelectorAll('.source-line'), (l) => l.textContent);
const shortcut = (init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...init });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('highlightLines', () => {
  it('returns one entry per line, without a line for the final newline', () => {
    expect(highlightLines('# A\n\ntext\n')).toHaveLength(3);
    expect(highlightLines('a\r\nb')).toHaveLength(2);
    expect(highlightLines('')).toEqual(['']);
  });

  it('keeps each line balanced when a highlighted span crosses line breaks', () => {
    const lines = highlightLines('```\none\ntwo\n```');
    for (const line of lines) {
      const div = document.createElement('div');
      div.innerHTML = line;
      expect(div.innerHTML).toBe(line); // parsing changed nothing: tags are balanced
    }
    const div = document.createElement('div');
    div.innerHTML = lines[1];
    expect(div.querySelector('span')?.textContent).toBe('one');
  });

  it('escapes HTML in the source', () => {
    const [line] = highlightLines('<script>window.__x = 1</script>');
    expect(line).not.toContain('<script');
    const div = document.createElement('div');
    div.innerHTML = line;
    expect(div.textContent).toBe('<script>window.__x = 1</script>');
  });
});

describe('mountSourceView', () => {
  it('offers the toggle, before the TOC toggle, only once there is a document', () => {
    const { view, button } = setup();
    expect(button.nextElementSibling?.classList.contains('toc-toggle')).toBe(true);
    expect(button.hidden).toBe(true);
    view.setSource('# A');
    expect(button.hidden).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches between the preview and the numbered source, hiding the TOC meanwhile', () => {
    const { view, button, pane, content, tocEl, onToggle } = setup();
    view.setSource('# A\n\n<script>x</script>\n');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(content.hidden).toBe(true);
    expect(pane.hidden).toBe(false);
    expect(tocEl.classList.contains(TOC_SOURCE_CLASS)).toBe(true);
    expect(lineTexts(pane)).toEqual(['# A\n', '\n', '<script>x</script>']);
    expect(pane.querySelector('script')).toBeNull();
    expect(onToggle).toHaveBeenCalledTimes(1);

    button.click();
    expect(content.hidden).toBe(false);
    expect(pane.hidden).toBe(true);
    expect(tocEl.classList.contains(TOC_SOURCE_CLASS)).toBe(false);
  });

  it('refreshes the shown source on update and goes back to the preview on reset', () => {
    const { view, button, pane, content } = setup();
    view.setSource('one');
    button.click();
    view.setSource('one\ntwo');
    expect(lineTexts(pane)).toEqual(['one\n', 'two']);
    view.reset();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(content.hidden).toBe(false);
  });

  it('toggles with Ctrl/⌘+Shift+M, but not while typing', () => {
    const { view, button } = setup();
    view.setSource('x');
    document.dispatchEvent(shortcut());
    expect(button.getAttribute('aria-pressed')).toBe('true');
    document.dispatchEvent(shortcut({ ctrlKey: false, metaKey: true }));
    expect(button.getAttribute('aria-pressed')).toBe('false');
    document.dispatchEvent(shortcut({ shiftKey: false, key: 'm' }));
    expect(button.getAttribute('aria-pressed')).toBe('false');

    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(shortcut());
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('ignores the shortcut before a document is shown', () => {
    const { button } = setup();
    document.dispatchEvent(shortcut());
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('copies the whole raw source', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { view, button, pane } = setup();
    view.setSource('# A\r\n\ntext\n');
    button.click();
    pane.querySelector<HTMLButtonElement>('.copy-button')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('# A\r\n\ntext\n'));
  });
});
