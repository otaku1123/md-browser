import { describe, expect, it } from 'vitest';
import { editorUrl, isValidTemplate, normalizeEditorSettings, visibleLine } from '../../src/core/editor-link';

describe('editorUrl', () => {
  it('builds VS Code and Cursor URLs from the file:// path, keeping its encoding', () => {
    expect(editorUrl({ editor: 'vscode', custom: '' }, '/Users/me/My%20Docs/a.md', 12)).toBe('vscode://file/Users/me/My%20Docs/a.md:12');
    expect(editorUrl({ editor: 'cursor', custom: '' }, '/Users/me/a.md', 1)).toBe('cursor://file/Users/me/a.md:1');
    // A Windows file URL's path starts with the drive: exactly what the editors expect after "file".
    expect(editorUrl({ editor: 'vscode', custom: '' }, '/C:/docs/a.md', 3)).toBe('vscode://file/C:/docs/a.md:3');
  });

  it('fills a custom template with the decoded path and the line', () => {
    const s = { editor: 'custom' as const, custom: 'idea://open?file={path}&line={line}' };
    expect(editorUrl(s, '/Users/me/My%20Docs/a.md', 7)).toBe('idea://open?file=/Users/me/My Docs/a.md&line=7');
    expect(editorUrl({ editor: 'custom', custom: 'zed://file{path}:{line}' }, '/a.md', 2)).toBe('zed://file/a.md:2');
  });

  it('is null when off or when the template is unusable', () => {
    expect(editorUrl({ editor: 'off', custom: 'vscode://file{path}' }, '/a.md', 1)).toBeNull();
    expect(editorUrl({ editor: 'custom', custom: '' }, '/a.md', 1)).toBeNull();
    expect(editorUrl({ editor: 'custom', custom: 'javascript:alert({path})' }, '/a.md', 1)).toBeNull();
    expect(editorUrl({ editor: 'custom', custom: 'open?file={path}' }, '/a.md', 1)).toBeNull();
  });
});

describe('isValidTemplate', () => {
  it('needs a scheme and refuses the ones that run in the page or the browser', () => {
    expect(isValidTemplate('vscode://file{path}:{line}')).toBe(true);
    expect(isValidTemplate('http://localhost:63342/api/file?file={path}&line={line}')).toBe(true);
    for (const bad of ['JavaScript:x', 'data:text/html,x', 'blob:x', 'file:///{path}', 'chrome://settings', 'about:blank', '{path}'])
      expect(isValidTemplate(bad), bad).toBe(false);
  });
});

describe('normalizeEditorSettings', () => {
  it('falls back to off and trims the template', () => {
    expect(normalizeEditorSettings(undefined)).toEqual({ editor: 'off', custom: '' });
    expect(normalizeEditorSettings({ editor: 'emacs', custom: 5 })).toEqual({ editor: 'off', custom: '' });
    expect(normalizeEditorSettings({ editor: 'custom', custom: '  zed://file{path} ' })).toEqual({ editor: 'custom', custom: 'zed://file{path}' });
    expect(normalizeEditorSettings({ editor: 'custom', custom: 'x'.repeat(600) }).custom).toHaveLength(500);
  });
});

describe('visibleLine', () => {
  it('takes the first block starting below the toolbar, or the last one above it', () => {
    document.body.innerHTML = '<main><p data-line="1"></p><ul data-line="4"><li data-line="4"></li><li data-line="9"></li></ul></main>';
    const tops: Record<string, number> = { '1': -300, '4': -100, '9': 120 };
    for (const el of document.querySelectorAll<HTMLElement>('[data-line]')) {
      const top = tops[el.dataset.line!]; // the list and its first item start together
      el.getBoundingClientRect = () => ({ top }) as DOMRect;
    }
    const main = document.querySelector('main')!;
    expect(visibleLine(main, 40)).toBe(9);
    expect(visibleLine(main, -150)).toBe(4);
    expect(visibleLine(main, -400)).toBe(1);
    expect(visibleLine(main, 200)).toBe(9); // every block starts above the toolbar: the last (deepest) one
    expect(visibleLine(document.createElement('div'), 40)).toBe(1);
  });
});
