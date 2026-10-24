import { afterEach, describe, expect, it } from 'vitest';
import { mountFilesSidebar, normalizeFilesSidebar } from '../../src/core/files-sidebar';

const KEY = 'md-browser:files-sidebar';

describe('normalizeFilesSidebar', () => {
  it('is open unless saved as closed (boolean or the earlier bare string)', () => {
    expect(normalizeFilesSidebar(null)).toBe(true);
    expect(normalizeFilesSidebar(true)).toBe(true);
    expect(normalizeFilesSidebar('open')).toBe(true);
    expect(normalizeFilesSidebar(false)).toBe(false);
    expect(normalizeFilesSidebar('closed')).toBe(false);
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
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('hides both the toggle and the list when not available', () => {
    const { toggle, files, sidebar } = setup();
    sidebar.setAvailable(false);
    expect(toggle.hidden).toBe(true);
    expect(files.hidden).toBe(true);
  });
});
