import { describe, expect, it, vi } from 'vitest';
import { scrollIntoPanel } from '../../src/core/scroll-into-panel';

function setup(panelRect: [number, number], elRect: [number, number]) {
  const panel = document.createElement('nav');
  const el = document.createElement('a');
  panel.append(el);
  panel.scrollTop = 100;
  const rect = ([top, bottom]: [number, number]) => () => ({ top, bottom }) as DOMRect;
  panel.getBoundingClientRect = rect(panelRect);
  el.getBoundingClientRect = rect(elRect);
  return { panel, el };
}

describe('scrollIntoPanel', () => {
  it('leaves the panel alone when the entry is visible', () => {
    const { panel, el } = setup([0, 300], [50, 80]);
    scrollIntoPanel(el, panel);
    expect(panel.scrollTop).toBe(100);
  });

  it('scrolls up to an entry above the visible part', () => {
    const { panel, el } = setup([100, 400], [60, 90]);
    scrollIntoPanel(el, panel);
    expect(panel.scrollTop).toBe(60);
  });

  it('scrolls down just enough for an entry below the visible part', () => {
    const { panel, el } = setup([0, 300], [320, 350]);
    scrollIntoPanel(el, panel);
    expect(panel.scrollTop).toBe(150);
  });

  it('never scrolls the page', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { panel, el } = setup([0, 300], [900, 930]);
    scrollIntoPanel(el, panel);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
