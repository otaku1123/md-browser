import { afterEach, describe, expect, it } from 'vitest';
import { FILES_WIDTH_DEFAULT, FILES_WIDTH_MIN, mountFilesSidebar, normalizeFilesSidebar } from '../../src/core/files-sidebar';

const KEY = 'md-browser:files-sidebar';

describe('normalizeFilesSidebar', () => {
  it('reads the earlier open-only values (boolean or bare string) at the default width', () => {
    const at = (open: boolean) => ({ open, width: FILES_WIDTH_DEFAULT });
    expect(normalizeFilesSidebar(null)).toEqual(at(true));
    expect(normalizeFilesSidebar(true)).toEqual(at(true));
    expect(normalizeFilesSidebar('open')).toEqual(at(true));
    expect(normalizeFilesSidebar(false)).toEqual(at(false));
    expect(normalizeFilesSidebar('closed')).toEqual(at(false));
  });

  it('keeps a stored choice and clamps the width', () => {
    expect(normalizeFilesSidebar({ open: false, width: 300 })).toEqual({ open: false, width: 300 });
    expect(normalizeFilesSidebar({ width: 1 })).toEqual({ open: true, width: FILES_WIDTH_MIN });
    expect(normalizeFilesSidebar({ open: true, width: 'x' })).toEqual({ open: true, width: FILES_WIDTH_DEFAULT });
  });
});

describe('mountFilesSidebar (localStorage)', () => {
  afterEach(() => localStorage.clear());

  function setup() {
    const toggle = document.createElement('button');
    const files = document.createElement('nav');
    return { toggle, files, sidebar: mountFilesSidebar(toggle, files) };
  }

  it('keeps the earlier "closed" value and toggles it', async () => {
    localStorage.setItem(KEY, 'closed');
    const { toggle, files, sidebar } = setup();
    sidebar.setAvailable(true);
    await Promise.resolve();
    expect(toggle.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(files.hidden).toBe(true);
    toggle.click();
    expect(files.hidden).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(`{"open":true,"width":${FILES_WIDTH_DEFAULT}}`);
  });

  it('hides both the toggle and the list when not available', () => {
    const { toggle, files, sidebar } = setup();
    sidebar.setAvailable(false);
    expect(toggle.hidden).toBe(true);
    expect(files.hidden).toBe(true);
  });
});
